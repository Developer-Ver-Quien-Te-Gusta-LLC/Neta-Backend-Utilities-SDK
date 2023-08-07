// kv.js

const kvclient = require("cloudflare-workers-kv");
const axios = require("axios");
const { TextEncoder, TextDecoder } = require("util");
const { Client } = require('cassandra-driver');
const secrets = require("./AwsSecrets");
const express = require('express');
const app = express();

global.fetch = require('node-fetch');
var util = require('util');
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

const cassandra = require('cassandra-driver');


let dbClient;
var isClientConnected = false;
async function SetupClients(){
  const contactPoints = await secrets.FetchFromSecrets("contactPoints");
  const localDataCenter = await secrets.FetchFromSecrets("localDataCenter");
  const keyspace = await secrets.FetchFromSecrets("keyspace");
  const dbClient = new cassandra.Client({
    contactPoints: [contactPoints],
    localDataCenter: localDataCenter,
    keyspace: keyspace,
  });

  const variableBinding = await secrets.FetchFromSecrets("KVvariableBinding");
  const namespaceId = await secrets.FetchFromSecrets("KVnamespaceId");
  const accountId = await secrets.FetchFromSecrets("KVaccountId");
  const email = await secrets.FetchFromSecrets("KVemail");
  const apiKey = await secrets.FetchFromSecrets("KVApiKey");

  kvclient.init({
    variableBinding: variableBinding,
    namespaceId: namespaceId,
    accountId: accountId,
    email: email,
    apiKey: apiKey,
  });

  console.log("KV Client Connected");
  isClientConnected = true;
}
SetupClients();


async function getExperimentDataFromDB(keys) {
  const keyList = keys.map(key => `'${key}'`).join(', '); // Prepare keys for query
  const result = await dbClient.execute(`SELECT * FROM experiments WHERE key IN (${keyList})`);
  return result.rows;
}

/// altered to support destructuring
async function getKV(...keys) {
  return keys.length > 1 ? await GetValuesFromKV(keys) : await GetValueFromKV(keys[0]);
}

async function getKVOLD(key) {
  return Array.isArray(key) ? await GetValuesFromKV(key) : await GetValueFromKV(key);
}

async function resetExperimentData(key) {
  try {
    // Set the key's value to an initial state
    await kvclient.put(key, JSON.stringify({ Default: null, ABEnabled: false, Variants: {} }));
  } catch (error) {
    console.log("An error occurred while resetting the experiment:", error);
  }
}

// Reset experiment endpoint
app.get('/admin/reset/:key', async (req, res) => {
  const { key } = req.params;
  await resetExperimentData(key);
  res.json({ message: `Experiment with key ${key} was reset.`});
});

// Calculate lift and confidence
function calculateLift(originalRate, variantRate) {
  // Lift is calculated as (variant rate - control rate) / control rate
  return (variantRate - originalRate) / originalRate;
}

// Calculate z-score
function calculateZScore(originalRate, variantRate, originalTotal, variantTotal) {
  const p1 = originalRate;
  const p2 = variantRate;
  const n1 = originalTotal;
  const n2 = variantTotal;

  const p = (p1 * n1 + p2 * n2) / (n1 + n2);
  return (p2 - p1) / Math.sqrt(p * (1 - p) * (1/n1 + 1/n2));
}

// Calculate confidence level based on the z-score
function calculateConfidence(zScore) {
  // Use cumulative distribution function (CDF) for a standard normal distribution
  const pValue = 0.5 * (1 + erf(zScore / Math.sqrt(2)));

  // Convert p-value to confidence level
  return 1 - pValue;
}

// Approximation of error function (erf) using the Abramowitz and Stegun formula
function erf(x) {
  const sign = (x < 0) ? -1 : 1;
  x = Math.abs(x);

  const a1 =  0.254829592;
  const a2 = -0.284496736;
  const a3 =  1.421413741;
  const a4 = -1.453152027;
  const a5 =  1.061405429;
  const p  =  0.3275911;

  const t = 1.0 / (1.0 + p * x);
  const y = ((((a5 * t + a4) * t) + a3) * t + a2) * t + a1;
  return sign * (1 - y * Math.exp(-x * x));
}


