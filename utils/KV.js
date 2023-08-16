const kvclient = require("cloudflare-workers-kv");
const axios = require("axios");
const { TextEncoder, TextDecoder } = require("util");
const FetchFromSecrets = require("./AwsSecrets.js").FetchFromSecrets;

global.TextEncoder = require("util").TextEncoder;
global.TextDecoder = require("util").TextDecoder;

import('node-fetch').then(nodeFetch => {
  global.fetch = nodeFetch;
});

var isClientConnected = false;
//#region Setup
async function SetupClients() {
  const variableBinding = await FetchFromSecrets("KVvariableBinding");
  const namespaceId = await FetchFromSecrets("KVnamespaceId");
  const accountId = await FetchFromSecrets("KVaccountId");
  const email = await FetchFromSecrets("KVemail");
  const apiKey = await FetchFromSecrets("KVApiKey");

  await kvclient.init({
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
//#endregion

/// altered to support destructuring
async function getKV(...keys) {
  var data = [];
  for (i = 0; i < keys.length; i++) {
    const FetchedValue = await kvclient.get(keys[i]);
    data.push(FetchedValue);

    if (data.length > 1) {
      return data;
    } else {
      return data[0];
    }
  }
}

async function SetKV(key, value) {
  await kvclient.put(key, value);
}

module.exports = { getKV,SetKV };
