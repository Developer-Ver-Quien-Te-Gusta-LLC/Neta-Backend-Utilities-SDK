const { CosmosClient } = require("@azure/cosmos");
const FetchFromSecrets = require('./AwsSecrets.js').FetchFromSecrets

async function SetupGeospatialDB(c = undefined) {
  const cosmosDbEndpoint = await FetchFromSecrets("CosmosDBSpatialEndpoint");
  const cosmosDbKey = await FetchFromSecrets("CosmosDBSpatialKey");
  const cosmosClient = new CosmosClient({ endpoint: cosmosDbEndpoint, key: cosmosDbKey });

  const databaseName = await FetchFromSecrets("CosmosDBSpatialDatabaseName");
  const database = cosmosClient.database(databaseName);

  const containerName = await FetchFromSecrets("CosmosDBSpatialContainerName");
  const container = database.container(containerName);
  c = container
  return container;
}


module.exports = {SetupGeospatialDB}