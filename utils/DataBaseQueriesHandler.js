const gremlin = require('gremlin');
const AWS = require('aws-sdk');
const cassandra = require('cassandra-driver');
const GetClient = require('./SetupCassandra').GetClient
const  FetchFromSecrets  = require('./AwsSecrets.js').FetchFromSecrets;

const graphDB= require("./SetupGraphDB.js");
graphDB.GetClient().then(result =>{ global.g = result});

let client;
GetClient().then(result=>{client=result;})

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

async function DeleteUser(req, deleteVerification = false) {
  const promises = [];
  const queries = [];
  const { uid } = req.query;

  // Fill the array with query objects
  const highschoolQuery =
    "SELECT highschool, phoneNumber FROM users WHERE uid = ?";
  const highschoolResult = await client.execute(highschoolQuery, [uid], {
    prepare: true,
  });
  const highschool = highschoolResult.rows[0].highschool;
  const phoneNumber = highschoolResult.rows[0].phoneNumber;

  queries.push({
    query:
      "UPDATE schools SET numofstudents = numofstudents - 1 WHERE name = ?",
    params: [highschool],
  });
  queries.push({
    query:
      "UPDATE schools SET numofstudents = numofstudents - 1 WHERE name = ?",
    params: [highschool], // assume schoolName is a variable that holds the name of the school
  });

  queries.push({
    query: "DELETE FROM users WHERE uid = ?",
    params: [pn],
  });

  queries.push({
    query: "DELETE FROM reports WHERE uid = ?",
    params: [pn],
  });

  queries.push({
    query: "DELETE FROM inbox WHERE uid = ?",
    params: [pn],
  });

  queries.push({
    query: "DELETE FROM topFriendsAndPolls WHERE uid = ?",
    params: [pn],
  });

  queries.push({
    query: "DELETE FROM userPolls WHERE uid = ?",
    params: [pn],
  });

  queries.push({
    query: "DELETE FROM notificationTable WHERE uid = ?",
    params: [pn],
  });

  if (deleteVerification) {
    queries.push({
      query: "DELETE FROM verification WHERE phoneNumber = ?",
      params: [phoneNumber],
    });
  }

  const DeleteUserScyllaPromise = client.batch(queries, { prepare: true });

  promises.push(DeleteUserScyllaPromise);

  const DeleteFirebaseUserPromise = admin.auth().deleteUser(phoneNumber);
  promises.push(DeleteFirebaseUserPromise);

  // Gremlin query to delete the vertex 'User' using the phoneNumber given
  const gremlinQuery = `g.hasV().has('User', 'uid', ${phoneNumber}).drop()`;
  const DeleteUserGremlinPromise = g.execute(gremlinQuery);
  promises.push(DeleteUserGremlinPromise);

  // Wait for all promises to resolve
  await Promise.all(promises);
}

async function handleTransactionError(phoneNumber, a = undefined, b = undefined) {
  await DeleteUser(phoneNumber)
}

// Update data in Neptune (for the given phone number)
async function UpdateDataInNeptune(uid, data, value) {
  try {
    // Fetch the current value
    const result = await g.submit('g.V().has("uid", uid)', { uid: uid});
    const currentValue =  result._items[value] == undefined ? 0:result._items[value];
    console.log(currentValue);

    // Increment the value
    const newValue = currentValue + value;

    // Update the vertex with the new value
    await g.submit('g.V().has("uid", uid).property(data, newValue)', { uid: uid,data:data, newValue: newValue });
  } catch (error) {
    console.error("Error querying Neptune", error);
  }
}

async function AddFriendRelationInNeptune(uid, friend) {
  try {
    const query = `
      g.V().hasLabel('User').has('uid', '${uid}')
        .addE('FRIENDS_WITH')
        .to(g.V().hasLabel('User').has('uid', '${friend}'))
    `;

    await g.submit(query).then((response) => {
      return { success: true, data: response.result.data }; // Return the success response
    });
  } catch (encryptionerror) {
    handleTransactionError("graphdb", req.query);
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
        handleTransactionError("graphdb", req.query);
      }

      return { success: true, data: response.result.data }; // Return the success response
    });
  } catch (encryptionerror) {
    return encryptionerror;
  }
}


module.exports= {
  //FetchTopFriendsAndPolls,
  getDataFromScyalla,
  InsertDataInScylla,
  UpdateDataInNeptune,
  //FetchInitialPolls,
  UpdateDataInScyallaDB,
  UpdateDataInScyllaDBTTL,
  ExecuteCustomScyllaQuery,
  AddFriendRelationInNeptune,
  removeFriendsRelation,
  //listFriends
  //QuerySchools,
};
