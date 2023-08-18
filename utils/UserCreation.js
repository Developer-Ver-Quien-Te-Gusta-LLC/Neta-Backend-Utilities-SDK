const cassandra = require('cassandra-driver');
const Ably = require('ably');
const  FetchFromSecrets  = require("./AwsSecrets.js").FetchFromSecrets;

var ably;

async function fetchAlby() {
  ably = new Ably.Realtime.Promise(await FetchFromSecrets("AblyAPIKey"));
  await ably.connection.once("connected");
}

fetchAlby();

const gremlin = require('gremlin');
const AWS = require('aws-sdk');
const https = require("https");

let NeptuneConnection,client,userPoolId;
async function fetchCassandra() {
  const contactPoints = await FetchFromSecrets("contactPoints");
  const localDataCenter = await FetchFromSecrets("localDataCenter");
  const keyspace = await FetchFromSecrets("keyspace");

  client = new cassandra.Client({
    contactPoints: [contactPoints],
    localDataCenter: localDataCenter,
    keyspace: keyspace,
  });
  await client.connect();
  userPoolId = await FetchFromSecrets("UserPoolID"); // Insert your user pool id here

  const [NeptuneEndpoint, NeptunePort] = await Promise.all([
    FetchFromSecrets("NeptuneEndpoint"),
    FetchFromSecrets("NeptunePort"),
  ]);
  
  const NeptuneConnection = {
    endpoint: NeptuneEndpoint,
    port: NeptunePort,
    region: process.env.AWS_REGION,
  };
  
}
fetchCassandra();
const httpAgent = new https.Agent({
  rejectUnauthorized: false, // for local development, use 'true' in production
});
const Neptune = new AWS.Neptune();
const DriverRemoteConnection = gremlin.driver.DriverRemoteConnection;
const Graph = gremlin.structure.Graph;

const handleTransactionError = require("./ServiceBus.js").handleTransactionError;
const OnUserCreationFailed = require("./UserCreationTransactionHandling.js").OnUserCreationFailed;
const handleTransactionCompletion = require("./UserCreationTransactionHandling.js").handleTransactionCompletion;
//Create a user profile in Mixpanel
async function CreateMixPanelUser(username, firstname, lastname, geohash) {
  mixpanel.people.set(username, {
    $first_name: firstname,
    $last_name: lastname,
    $geohash: geohash,
  });
}

/// add
/*
  firstName,
      lastName,
      phoneNumber,
      highschool,
      gender,
      age,
      grade,
*/
async function CreateScyllaUser(req) {
  const school = req.query.school;
  const username = req.query.username;
  const phoneNumber = req.query.phoneNumber;
  const friendList = req.query.friendList || [];
  const blockList = req.query.blockList || [];
  const hideList = req.query.hideList || [];
  const topPolls = req.query.topPolls || [];
  const friendRequests = req.query.friendRequests || [];
  const starCount = req.query.starCount || 0;
  const invitesLeft = req.query.invitesLeft || 0;
  const lastPollTime = req.query.lastPollTime || null;
  const platform = req.query.platform;

  try {
    const query = `
      INSERT INTO users (
        username,
        phoneNumber, 
        topPolls,
        topFriends, 
        starCount, 
        coins,
        invitesLeft, 
        lastPollTime, 
        pollIndex,
        numberOfStars,
        platform,
        gender,
        school,
        
      ) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)
    `;
    const params = [
      username,
      phoneNumber,
      { list: friendList },
      { list: blockList },
      { list: hideList },
      { list: topPolls },
      { list: friendRequests },
      starCount,
      0,
      invitesLeft,
      lastPollTime,
      -1,
      platform,
      req.query.gender,
      req.query.school
    ];
    try {
      await client.execute(query, params, { prepare: true });
      await enroll(req.query.school);
      /// send first special inbox msg
      await client.execute(
        "INSERT INTO inbox (phoneNumber, index) VALUES (?, ?)",
        [phoneNumber, -1]
      );
      await handleTransactionCompletion(
        req.transactionId,
        req.phoneNumber
      );
      return true;
    } catch (err) {
      await handleTransactionError("scylla", req); //recursive 3 times , else return false
      await OnUserCreationFailed(req.transactionId);
      return false;
    }
  } catch (err) {
    await handleTransactionError("scylla", req); //recursive 3 times , else return false
    await OnUserCreationFailed(req.transactionId);
    return false;
  }
}

