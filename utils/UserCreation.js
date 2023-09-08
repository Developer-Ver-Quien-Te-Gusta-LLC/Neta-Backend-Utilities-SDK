const Cassandraclient = require("./SetupCassandra");
const Ably = require("ably");
const FetchFromSecrets = require("./AwsSecrets.js").FetchFromSecrets;
const AuthHandler = require("./AuthHandler.js");
var ably;
const AWS = require("aws-sdk");
const admin = require("firebase-admin");
const emojiRegex = require("emoji-regex");
const { getKV } = require("./KV");
const { SendEvent } = require("./Analytics");
const uuid = require("uuid");
const fs = require("fs");
const sharp = require("sharp");
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

async function handleTransactionError(
  phoneNumber,
  a = undefined,
  b = undefined
) {
  await DeleteUser(phoneNumber);
}

async function CreateScyllaUser(UserParams) {
  const {
    username,
    phoneNumber,
    platform,
    transactionId,
    encryptionKey,
    uid,
    gender,
    highschool,
    grade,
    firstName,
    lastName,
    school,
  } = UserParams;

  const invitesLeft = UserParams.invitesLeft || 0;

  try {
    const UserCreationQuery = `
      INSERT INTO users (
        username, phoneNumber, topPolls, topFriends, coins, invitesLeft, 
        pollIndex, numberOfStars, platform, gender, highschool, grade, uid,
        albyTopicName, anonymousMode, blocklist, firstName, lastName, friendList, 
        friendRequests, hideList, lastPollTime, numberOfPolls, online, pfp, 
        pfpHash, pfpMedium, pfpMediumHash, pfpSmall, pfpSmallHash, school
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

    const params = [
      username,
      phoneNumber,
      [], // topPolls
      [], // topFriends
      0, // coins
      invitesLeft,
      -1, // pollIndex
      0, // numberOfStars
      platform,
      gender,
      highschool,
      grade,
      uid,
      null, // albyTopicName
      false, // anonymousMode
      [], // blocklist
      firstName,
      lastName,
      [], // friendsList
      [], // friendRequests
      [], // hideList
      null, // lastPollTime
      0, // numberOfPolls
      false, // online
      null, // pfp
      null, // pfpHash
      null, // pfpMedium
      null, // pfpMediumHash
      null, // pfpSmall
      null, // pfpSmallHash
      school,
    ];

    await client.execute(UserCreationQuery, params, { prepare: true });

    // ... [rest of your function]

    return true;
  } catch (err) {
    console.log(err);
    await handleTransactionError("scylla", UserParams, phoneNumber);
    await OnUserCreationFailed(UserParams.transactionId);
    return false;
  }
}

async function createNeptuneUser(UserParams) {
  for (let key in UserParams) {
    if (UserParams[key] === undefined) {
      UserParams[key] = null;
      console.log(key + " is undefined.");
    }
  }
  var {
    username,
    phoneNumber,
    highschool,
    grade,
    age,
    gender,
    firstName,
    lastName,
    uid,
    transactionId,
  } = UserParams;
  if (gender == undefined) gender = "non-binary";
  try {
    //Add user vertex
    await g.submit(
      `g.addV('User').property('username', '${username}').property('phoneNumber', '${phoneNumber}').property('highschool', '${highschool}').property('grade', '${grade}').property('age', '${age}').property('gender', '${gender}').property('fname', '${firstName}').property('lname', '${lastName}').property('uid','${uid}')`
    );

    //Check if contact for user vertex exists anywhere
    const ContactVertex = await g.submit(
      `g.V().hasLabel('Contact').has('phoneNumber', '${phoneNumber}')`
    );
    if (ContactVertex._items.length === 0) {
      //if contact vertex for the user does not exist , create it
      await g.submit(
        `g.addV('Contact').property('phoneNumber', '${phoneNumber}').property('uid','${uid}')`
      );
    } 
    else {
      //#region if contact vertex exists , create an edge from all the users connected as "HAS_CONTACT" to "HAS_CONTACT_IN_APP"
      const UsersWithContactEdge = await g.submit(
        `g.V().hasLabel('User').outE('HAS_CONTACT').inV().hasLabel('Contact').has('uid', '${uid}').values('uid')`
      );

      // For each user, delete the old edge "HAS_CONTACT" and create a new edge "HAS_CONTACT_IN_APP"
      for (let user of UsersWithContactEdge) {
        await g.submit(
          `g.V(${user.id}).outE('HAS_CONTACT').drop()`
        );
        await g.submit(
          `g.V(${user.id}).addE('HAS_CONTACT_IN_APP').to(g.V().hasLabel('Contact').has('uid', '${uid}'))`
        );
      }

      console.log(`user ${username} already existed in the db , replaced all Contact Edge Connections while creating`);
      //#endregion
    }

    await g.submit(
      `g.V().hasLabel('User').has('uid',uid).addE("SELF_CONTACT").to(g.V().hasLabel('Contact').has('phoneNumber',phoneNumber))`,
      { uid: uid, phoneNumber: phoneNumber }
    );

    const highschoolVertex = await g.submit(
      `g.V().hasLabel('Highschool').has('name', '${highschool}')`
    );

    if (highschoolVertex._items.length > 0) {
      await g.submit(
        `g.V().has('User', 'uid', '${uid}').addE('ATTENDS_SCHOOL').to(g.V().hasLabel('Highschool').has('name', '${highschool}'))`
      );
    } else {
      const HighschoolUID = uuid.v4();
      await g.submit(
        `g.addV('Highschool').property('name', '${highschool}').property('uid', '${HighschoolUID}')`
      );
    }
    await g.submit(
      `g.V().has('User', 'uid', '${uid}').addE('ATTENDS_SCHOOL').to(g.V().hasLabel('Highschool').has('name', '${highschool}'))`
    );

    await handleTransactionCompletion(transactionId, uid, phoneNumber);
    return true; // Return the success response
  } catch (error) {
    console.error(error);
    await handleTransactionError("neptune", UserParams, phoneNumber);
    await OnUserCreationFailed(UserParams.transactionId);
    return false;
  }
}

async function CreateFirebaseUser(UserParams) {
  var { username, uid, transactionId, encryptionKey, phoneNumber } = UserParams;
  const password = String(UserParams.otp + UserParams.otp);

  try {
    await admin.auth().createUser({
      password: password,
      displayName: username,
      uid: uid,
      disabled: false,
    });
    await handleTransactionCompletion(transactionId, uid, phoneNumber);
    return true;
  } catch (err) {
    console.log(err);
    await handleTransactionError("cognito", UserParams, phoneNumber); //recursive 3 times , else return false
    await OnUserCreationFailed(UserParams.transactionId);
    return false;
  }
}

async function CreateMixPanelUser(UserParams) {
  mixpanel.people.set(UserParams.username, {
    $first_name: UserParams.firstname,
    $last_name: UserParams.lastname
  });
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

var weight, EmojiContactsWeight;
async function getWeights() {
  weight = await getKV("ContactsWeightOnboarding");
  EmojiContactsWeight = await getKV("EmojiContactsWeightOnboarding");
  return { weight, EmojiContactsWeight };
}
getWeights();

let bucketName, s3;
async function InitializeS3() {
  bucketName = await FetchFromSecrets("PFPBucket");

  const accessKeyId = await FetchFromSecrets(
    "CF_access_key_id"
  );
  const secretAccessKey = await FetchFromSecrets(
    "CF_secret_access_key"
  );
  const accountid = await FetchFromSecrets(
    "CloudflareAccountId"
  );

  s3 = new AWS.S3({
    endpoint: `https://${accountid}.r2.cloudflarestorage.com`, //if this doesnt work , use https://9b990cf1afe1e9cd3e482c7d5c5a6422.r2.cloudflarestorage.com/netapfps
    accessKeyId: accessKeyId,
    secretAccessKey: secretAccessKey,
    signatureVersion: "v4",
  });
}

