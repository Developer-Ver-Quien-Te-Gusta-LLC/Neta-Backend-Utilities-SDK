const Cassandraclient = require("./SetupCassandra");
const Ably = require("ably");
const FetchFromSecrets = require("./AwsSecrets.js").FetchFromSecrets;
const AuthHandler = require("./AuthHandler.js");
var ably;
const AWS = require("aws-sdk");
const admin = require("firebase-admin");

async function initializeFirebase() {
  try {
    var credentials = await FetchFromSecrets("FCMAccountCredentials");

    credentials = JSON.parse(credentials);
    if (!credentials) {
      console.error("Unable to fetch FCM Account Credentials.");
      return;
    }

    if (admin.apps.length === 0) {
      admin.initializeApp({
        credential: admin.credential.cert(credentials),
      });

      console.log("Firebase Admin SDK Initialized.");
    }
  } catch (error) {
    console.error("Error during Firebase Admin SDK initialization:", error);
  }
}
initializeFirebase();

async function fetchAlby() {
  ably = new Ably.Realtime.Promise(await FetchFromSecrets("AblyAPIKey"));
  await ably.connection.once("connected");
}
fetchAlby();

let client;

Cassandraclient.SetupCassandraClient(client).then((result) => {
  client = result;
});

var GraphDB = require("./SetupGraphDB.js");
let g;
GraphDB.SetupGraphDB().then((result) => {
  g = result;
});

const ServiceBus = require("./ServiceBus.js");
const OnUserCreationFailed =
  require("./UserCreationTransactionHandling.js").OnUserCreationFailed;
const handleTransactionCompletion =
  require("./UserCreationTransactionHandling.js").handleTransactionCompletion;

async function CreateScyllaUser(UserParams) {
  const { username, phoneNumber, platform, transactionId, encryptionKey } = UserParams;
  const starCount = UserParams.starCount || 0;
  const invitesLeft = UserParams.invitesLeft || 0;
  const lastPollTime = UserParams.lastPollTime || null;

  try {
    const UserCreationQuery = `INSERT INTO users (username, phoneNumber, topPolls, topFriends, starCount, coins, invitesLeft, lastPollTime, pollIndex, numberOfStars, platform, gender, highschool, grade, uid) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    const params = [
      username,
      phoneNumber,
      null,
      null,
      starCount,
      0,
      invitesLeft,
      lastPollTime,
      -1,
      0,
      platform,
      UserParams.gender,
      UserParams.highschool,
      UserParams.grade,
      UserParams.uid,
    ];
    await client.execute(UserCreationQuery, params, { prepare: true }); /// submit main scylla query
   
      await enroll(UserParams.highschool); /// enroll in school
      /// submit to username uniqueness service
      const ARN = await NetaBackendUtilitiesSDK.FetchFromSecrets(
        "ServiceBus_UsernameUniqueness"
      );

      /// submit to /createScyllaUser
     /* const SNSParams = {
        Message: JSON.stringify({ uid, requestedUsername: username }),
        TopicArn: ARN, // replace with your SNS Topic ARN
      };

      sns.publish(SNSParams, function (err, data) {
        if (err) console.log(err, err.stack);
        else console.log(data);
      });*/
      // submit initial imbox msg
      const uid = uuidv4();
      const query = `INSERT INTO inbox (uid, pushedTime, anonymousMode, grade, school, gender, question, asset, uids, index) VALUES (?, toTimestamp(now()), false, null, null, null, null, null, null, -1);`;
      await client.execute(query, [uid, undefined, false, undefined, undefined, undefined, undefined, undefined, undefined, -1], { prepare: true }); /// submit main scylla query
      await handleTransactionCompletion(transactionId, uid, encryptionKey);
      return true;
    
  } catch (err) {
    console.log(err);
    await ServiceBus.handleTransactionError("scylla", UserParams, phoneNumber); //recursive 3 times , else return false
    await OnUserCreationFailed(UserParams.transactionId);
    return false;
  }
}

async function createNeptuneUser(UserParams) {
  var {
    username,
    phoneNumber,
    highschool,
    grade,
    age,
    gender,
    fname,
    lname,
    uid,
    transactionId,
    encryptionKey,
  } = UserParams;

  if (!grade) grade = null;
  if (!gender) gender = null;

  try {
    await g
      .submit(
        "g.addV('User').property('username', username).property('phoneNumber', phoneNumber).property('highschool', highschool).property('grade', grade).property('age', age).property('gender', gender).property('fname', fname).property('lname', lname).property('uid',uid)",
        {
          username: username,
          phoneNumber: phoneNumber,
          highschool: highschool,
          grade: grade,
          age: age,
          gender: gender,
          fname: fname,
          lname: lname,
          uid: uid,
        }
      )
      .then(function (result) {
        console.log("User Created in graphdb");
      });

    await handleTransactionCompletion(transactionId, uid, encryptionKey);
    return true; // Return the success response
  } catch (error) {
    console.error(error);
    await ServiceBus.handleTransactionError("neptune", UserParams, phoneNumber);
    await OnUserCreationFailed(UserParams.transactionId);
    return false;
  }
}

async function CreateFirebaseUser(UserParams) {
  var { username, uid, transactionId, encryptionKey } = UserParams;
  const password = UserParams.otp;

  try {
    await admin.auth().createUser({
      password: password,
      displayName: username,
      uid: uid,
      disabled: false,
    });
    await handleTransactionCompletion(transactionId, uid, encryptionKey);
    return true;
  } catch (err) {
    console.log(err);
    await ServiceBus.handleTransactionError(
      "cognito",
      UserParams,
      phoneNumbe,
      phoneNumberr
    ); //recursive 3 times , else return false
    await OnUserCreationFailed(UserParams.transactionId);
    return false;
  }
}

//decrease the number of students in a highschool
async function enroll(highschoolName) {
  const query =
    "UPDATE highschool SET num_students = num_students - 1 WHERE name = ?";

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
  const gremlinQuery = `g.V().has('User', 'uid', ${phoneNumber}).drop()`;
  const DeleteUserGremlinPromise = g.execute(gremlinQuery);
  promises.push(DeleteUserGremlinPromise);

  // Wait for all promises to resolve
  await Promise.all(promises);
}

module.exports = {
  CreateScyllaUser,
  createNeptuneUser,
  CreateFirebaseUser,
  DeleteUser,
};