// Admin reporting endpoint
app.get('/admin/report', async (req, res) => {
  const result = await dbClient.execute('SELECT * FROM experiments');
  const data = result.rows.map(row => {
    const originalRate = row.original_rate;
    const originalTotal = row.original_total; // You'll need to adjust your query to get this data
    const variantData = row.variants.map(variant => {
      const zScore = calculateZScore(originalRate, variant.rate, originalTotal, variant.total);
      return {
        variant: variant,
        rate: variant.rate,
        lift: calculateLift(originalRate, variant.rate),
        confidence: calculateConfidence(zScore),
      };
    });
    return { ...row, variantData };
  });  
  res.json(data);
});

const server = app.listen(8080, () => {
  console.log(`Server running on port ${server.address().port}`);
});

async function DetermineVariant(data, _key, PhoneNumber) {
  if (!data.ABEnabled) return { key: "default", value: data.Default }; // Check if AB testing is enabled
  
  const variantKeys = Object.keys(data.Variants);
  const variantPromises = variantKeys.map(variantKey => isUserInVariant(variantKey, PhoneNumber));
  const variantResults = await Promise.allSettled(variantPromises);
  
  for (let i = 0; i < variantResults.length; i++) {
    if (variantResults[i]) {
      const variantValue = data.Variants[variantKeys[i]];
      if (variantValue.Weights) {
        return { key: variantKeys[i], value: assignByWeight(variantValue.Weights) };
      }
      return { key: variantKeys[i], value: variantValue };
    }
  }

  // If no variants matched, return default
  return { key: "default", value: data.Default };
}

async function GetValueFromKV(key, PhoneNumber) {
   return GetValuesFromKV([key], PhoneNumber)
}

async function GetValuesFromKV(keys, PhoneNumber) {
  while (!isClientConnected) {
    console.log("attempting connection to KV client...");
    // Wait for a short period of time before checking the condition again.
    await new Promise((resolve) => setTimeout(resolve, 100)); // Adjust the time interval as needed.
  }
  const data = await kvclient.get(keys);
 
  let  fetchedValues;
  if(Array.isArray(data)){
    fetchedValues = data.map((dataItem) => JSON.parse(dataItem));

    const returnValues = await Promise.allSettled(
      fetchedValues.map(async (fetchedValue, index) => {
        if (fetchedValue.Default == null && fetchedValue != null) {
          return fetchedValue;
        } else {
          if (fetchedValue.ABEnabled && fetchedValue.Variants) {
            const variant = await DetermineVariant(
              fetchedValue,
              keys[index],
              PhoneNumber
            );
            return variant.value;
          } else {
            return fetchedValue.Default; // If AB testing is not enabled, return the default value
          }
        }
      })
    );
  }
  else{
   if(data.Default==null && data!=null){
    console.log(data,keys);
    return data;
   }
   else{
    
    if(data.ABEnabled && data.Variants){
      const variant = await DetermineVariant(data, keys, PhoneNumber);
      console.log(variant.value,keys);
      return variant.value;
    }
    else{
      console.log(data.Default,keys);
      return data.Default;
    }
   }
  }

  return returnValues;
}

function assignByWeight(weights) {
  const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0);
  let randomNum = Math.random() * totalWeight;

  for (let key of Object.keys(weights)) {
    if (randomNum < weights[key]) {
      return key;
    }
    randomNum -= weights[key];
  }
}

async function isUserInVariant(variantID, username) {
  const { URLSearchParams } = require("url");

  const encodedParams = new URLSearchParams();
  encodedParams.set("distinct_id", username);
  encodedParams.set("filter_by_cohort", '{"id":' + variantID + "}");

  const options = {
    method: "POST",
    url: "https://mixpanel.com/api/2.0/engage",
    headers: {
      accept: "application/json",
      "content-type": "application/x-www-form-urlencoded",
      authorization: await secrets.FetchFromSecrets("mixpanelBasicAuth"),
    },
    data: encodedParams,
  };

  const response = await axios.request(options);
  if (response.data.results.length > 0) {
    return true;
  } else {
    return false;
  }
}


async function SetKV(key, value) {
  await kvclient.put(key, value);
}
module.exports = {
  GetValueFromKV,
  isUserInVariant,
  SetKV,
  getKV
};
