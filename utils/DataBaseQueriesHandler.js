const gremlin = require('gremlin');
const AWS = require('aws-sdk');
const cassandra = require('cassandra-driver');
const  FetchFromSecrets  = require('./AwsSecrets.js').FetchFromSecrets;

var NeptuneConnection,client;
async function fetchCassandra() {

  const contactPoints = await FetchFromSecrets("contactPoints");
    const localDataCenter = await FetchFromSecrets("localDataCenter");
    const keyspace = await FetchFromSecrets("keyspace");

    client = new cassandra.Client({
        contactPoints: [contactPoints],
        localDataCenter: localDataCenter,
        keyspace:keyspace,
    });
  await client.connect();

  NeptuneConnection = {
  endpoint: await FetchFromSecrets("NeptuneEndpoint"),
  port: await FetchFromSecrets("NeptunePort"), 
  region: process.env.AWS_REGION,
};

 
}
fetchCassandra();

/*if (!process.env.prod) {
  AWS.config.update({
    region: process.env.AWS_REGION,
    accessKeyId: await FetchFromSecrets("AccessKey"),
    secretAccessKey: await FetchFromSecrets("SecretKey"),
  });
} // use credentials if not in prod , else use IAM role for ec2 instance*/

const cognitoidentityserviceprovider = new AWS.CognitoIdentityServiceProvider();
 

const Neptune = new AWS.Neptune();
const DriverRemoteConnection = gremlin.driver.DriverRemoteConnection;
const Graph = gremlin.structure.Graph;

// Fetch data from Neptune (for the given phone number)
async function getDataFromNeptune(uid, data) {
  const dc = new DriverRemoteConnection(
    `wss://${NeptuneConnection.endpoint}:${NeptuneConnection.port}/gremlin`
  );

  const graph = new Graph();
  const g = graph.traversal().withRemote(dc);

  let _data = 0;
  try {
    const query = g.V().has("uid", uid).values(data);
    const result = await query.toList();
    if (result.length > 0) {
      _data = result[0];
    } else {
      console.error("No player found with the provided phone number");
    }
  } catch (error) {
    console.error("Error querying Neptune", error);
  } finally {
    dc.close();
  }
  return _data;
}

// Fetch data from ScyllaDB (for the given phone number)
async function getDataFromScyalla(tableName, uid, data) {
  const query = `SELECT ${data} FROM ${tableName} WHERE uid = ?`; //ScyllaDB query to fetch data

  try {
    const result = await client.execute(query, [uid], {
      prepare: true,
    });
    const row = result.first();
    if (row) {
      return row[data];
    } else {
      console.error("No player found with the provided phone number");
    }
  } catch (err) {
    console.error("Error executing query", err);
  }
}

// Insert data in ScyllaDB (for the given phone number)
// data refers to the column name and value is the data to be inserted
async function InsertDataInScylla(uid, data, value) {
  const query = `UPDATE users SET ${data} = ? WHERE uid = ?`; //ScyllaDB query to insert data

  try {
    await client.execute(query, [value, phoneNumber], { prepare: true });
  } catch (err) {
    console.error("Error executing query", err);
  }
}

// Update data in ScyallaDB (for the given phone number)
// data refers to the column name and value is the data to be inserted
async function UpdateDataInScyallaDB(uid, data, value,table) {
  var query;
  if(table != undefined || table!=null) query = `UPDATE users SET ${data} = ${data} + ${value} WHERE uid = ?`; //ScyllaDB query to update data
 else query = `UPDATE ${table} SET ${data} = ${data} + ${value} WHERE uid = ?`;
  try {
    await client.execute(query, [uid], { prepare: true });
  } catch (err) {
    console.error("Error executing query", err);
  }
}

// Update data in ScyallaDB (for the given phone number) with TTL mapped to the params
// Note : TTL is in milliseconds
async function UpdateDataInScyllaDBTTL(uid, data, value, ttl) {
  const query = `UPDATE users USING TTL ${ttl} SET ${data} = ${value}  WHERE uid = ?`;

  try {
    await client.execute(query, [uid], { prepare: true });
  } catch (err) {
    console.error("Error executing query", err);
  }
}

// Update data in Neptune (for the given phone number)
async function UpdateDataInNeptune(uid, data, value) {
  const dc = new DriverRemoteConnection(
    `wss://${NeptuneConnection.endpoint}:${NeptuneConnection.port}/gremlin`
  );

  const graph = new Graph();
  const g = graph.traversal().withRemote(dc);

  try {
    const query = g
      .V()
      .has("uid", uid)
      .property(data, value)
      .next();
    await query;
  } catch (error) {
    console.error("Error querying Neptune", error);
  }
}

async function AddFriendRelationInNeptune(uid, friend) {
  try {
    const encryptedUser1Id = uid;
    const encryptedUser2Id = friend;

    const query = `
      g.V().has('User', 'uid', '${uid}')
        .addE('FRIENDS_WITH')
        .to(g.V().has('User', 'username', ${friend}))
    `;

    return gremlinQuery(query).then((response) => {
      if (!response.success) {
        ServiceBus.handleTransactionError("graphdb", req.query);
      }

      return { success: true, data: response.result.data }; // Return the success response
    });
  } catch (encryptionerror) {
    return encryptionerror;
  }
}

// Fetch and return a user's top friends
//TODO: Fetch limit to return from KV

// Execute a custom query on ScyllaDB (for testing , can move over to prod after some testing)
async function ExecuteCustomScyllaQuery(query) {
  try {
    const result = await client.execute(query, user_id, { prepare: true });
    return result.rows;
  } catch (err) {
    console.error("An error occurred", err);
    throw err;
  }
}

async function removeFriendsRelation(uid, friend) {
  try {
    // Encrypt user IDs if necessary
    const encryptedUser1Id = uid;
    const encryptedUser2Id = friend;

    const query = `
      g.V().has('User', 'username', '${uid}')
        .outE('FRIENDS_WITH')
        .where(inV().has('User', 'username', '${friend}'))
        .drop()
    `;

    return gremlinQuery(query).then((response) => {
      if (!response.success) {
        ServiceBus.handleTransactionError("graphdb", req.query);
      }

      return { success: true, data: response.result.data }; // Return the success response
    });
  } catch (encryptionerror) {
    return encryptionerror;
  }
}


module.exports= {
  FetchTopFriendsAndPolls,
  getDataFromNeptune,
  getDataFromScyalla,
  InsertDataInScylla,
  UpdateDataInNeptune,
  //FetchInitialPolls,
  UpdateDataInScyallaDB,
  UpdateDataInScyllaDBTTL,
  ExecuteCustomScyllaQuery,
  AddFriendRelationInNeptune,
  removeFriendsRelation,
  listFriends
  //QuerySchools,
};