InitializeS3();

async function uploadUserContacts(req, res) {
  const { phoneNumber } = req.body;
  const contactsList = JSON.parse(req.body.contactsList);

  const regex = emojiRegex();

  // Helper function to check if a string has any emoji characters using the emoji-regex package
  function hasEmoji(text) {
    return regex.test(text);
  }

  try {
    let uploadAndPushPromises = [];
    for (let i = 0; i < contactsList.length; i++) {
      let contact = contactsList[i];
      let uploadResult = null;

      if (req.files && req.files[i]) {
        const file = req.files[i];
        const buffer = await sharp(file.buffer).jpeg().toBuffer();
        const uploadParams = {
          Bucket: bucketName,
          Key: `${Date.now()}_${file.originalname}`,
          Body: buffer,
        };

        uploadResult = await s3.upload(uploadParams).promise();
      }

      // Check if the contact is implicitly a favorite based on the presence of emojis
      const isFavorite =
        uploadResult && (hasEmoji(contact.Fname) || hasEmoji(contact.Lname));

      // Using Gremlin to add contact vertex and edge

      if (uploadResult) {
        weight = isFavorite ? EmojiContactsWeight : weight;
      }

      const ContactVertex = await g.submit(
        "g.V().hasLabel('Contact').has('phoneNumber', phoneNumber)",
        { phoneNumber: contact.phoneNumber }
      );
      const UserVertex = await g.submit(
        "g.V().hasLabel('User').has('phoneNumber', phoneNumber)",
        { phoneNumber: phoneNumber }
      );

      if (ContactVertex.length == 0) {
        const uid = uuid.v4();

        await g.submit(
          "g.addV('Contact').property('phoneNumber', phoneNumber).property('fav', isFavorite).property('weight', weight).property('photo', uploadResult).property('uid', uid)",
          {
            phoneNumber: contact.phoneNumber,
            isFavorite: isFavorite,
            weight: weight,
            uploadResult: uploadResult,
            uid: uid,
          }
        );

        await g.submit(
          `g.V().hasLabel('User').has('phoneNumber', '${phoneNumber}').addE('HAS_CONTACT').to(g.V().hasLabel('Contact').has('phoneNumber', '${contact.PhoneNumber}'))`
        );
      
      } else {
        if(UserVertex.length>0){
        await g.submit(
          "g.V().hasLabel('User').has('phoneNumber', phoneNumber).addE('HAS_CONTACT_IN_APP').to(g.V().hasLabel('Contact').has('phoneNumber', contactPhoneNumber))",
          { phoneNumber: phoneNumber, contactPhoneNumber: contact.phoneNumber }
        );
        }
        else{
          await g.submit(
            "g.V().hasLabel('User').has('phoneNumber', phoneNumber).addE('HAS_CONTACT').to(g.V().hasLabel('Contact').has('phoneNumber', contactPhoneNumber))",
            { phoneNumber: phoneNumber, contactPhoneNumber: contact.phoneNumber }
          );
        }
      }
    }

    await SendEvent("upload_user_contacts", phoneNumber, {
      num: contactsList.length,
    });

    res.status(200).json({ Success: true });
  } catch (err) {
    console.log(err);
    res.status(500).json({ Success: false, Error: err });
  }
}

module.exports = {
  CreateScyllaUser,
  createNeptuneUser,
  CreateFirebaseUser,
  DeleteUser,
  uploadUserContacts,
  CreateMixPanelUser
};
