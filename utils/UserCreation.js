const cassandra = require('cassandra-driver');
const Ably = require('ably');
const  FetchFromSecrets  = require("./AwsSecrets.js").FetchFromSecrets;

var ably;

async function fetchAlby() {
  ably = new Ably.Realtime.Promise(await FetchFromSecrets("AblyAPIKey"));
  await ably.connection.once("connected");
}

fetchAlby();
const AWS = require('aws-sdk');

let client,userPoolId;
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
}
fetchCassandra();

var g = require('./SetupGraphDB.js').SetupGraphDB(g)

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
      null,
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
      await client.execute(query, params, { prepare: true }); /// submit main scylla query
      await enroll(req.query.school); /// enroll in school
      /// submit to username uniqueness service
      const ARN = await NetaBackendUtilitiesSDK.FetchFromSecrets(
        "ServiceBus_UsernameUniqueness"
      );
    
      /// submit to /createScyllaUser
      const params = {
        Message: JSON.stringify({phoneNumber, requestedUsername : username}),
        TopicArn: ARN, // replace with your SNS Topic ARN
      };
    
      sns.publish(params, function (err, data) {
        if (err) console.log(err, err.stack);
        else console.log(data);
      });
      // submit initial imbox msg
      const uid = uuidv4();
    const query = `
  INSERT INTO inbox 
  (uid, pushedTime, anonymousMode, grade, school, gender, question, asset, phoneNumbers, index) 
  VALUES 
  (?, toTimestamp(now()), false, null, null, null, null, null, null, -1);
`;
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

const CONCURRENT_PROMISES_LIMIT = 10;  // Adjust this value as needed

// Utility function to handle a limited number of concurrent promises
async function* asyncLimiter(generator) {
  const activePromises = new Set();
  
  for (const promise of generator) {
    if (activePromises.size >= CONCURRENT_PROMISES_LIMIT) {
      await Promise.race(activePromises);
    }
    
    activePromises.add(promise);
    promise.then(() => activePromises.delete(promise)).catch(() => activePromises.delete(promise));

    yield promise;
  }

  await Promise.allSettled(activePromises);
}

async function createNeptuneUser(req) {
  var { username, phoneNumber, highschool, grade, age, gender, fname, lname, favContacts, photoContacts, friendList, sameGrade, topPolls } = req.query;

  if (!grade) grade = null;
  if (!gender) gender = null;

  try {
    const userVertex = await g
      .addV("User")
      .property("username", username)
      .property("phoneNumber", phoneNumber)
      .property("highschool", highschool)
      .property("grade", grade)
      .property("age", age)
      .property("gender", gender)
      .property("fname", fname)
      .property("lname", lname)
      .next();

    // Generator function for creating relationships
    const relationshipGenerator = (function*() {
      for (const contact of favContacts) {
        yield g.V(userVertex).addE('HAS_CONTACT').property('fav', true).to(g.V().hasLabel('User').has('username', contact)).next();
      }
      for (const contact of photoContacts) {
        yield g.V(userVertex).addE('HAS_CONTACT').property('photo', true).to(g.V().hasLabel('User').has('username', contact)).next();
      }
      for (const friend of friendList) {
        yield g.V(userVertex).addE('FRIENDS_WITH').to(g.V().hasLabel('User').has('username', friend)).next();
      }
      for (const gradeFriend of sameGrade) {
        yield g.V(userVertex).addE('HAS_SAME_GRADE').to(g.V().hasLabel('User').has('username', gradeFriend)).next();
      }
      for (const topPollUser of topPolls) {
        yield g.V(userVertex).addE('HAS_TOP_POLL').to(g.V().hasLabel('User').has('username', topPollUser)).next();
      }
    })();

    const results = [];
    for await (const result of asyncLimiter(relationshipGenerator)) {
      results.push(result);
    }

    // Handle errors, if any
    results.forEach((result, index) => {
      if (result.status === "rejected") {
        console.error(`Error in promise ${index}:`, result.reason);
      }
    });

    await handleTransactionCompletion(req.transactionId, req.phoneNumber);
    return true; // Return the success response

  } catch (error) {
    await handleTransactionError("neptune", req);
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
