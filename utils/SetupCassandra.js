const  cassandra  = require("cassandra-driver");
const  FetchFromSecrets  = require("./AwsSecrets.js").FetchFromSecrets;
const {getKV} = require("./KV.js");


let c;
async function SetupCassandraClient(client) {
  if (c != undefined) return c;
  const contactPoints = await FetchFromSecrets("contactPoints");
  const localDataCenter = await FetchFromSecrets("localDataCenter");
  const keyspace = await FetchFromSecrets("keyspace");
  client = new cassandra.Client({
    contactPoints: [contactPoints],
    localDataCenter: localDataCenter,
    keyspace: keyspace,
  });

  await client.connect();
  console.log("Cassandra Client Connected");
  c = client
  return client;
}

module.exports={SetupCassandraClient};
