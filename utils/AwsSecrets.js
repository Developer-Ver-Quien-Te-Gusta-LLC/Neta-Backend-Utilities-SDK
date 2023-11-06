const {SecretManagerServiceClient} = require('@google-cloud/secret-manager');
const projectID = "massive-boulder-403908";


const client = new SecretManagerServiceClient();
//fetch the accessid with the given key using AWS Secrets Manager
async function FetchFromSecrets(key) {
  try{
  const [version] = await client.accessSecretVersion({
    name: `projects/${projectID}/secrets/${key}/versions/latest`,
  }, {timeout: 120000}); // timeout in milliseconds

  const payload = version.payload.data.toString('utf8');
  //console.log(payload);
  return payload;
}
catch (error) {
  console.error(`Failed to fetch secret ${key}:`, error);
 // throw error;
}
}


module.exports = { FetchFromSecrets };
