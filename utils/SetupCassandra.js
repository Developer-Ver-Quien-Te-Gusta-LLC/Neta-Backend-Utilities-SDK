const cassandra = require("cassandra-driver");
const FetchFromSecrets = require("./AwsSecrets.js").FetchFromSecrets;
const { getKV } = require("./KV.js");


let client;
async function SetupCassandraClient(_client) {
  if (client != undefined) return client;
  const contactPoints = String(await FetchFromSecrets("contactPoints"));
  const localDataCenter = String(await FetchFromSecrets("localDataCenter"));
  const keyspace = String(await FetchFromSecrets("keyspace"));

  console.log(contactPoints,localDataCenter,keyspace);
  
  _client = new cassandra.Client({
    contactPoints: [contactPoints],
    localDataCenter: localDataCenter,
    keyspace: keyspace,
  });
  
  try {
    await _client.connect();
    console.log("Cassandra Client Connected");
  }
  catch (err) {
    console.log("Cannot connect to cassandra client!");
  }


  client = _client
  return _client;
}


async function GetClient(dummyinput = null) {
  if (client === undefined) {
    return new Promise((resolve) => {
      const checkClient = setInterval(() => {
        if (client !== undefined) {
          clearInterval(checkClient);
          resolve(client);
        }
      }, 1000);
    });
  } else {
    return client;
  }
}



SetupCassandraClient();
module.exports = { SetupCassandraClient: GetClient, GetClient };
