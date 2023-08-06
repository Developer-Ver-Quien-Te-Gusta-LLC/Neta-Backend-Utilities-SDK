const gremlin = require("gremlin");

const AWS = require("aws-sdk");
const cassandra = require("cassandra-driver");

let client;
import{FetchFromSecrets} from "../index.js";

async function fetchCassandra() {
  client = new cassandra.Client({
    contactPoints: await FetchFromSecrets("contactPoints"),
    localDataCenter: await FetchFromSecrets("localDataCenter"),
    keyspace: await FetchFromSecrets("keyspace"),
  });

  return client;
}
fetchCassandra();


NeptuneConnection = {
  endpoint: await FetchFromSecrets("your-neptune-endpoint"),
  port: "default-Neptune-port", // shouldn't this be from secrets?
  region: await FetchFromSecrets("neptune-region"),
};

if (!process.env.prod) {
  AWS.config.update({
    region: await FetchFromSecrets("region"),
    accessKeyId: await FetchFromSecrets("AccessKey"),
    secretAccessKey: await FetchFromSecrets("SecretKey"),
  });
} // use credentials if not in prod , else use IAM role for ec2 instance

const cognitoidentityserviceprovider = new AWS.CognitoIdentityServiceProvider();
const userPoolId = await FetchFromSecrets("UserPoolID"); // Insert your user pool id here

const Neptune = new AWS.Neptune();
const DriverRemoteConnection = gremlin.driver.DriverRemoteConnection;
const Graph = gremlin.structure.Graph;

