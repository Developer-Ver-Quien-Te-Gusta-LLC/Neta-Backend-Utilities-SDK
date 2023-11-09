const neo4j = require("neo4j-driver");
const FetchFromSecrets = require("./AwsSecrets.js").FetchFromSecrets;

let client;
async function SetupNeo4jClient(_client) {
  if (client != undefined) return client;
  const neo4jUrl = String(await FetchFromSecrets("neo4jendpoint"));
  const neo4jPW = String(await FetchFromSecrets("neo4jpassword"));
  
  _client = neo4j.driver(neo4jUrl, neo4j.auth.basic("neo4j", neo4jPW));

  let attempts = 0;
  while (attempts < 3) {
    try {
      await _client.verifyConnectivity();
      console.log("Neo4j Client Connected");
      break;
    }
    catch (err) {
      attempts++;
      if (attempts >= 3) {
        console.error("Cannot connect to Neo4j client after 3 attempts!");
        throw new Error("Cannot connect to Neo4j client after 3 attempts!");
      } else {
        console.error(`Attempt ${attempts}: Failed to connect to Neo4j client.`);
      }
    }
  }

  client = _client
  return _client;
}

let clientPromise = null;

async function GetClient(dummyinput = null) {
  if (client === undefined) {
    if (clientPromise === null) {
      clientPromise = SetupNeo4jClient().catch(err => {
        clientPromise = null;
        throw err;
      });
    }
    client = await clientPromise;
  }
  return client;
}

module.exports = { SetupNeo4jClient: GetClient, GetClient };
