const cassandra = require("cassandra-driver");
const FetchFromSecrets = require("./AwsSecrets.js").FetchFromSecrets;
const { getKV } = require("./KV.js");


let client;
async function SetupCassandraClient(_client) {
  if (client != undefined) return client;
  const contactPoints = String(await FetchFromSecrets("contactPoints"));
  const localDataCenter = String(await FetchFromSecrets("localDataCenter"));
  const keyspace = String(await FetchFromSecrets("keyspace"));

  //console.log(contactPoints,localDataCenter,keyspace);
  
  _client = new cassandra.Client({
    contactPoints: [contactPoints],
    localDataCenter: localDataCenter,
    keyspace: keyspace,
  });

  let attempts = 0;
  while (attempts < 3) {
    try {
      await _client.connect();
      console.log("Cassandra Client Connected");
      break;
    }
    catch (err) {
      attempts++;
      if (attempts >= 3) {
        console.error("Cannot connect to cassandra client after 3 attempts!");
        throw new Error("Cannot connect to cassandra client after 3 attempts!");
      } else {
        console.error(`Attempt ${attempts}: Failed to connect to cassandra client.`);
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
      clientPromise = SetupCassandraClient().catch(err => {
        clientPromise = null;
        throw err;
      });
    }
    client = await clientPromise;
  }
  return client;
}

module.exports = { SetupCassandraClient: GetClient, GetClient };
