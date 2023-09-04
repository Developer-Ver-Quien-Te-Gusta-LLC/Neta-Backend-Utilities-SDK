const MongoClient = require('mongodb').MongoClient;
const FetchFromSecrets = require('./AwsSecrets.js').FetchFromSecrets
let _db;

/*
async function SetupGeospatialDB() {
    const cosmosDbEndpoint = await FetchFromSecrets("CosmosDBSpatialEndpoint");
    const cosmosDbKey = await FetchFromSecrets("CosmosDBSpatialKey");
    const dbName = await FetchFromSecrets("CosmosDBSpatialDatabaseName");
    const client = await MongoClient.connect(cosmosDbEndpoint, {
        auth: {
            username: 'netaschools',
            password: cosmosDbKey
        }
    });

    _db = client.db(dbName);

    const collectionName = await FetchFromSecrets("CosmosDBSpatialContainerName");
    const collection = _db.collection(collectionName);

    // Ensure 2dsphere index
    await collection.createIndex({ location: "2dsphere" });

    return collection;
}*/

async function SetupGeospatialDB() {
  const connectionString = "mongodb://netaschools:568eSJWdummLG5BY5NtDJC1rUFlQ1prabo8VFuvm8yG9RuKBFGr4QEhRyRv7kKMhK9lScIFrASdcACDb7Skqog==@netaschools.mongo.cosmos.azure.com:10255/?ssl=true&replicaSet=globaldb&retrywrites=false&maxIdleTimeMS=120000&appName=@netaschools@";
    const dbName = "schools";  // change this to your database name if different
    let client;
    try {
        client = await MongoClient.connect(connectionString, { useNewUrlParser: true, useUnifiedTopology: true });
        console.log("Successfully connected to the database!");

        return client;
    } catch (error) {
        console.error("Error connecting to the database:", error);
    } finally {
        if (client) {
            //await client.close();
        }
    }
}

module.exports = { SetupGeospatialDB }
