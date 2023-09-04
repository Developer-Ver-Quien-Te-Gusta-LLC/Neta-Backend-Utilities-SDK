//#region vars and refs
const gremlin = require('gremlin');
const traversal = gremlin.process.AnonymousTraversalSource.traversal;
const DriverRemoteConnection = gremlin.driver.DriverRemoteConnection;
//const Graph = gremlin.structure.Graph;

let stored;
const {FetchFromSecrets} = require('./AwsSecrets')


async function fetchSecrets() {
    // Implement the logic to retrieve secrets from your secret manager.
    // This is just a placeholder and will vary based on your secret management solution.

    return {
        endpoint: await FetchFromSecrets("CosmosDBEndpoint"),//"wss://usergraph.gremlin.cosmos.azure.com:443/",
        primaryKey: await FetchFromSecrets("CosmosDBPrimaryKey") ,//"yourPrimaryKeyHere",
        cosmosDBUsername : await FetchFromSecrets("CosmosDBUsername")
    };
}


var secrets;

async function SetupGraphDB() {
    if (stored) return stored;
   
    secrets = await fetchSecrets();
   // console.log(secrets.cosmosDBUsername)
   
    const cosmosDBUsername = secrets.cosmosDBUsername
    const authenticator = new gremlin.driver.auth.PlainTextSaslAuthenticator(cosmosDBUsername, secrets.primaryKey)
    const client = new gremlin.driver.Client(
        secrets.endpoint,
        { 
            traversalsource : "g",
            authenticator,
            rejectUnauthorized : true,
            mimeType : "application/vnd.gremlin-v2.0+json"
        }
    );
    console.log("Gremlin Client Set Up");
    const g = traversal().withRemote(new DriverRemoteConnection(secrets.endpoint, { authenticator }));
    return client;
}

module.exports = { SetupGraphDB };
