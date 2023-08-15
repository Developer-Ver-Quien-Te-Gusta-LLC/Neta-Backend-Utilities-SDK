const AWS = require("aws-sdk");
const SecretsManager = new AWS.SecretsManager();

//fetch the accessid with the given key using AWS Secrets Manager
async function FetchFromSecrets(secretKey, dataKey = 0) {
  let response;
  console.log("Trying To Fetch " + secretKey);

  try {
    response = await SecretsManager.getSecretValue({
      SecretId: secretKey,
      VersionStage: "AWSCURRENT", // VersionStage defaults to AWSCURRENT if unspecified
    }).promise();
  } catch (error) {
    console.log("Failed to fetch " + secretKey);
    throw error;
  }

  let parsedSecret;
  
  if (response.SecretString) {
    parsedSecret = JSON.parse(response.SecretString);
  } else {
    // if SecretString is undefined
    let buff = Buffer.from(response.SecretBinary, "base64");
    let secret = buff.toString("ascii");
    parsedSecret = JSON.parse(secret);
  }

  const keyValue = parsedSecret[dataKey]; // use the provided key or the default of 0
  
  if (keyValue) {
    console.log("Fetched " + secretKey);
    return keyValue;
  } else {
    throw new Error(`Failed to find data with key ${dataKey} in secret ${secretKey}`);
  }
}


module.exports = { FetchFromSecrets };
