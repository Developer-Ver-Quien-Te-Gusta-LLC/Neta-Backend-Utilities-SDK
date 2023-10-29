const  FetchFromSecrets  = require("./AwsSecrets.js").FetchFromSecrets;
const neo4j = require("neo4j-driver");

let client;
async function Setup(_client) {
  if (client != undefined) return client;
  const neo4jUrl = await FetchFromSecrets("neo4jendpoint");
  const neo4jPW = await FetchFromSecrets("neo4jpassword");
  _client = neo4j.driver(neo4jUrl, neo4j.auth.basic("neo4j", neo4jPW));
  console.log("Neo4j Client Connected");
  client = _client
  return _client;
}


  async function FetchClient(dummyinput=null){
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

  Setup();
module.exports={SetupNeo4jClient:FetchClient,FetchClient};
