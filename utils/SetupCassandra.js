const  cassandra  = require("cassandra-driver");
const  FetchFromSecrets  = require("./AwsSecrets.js").FetchFromSecrets;
const {getKV} = require("./KV.js");


let client;
async function SetupCassandraClient(_client) {
  if (client != undefined) return client;
  const contactPoints = await FetchFromSecrets("contactPoints");
  const localDataCenter = await FetchFromSecrets("localDataCenter");
  const keyspace = await FetchFromSecrets("keyspace");
  _client = new cassandra.Client({
    contactPoints: [contactPoints],
    localDataCenter: localDataCenter,
    keyspace: keyspace,
  });

  await _client.connect();
  console.log("Cassandra Client Connected");
  client = _client
  return _client;
}

SetupCassandraClient();
module.exports={SetupCassandraClient,c: client};