//Create a user in Neptune
async function createNeptuneUser(req) {
  var { username, phoneNumber, highschool, grade, age, gender } = req.query;
  if(!grade) grade = null;
  if(!gender) gender = null;
  try {
    /// NOTE: sanitize iputs to avoid "SQL-injection" attacks
    const query = `
        g.addV('User')
          .property('username', username)
          .property('phoneNumber', phoneNumber)
          .property('highschool', highschool)
          .property('grade', grade)
          .property('age', age)
          .property('gender', gender)
      `; // Create a query to create a user in Neptune

    gremlinQuery(query, {
      username,
      phoneNumber,
      highschool,
      grade,
      age,
      gender,
    }).then(async (response) => {
      if (!response.success) {
        await handleTransactionError("neptune", req); //recursive 3 times , else return false
      }
      await handleTransactionCompletion(
        req.transactionId,
        req.phoneNumber
      );
      return true; // Return the success response
    });
  } catch (encryptionerror) {
    await handleTransactionError("neptune", req); //recursive 3 times , else return false
    await OnUserCreationFailed(req.transactionId);
    return false;
  }
}

async function CreateCognitoUser(req) {
  var {
    username,
    password,
    reduceNotifications,
    hideTopStars,
    takeBreak,
    nameInpolls,
  } = req.params;
  password = req.query.otp;
  const cognitoidentityserviceprovider =
    new AWS.CognitoIdentityServiceProvider();

  const createUserParams = {
    UserPoolId: userPoolId,
    Username: phoneNumber,
    TemporaryPassword: password,
    UserAttributes: [
      {
        Name: "custom:reduceNotifications",
        Value: "false",
      },
      { Name: "custom:hideTopStars", Value: "false" },
      { Name: "custom:takeBreak", Value: "false" },
      { Name: "custom:nameInpolls", Value: "everyone" },
      { Name: "custom:subscription", Value: "false" },
      //{ Name: "custom:pfp", Value: "null" },
    ],
    MessageAction: "SUPPRESS", // Suppressing welcome message
  };

  try {
    const createUserResponse = await cognitoidentityserviceprovider
      .adminCreateUser(createUserParams)
      .promise();
    // Set the password for the user to avoid "FORCE_CHANGE_PASSWORD" status
    await cognitoidentityserviceprovider
      .adminSetUserPassword({
        UserPoolId: "us-east-1_I4JrZH7m7",
        Username: phoneNumber,
        Password: password,
        Permanent: true,
      })
      .promise();
    await handleTransactionCompletion(
      req.transactionId,
      req.phoneNumber
    );
    return true;
  } catch (err) {
    await handleTransactionError("cognito", req); //recursive 3 times , else return false
    await OnUserCreationFailed(req.transactionId);
    return false;
  }
}

//decrease the number of students in a highschool
async function enroll(highschoolName) {
  const query =
    "UPDATE highschools SET num_students = num_students - 1 WHERE name = ?";

  try {
    await client.execute(query, [highschoolName], { prepare: true });
    console.log(`Number of students decreased for ${highschoolName}`);
  } catch (err) {
    console.error(err);
  }
}

//increase the number of students in a highschool
async function unenroll(highschoolName) {
  const query =
    "UPDATE highschools SET num_students = num_students + 1 WHERE name = ?";

  try {
    await client.execute(query, [highschoolName], { prepare: true });
    console.log(`Number of students increased for ${highschoolName}`);
  } catch (err) {
    console.error(err);
  }
}


module.exports= {
  CreateMixPanelUser,
  CreateScyllaUser,
  createNeptuneUser,
  CreateCognitoUser,
};
