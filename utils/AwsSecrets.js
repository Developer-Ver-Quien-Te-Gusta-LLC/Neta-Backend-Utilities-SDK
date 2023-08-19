const AWS = require("aws-sdk");
AWS.config.update({ region: 'us-east-1' });
const SecretsManager = new AWS.SecretsManager();

//fetch the accessid with the given key using AWS Secrets Manager
async function FetchFromSecrets(key) {
  let response;
  console.log("Trying To Fetch"+key);

  try {
    response = await SecretsManager.getSecretValue({
      SecretId: key,
      VersionStage: "AWSCURRENT", // VersionStage defaults to AWSCURRENT if unspecified
    }).promise();
  } catch (error) {
    console.log("Failed to fetch " + key);
    throw error;
  }

  
  if (response.SecretString) {
    //console.log(response.SecretString);
    const returnData = JSON.parse(response.SecretString);
    const firstKey = Object.keys(returnData)[0];
    const firstValue = returnData[firstKey];
    console.log("Fetched" + key);
    return firstValue; // return the secret
  } else {
    // if SecretString is undefined
    let buff = Buffer.from(response.SecretBinary, "base64");
    let secret = buff.toString("ascii");

    const returnData = JSON.parse(secret);
    const firstKey = Object.keys(returnData)[0];
    const firstValue = returnData[firstKey]; // Fixed reference to correct variable
    console.log("Fetched" + key);
    return firstValue; // return the secret
  }
}


module.exports = { FetchFromSecrets };
