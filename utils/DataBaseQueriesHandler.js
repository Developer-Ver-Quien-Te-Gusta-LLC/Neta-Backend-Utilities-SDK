const gremlin = require('gremlin');
const cassandra = require('cassandra-driver');
const GetClient = require('./SetupCassandra').GetClient
const  FetchFromSecrets  = require('./AwsSecrets.js').FetchFromSecrets;

const Setupneo4j = require("./Setupneo4j.js");

var driver;
Setupneo4j.SetupNeo4jClient().then(result =>{driver = result});

let client;
GetClient().then(result=>{client=result;})

// Fetch data from ScyllaDB (for the given phone number)
async function getDataFromScyalla(tableName, uid, data) {
  const query = `SELECT ${data} FROM ${tableName} WHERE uid = ?`; //ScyllaDB query to fetch data

  //console.log("Query :",query);

  try {
    const result = await client.execute(query, [uid], {
      prepare: true,
    });
    const row = result.rows[0];
    if (row) {
      //console.log("Data Returned-->",row[data.toLowerCase()]);
      return row[data.toLowerCase()];
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
    await client.execute(query, [value, uid], { prepare: true });
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
  const session = driver.session();
  try {
    const result = await session.run('MATCH (n) WHERE n.uid = $uid RETURN n[$data] as currentValue', { uid: uid, data: data });
    const singleRecord = result.records[0];
    const currentValue = singleRecord.get('currentValue') === null ? 0 : singleRecord.get('currentValue');
    console.log(currentValue);

    // Increment the value
    const newValue = currentValue + value;

    // Update the vertex with the new value
    await session.run('MATCH (n) WHERE n.uid = $uid SET n[$data] = $newValue', { uid: uid, data: data, newValue: newValue });
  } catch (error) {
    session.close();
    console.error("Error querying Neo4j", error);
  }finally{
    session.close();
  } 
}

async function AddFriendRelationInNeptune(uid, friend) {
  const session = driver.session();
  try {
    const query = `
      MATCH (u:User), (f:User)
      WHERE u.uid = $uid AND f.uid = $friend
      MERGE (u)-[:FRIENDS_WITH]->(f)
    `;

    await session.run(query, { uid: uid, friend: friend });

    return { success: true };
  } catch (error) {
    session.close();
   // handleTransactionError("graphdb", uid);  // Assuming you're passing uid to the error handler
    return error;
  } finally{
    session.close();
  } 
}
async function removeFriendsRelation(uid, friend) {
  const session = driver.session();
  try {
    // Note: If you're using encryption, encrypt the UIDs here. Otherwise, skip this step.
    const encryptedUser1Id = uid;
    const encryptedUser2Id = friend;

    const query = `
      MATCH (u:User)-[r:FRIENDS_WITH]->(f:User)
      WHERE u.username = $uid AND f.username = $friend
      DELETE r
    `;

    await session.run(query, { uid: encryptedUser1Id, friend: encryptedUser2Id });

    return { success: true };
  } catch (error) {
    session.close();
    //handleTransactionError("graphdb", uid);  // Assuming you're passing uid to the error handler
    return error;
  } finally{
    session.close();
  } 
}

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
