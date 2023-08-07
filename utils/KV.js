import kvclient from "cloudflare-workers-kv";
import axios from "axios";
import { TextEncoder, TextDecoder } from "util";
import { Client } from "cassandra-driver";
import {FetchFromSecrets} from "./AwsSecrets.js";
import fetch from "node-fetch";
import cassandra from "cassandra-driver";
import { URLSearchParams } from "url";


global.fetch = fetch;
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

let dbClient;
var isClientConnected = false;

async function SetupClients() {
  const contactPoints = await FetchFromSecrets("contactPoints");
  const localDataCenter = await FetchFromSecrets("localDataCenter");
  const keyspace = await FetchFromSecrets("keyspace");
  const dbClient = new cassandra.Client({
    contactPoints: [contactPoints],
    localDataCenter: localDataCenter,
    keyspace: keyspace,
  });

  dbClient.connect();

  const variableBinding = await FetchFromSecrets("KVvariableBinding");
  const namespaceId = await FetchFromSecrets("KVnamespaceId");
  const accountId = await FetchFromSecrets("KVaccountId");
  const email = await FetchFromSecrets("KVemail");
  const apiKey = await FetchFromSecrets("KVApiKey");

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

/// altered to support destructuring
async function getKV(...keys) {
  return keys.length > 1
    ? await GetValuesFromKV(keys)
    : await GetValueFromKV(keys[0]);
}

async function GetValueFromKV(key, PhoneNumber) {
  return GetValuesFromKV([key], PhoneNumber);
}

async function GetValuesFromKV(keys, PhoneNumber) {
  while (!isClientConnected) {
    console.log("attempting connection to KV client...");
    // Wait for a short period of time before checking the condition again.
    await new Promise((resolve) => setTimeout(resolve, 100)); // Adjust the time interval as needed.
  }
  const data = await kvclient.get(keys);

  let fetchedValues;
  if (Array.isArray(data)) {
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
  } else {
    if (data.Default == null && data != null) {
      console.log(data, keys);
      return data;
    } else {
      if (data.ABEnabled && data.Variants) {
        const variant = await DetermineVariant(data, keys, PhoneNumber);
        console.log(variant.value, keys);
        return variant.value;
      } else {
        console.log(data.Default, keys);
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
async function DetermineVariant(data, _key, PhoneNumber) {
  if (!data.ABEnabled) return { key: "default", value: data.Default }; // Check if AB testing is enabled

  const variantKeys = Object.keys(data.Variants);
  const variantPromises = variantKeys.map((variantKey) =>
    isUserInVariant(variantKey, PhoneNumber)
  );
  const variantResults = await Promise.allSettled(variantPromises);

  for (let i = 0; i < variantResults.length; i++) {
    if (variantResults[i]) {
      const variantValue = data.Variants[variantKeys[i]];
      if (variantValue.Weights) {
        return {
          key: variantKeys[i],
          value: assignByWeight(variantValue.Weights),
        };
      }
      return { key: variantKeys[i], value: variantValue };
    }
  }

  // If no variants matched, return default
  return { key: "default", value: data.Default };
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
      authorization: await FetchFromSecrets("mixpanelBasicAuth"),
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
export { GetValueFromKV, isUserInVariant, SetKV, getKV };
