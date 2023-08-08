const AWS = require("aws-sdk");
const { SecretsManagerClient, GetSecretValueCommand } = require("@aws-sdk/client-secrets-manager");


//for testing locally
const prod = false;

if (!prod) {
  AWS.config.update({
    region: "us-east-1",
    
  });

  console.log("not prod");
}

const client = new SecretsManagerClient(AWS.config);

//fetch the accessid with the given key using AWS Secrets Manager
async function FetchFromSecrets(key) {
  let response;

  try {
    response = await client.send(
      new GetSecretValueCommand({
        SecretId: key,
        VersionStage: "AWSCURRENT", // VersionStage defaults to AWSCURRENT if unspecified
      })
    );
  } catch (error) {
    throw error;
  }

  if (response.SecretString) {
    //console.log(response.SecretString);
    const returnData = JSON.parse(response.SecretString);
    const firstKey = Object.keys(returnData)[0];
    const firstValue = returnData[firstKey];

    return firstValue  // return the secret
  } else {
    // if SecretString is undefined
    let buff = Buffer.from(response.SecretBinary, "base64");
    let secret = buff.toString("ascii");
    //console.log(secret);

    const returnData = JSON.parse(secret);
    const firstKey = Object.keys(returnData)[0];
    const firstValue = data[firstKey];
    return firstValue  // return the secret
  }
}

module.exports = {FetchFromSecrets};
