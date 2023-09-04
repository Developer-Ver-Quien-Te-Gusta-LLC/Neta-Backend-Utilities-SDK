const MongoClient = require('mongodb').MongoClient;
const FetchFromSecrets = require('./AwsSecrets.js').FetchFromSecrets
let _db;

async function SetupGeospatialDB() {
    const cosmosDbEndpoint = await FetchFromSecrets("CosmosDBSpatialEndpoint");
    const cosmosDbKey = await FetchFromSecrets("CosmosDBSpatialKey");
    const dbName = await FetchFromSecrets("CosmosDBSpatialDatabaseName");
    const client = await MongoClient.connect(cosmosDbEndpoint, { 
        useNewUrlParser: true, 
        useUnifiedTopology: true,
        auth: {
            user: 'admin',
            password: cosmosDbKey
        }
    });

    _db = client.db(dbName);

    const collectionName = await FetchFromSecrets("CosmosDBSpatialContainerName");
    const collection = _db.collection(collectionName);

    // Ensure 2dsphere index
    await collection.createIndex({ location: "2dsphere" });

    return collection;
}

module.exports = { SetupGeospatialDB }
