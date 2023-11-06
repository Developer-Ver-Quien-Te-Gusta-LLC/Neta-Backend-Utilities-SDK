const {SecretManagerServiceClient} = require('@google-cloud/secret-manager');
const projectID = "massive-boulder-403908";


//fetch the accessid with the given key using AWS Secrets Manager
async function FetchFromSecrets(key) {
  try{
  const client = new SecretManagerServiceClient();
  const [version] = await client.accessSecretVersion({
    name: `projects/${projectID}/secrets/${key}/versions/latest`,
  });

  const payload = version.payload.data.toString('utf8');
  //console.log(payload);
  return payload;
}
catch (error) {
  console.error(`Failed to fetch secret ${secretName}:`, error);
 // throw error;
}
}


module.exports = { FetchFromSecrets };
