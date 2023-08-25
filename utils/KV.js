const admin = require('firebase-admin');

const FetchFromSecrets = require("./AwsSecrets.js").FetchFromSecrets;

var isClientConnected = false;

let credentials;
//#region Setup
async function SetupClients() {
  

  credentials = await FetchFromSecrets("FCMAccountCredentials");
 
  admin.initializeApp({
    credential: admin.credential.cert(credentials),
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

async function fetchRemoteConfig(key) {
  try {
    // Fetch the remote config template
    const template = await admin.remoteConfig().getTemplate();
    const parameter = template.parameters[key];

    if (parameter) {
      console.log(`Value for key 'your_key' is: ${parameter.defaultValue.value}`);
      return parameter.defaultValue.value;
    } else {
      console.log(`Key 'your_key' is not found in the remote config.`);
    }
  } catch (err) {
    console.error('Error fetching remote config:', err);
  }
}

module.exports = { getKV:fetchRemoteConfig };