// Fetch data from Neptune (for the given phone number)
async function getDataFromNeptune(phoneNumber, data) {
  const dc = new DriverRemoteConnection(
    `wss://${NeptuneConnection.endpoint}:${NeptuneConnection.port}/gremlin`
  );

  const graph = new Graph();
  const g = graph.traversal().withRemote(dc);

  let _data = 0;
  try {
    const query = g.V().has("phoneNumber", phoneNumber).values(data);
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
async function getDataFromScyalla(tableName, phoneNumber, data) {
  const query = `SELECT ${data} FROM ${tableName} WHERE phoneNumber = ?`; //ScyllaDB query to fetch data

  try {
    const result = await client.execute(query, [phoneNumber], {
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

// Fetch user attributes from Cognito (for the given phone number)
async function FetchCognitoData(phoneNumber) {
  const params = {
    UserPoolId: userPoolId,
    Username: phoneNumber,
  };

  try {
    const data = await cognitoidentityserviceprovider
      .adminGetUser(params)
      .promise();

    const userAttributes = {};

    data.UserAttributes.forEach((attribute) => {
      userAttributes[attribute.Name] = attribute.Value;
    });

    return userAttributes;
  } catch (error) {
    console.error(error);
  }
}

// Insert data in ScyllaDB (for the given phone number)
// data refers to the column name and value is the data to be inserted
async function InsertDataInScylla(phoneNumber, data, value) {
  const query = `UPDATE users SET ${data} = ? WHERE phoneNumber = ?`; //ScyllaDB query to insert data

  try {
    await client.execute(query, [value, phoneNumber], { prepare: true });
  } catch (err) {
    console.error("Error executing query", err);
  }
}

// Update data in ScyallaDB (for the given phone number)
// data refers to the column name and value is the data to be inserted
async function UpdateDataInScyallaDB(phoneNumber, data, value) {
  const query = `UPDATE users SET ${data} = ${data} + ${value} WHERE phoneNumber = ?`; //ScyllaDB query to update data

  try {
    await client.execute(query, [phoneNumber], { prepare: true });
  } catch (err) {
    console.error("Error executing query", err);
  }
}

// Update data in ScyallaDB (for the given phone number) with TTL mapped to the params
// Note : TTL is in milliseconds
async function UpdateDataInScyllaDBTTL(phoneNumber, data, value, ttl) {
  const query = `UPDATE users USING TTL ${ttl} SET ${data} = ${value}  WHERE phoneNumber = ?`;

  try {
    await client.execute(query, [phoneNumber], { prepare: true });
  } catch (err) {
    console.error("Error executing query", err);
  }
}

// Update data in Neptune (for the given phone number)
async function UpdateDataInNeptune(phoneNumber, data, value) {
  const dc = new DriverRemoteConnection(
    `wss://${NeptuneConnection.endpoint}:${NeptuneConnection.port}/gremlin`
  );

  const graph = new Graph();
  const g = graph.traversal().withRemote(dc);

  try {
    const query = g
      .V()
      .has("phoneNumber", phoneNumber)
      .property(data, value)
      .next();
    await query;
  } catch (error) {
    console.error("Error querying Neptune", error);
  }
}

async function AddFriendRelationInNeptune(phoneNumber, friend) {
  try {
    const encryptedUser1Id = phoneNumber;
    const encryptedUser2Id = friend;

    const query = `
      g.V().has('User', 'username', '${encryptedUser1Id.data}')
        .addE('FRIENDS_WITH')
        .to(g.V().has('User', 'username', '${encryptedUser2Id.data}'))
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

async function FetchTopFriendsAndPolls(user_id) {
  const cql_query = "SELECT TopFriends, TopPolls FROM users WHERE user_id = ?";

  try {
    const result = await client.execute(cql_query, [user_id], {
      prepare: true,
    });
    const row = result.first();

    if (row) {
      const TopFriends = row.TopFriends;
      const TopPolls = row.TopPolls;

      // Count the frequency of each interest
      const countFriends = _.countBy(TopFriends);
      const countPolls = _.countBy(TopPolls);

      // Sort the interests by their frequency
      const sortedTopFriends = Object.entries(countFriends).sort(
        ([, a], [, b]) => b - a
      );
      const sortedTopPolls = Object.entries(countPolls).sort(
        ([, a], [, b]) => b - a
      );

      return {
        topFriends: sortedTopFriends,
        topPolls: sortedTopPolls,
      };
    } else {
      console.log("User not found!");
      return null;
    }
  } catch (err) {
    console.error("An error occurred", err);
    throw err;
  }
}

async function FetchTopFriends(user_id) {
  const cql_query = "SELECT TopFriends FROM users WHERE user_id = ?";

  try {
    const result = await client.execute(cql_query, user_id, { prepare: true });
    const row = result.first();

    if (row) {
      const TopFriends = row.TopFriends;

      // Count the frequency of each interest
      const count = _.countBy(TopFriends);

      // Sort the interests by their frequency
      const sortedTopFriends = Object.entries(count).sort(
        ([, a], [, b]) => b - a
      );
      return sortedTopFriends;
    } else {
      console.log("User not found!");
      return null;
    }
  } catch (err) {
    console.error("An error occurred", err);
    throw err;
  }
}
async function listFriends(userId) {
  try {
    // Encrypt the user ID if necessary
    const encryptedUserId = userId

    const query = `
      g.V().has('User', 'username', '${encryptedUserId.data}')
        .out('FRIENDS_WITH')
        .values('username')
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

// Fetch and return a user's top polls
//TODO: Fetch limit to return from KV
async function FetchTopPolls(user_id) {
  const cql_query = "SELECT TopPolls FROM users WHERE user_id = ? LIMIT 10";

  try {
    const result = await client.execute(cql_query, user_id, { prepare: true });
    const row = result.first();

    if (row) {
      const polls = row.TopPolls;

      // Count the frequency of each interest
      const count = _.countBy(polls);

      // Sort the interests by their frequency
      const sortedPolls = Object.entries(count).sort(([, a], [, b]) => b - a);

      return sortedPolls;
    } else {
      console.log("User not found!");
      return null;
    }
  } catch (err) {
    console.error("An error occurred", err);
    throw err;
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

async function removeFriendsRelation(phoneNumber, friend) {
  try {
    // Encrypt user IDs if necessary
    const encryptedUser1Id = phoneNumber;
    const encryptedUser2Id = friend;

    const query = `
      g.V().has('User', 'username', '${encryptedUser1Id.data}')
        .outE('FRIENDS_WITH')
        .where(inV().has('User', 'username', '${encryptedUser2Id.data}'))
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


module.exports = {
  FetchTopFriendsAndPolls,
  getDataFromNeptune,
  getDataFromScyalla,
  FetchCognitoData,
  InsertDataInScylla,
  UpdateDataInNeptune,
  //FetchInitialPolls,
  UpdateDataInScyallaDB,
  UpdateDataInScyllaDBTTL,
  FetchTopPolls,
  FetchTopFriends,
  ExecuteCustomScyllaQuery,
  AddFriendRelationInNeptune,
  removeFriendsRelation,
  listFriends
  //QuerySchools,
};
