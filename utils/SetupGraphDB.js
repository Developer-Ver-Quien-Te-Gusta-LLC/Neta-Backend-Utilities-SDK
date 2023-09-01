//#region vars and refs
const gremlin = require('gremlin');
const traversal = gremlin.process.AnonymousTraversalSource.traversal;
const DriverRemoteConnection = gremlin.driver.DriverRemoteConnection;
const Graph = gremlin.structure.Graph;
let stored;
const {FetchFromSecrets} = require('./AwsSecrets')
let cosmosDBUsername;

async function fetchSecrets() {
    // Implement the logic to retrieve secrets from your secret manager.
    // This is just a placeholder and will vary based on your secret management solution.
    cosmosDBUsername = await FetchFromSecrets("CosmosDBUsername")
    return {
        endpoint: await FetchFromSecrets("CosmosDBEndpoint"),//"wss://usergraph.gremlin.cosmos.azure.com:443/",
        primaryKey: await FetchFromSecrets("CosmosDBPrimaryKey") //"yourPrimaryKeyHere"
    };
}
fetchSecrets()

function SetupGraphDB(temp = null) {
    if (stored) return stored;

    const graph = new Graph();

    fetchSecrets().then(secrets => {
        graph
            .traversal()
            .withRemote(new DriverRemoteConnection(secrets.endpoint, {
                "auth": {
                    "username": cosmosDBUsername, //"/dbs/<your-db-name>/colls/<your-coll-name>",
                    "password": secrets.primaryKey
                }
            }))
            .then(g => {
                stored = g;
                temp = g;
            });
    });

    stored = graph;
    temp = graph
    return graph;
}

module.exports = { SetupGraphDB };
