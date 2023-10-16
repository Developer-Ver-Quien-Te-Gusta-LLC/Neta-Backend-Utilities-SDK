const Cassandraclient = require("./SetupCassandra");
const Ably = require("ably");
const FetchFromSecrets = require("./AwsSecrets.js").FetchFromSecrets;
const AuthHandler = require("./AuthHandler.js");
var ably;
const AWS = require("aws-sdk");
const admin = require("firebase-admin");
const { initializeApp } = require("firebase/app");
const { getAuth, signInWithCustomToken, getIdToken, signOut } = require("firebase/auth");

const firebaseConfig = {
  apiKey: " AIzaSyCJ-pIfMEyavmWK9DcK1c2es78NCqSunhU ",
  authDomain: "project-755055790640.firebaseapp.com",
} // switch to kv later
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

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
const neo4j = require('neo4j-driver');
const uri = 'neo4j+s://7b7d8839.databases.neo4j.io'; //replace w kv
const user = 'neo4j'; //replace w kv
const password = 'bRgk7vO5PiadruWGGvcAMkVK7SAdg9sFUSc3EC77Wts'; //replace w kv
const driver = neo4j.driver(uri, neo4j.auth.basic(user, password));
let client;

Cassandraclient.SetupCassandraClient(client).then((result) => {
  client = result;
});

const {OnUserCreationFailed,handleTransactionCompletion,onTransactionStart} = require("./UserCreationTransactionHandling.js");

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
    age
  } = UserParams;

  const invitesLeft = UserParams.invitesLeft || 0;

  try {
    const UserCreationQuery = `
      INSERT INTO users (
        age,username, phoneNumber, coins, invitesLeft, 
        pollIndex, numberOfStars, platform, gender, highschool, grade, uid,
        albyTopicName, anonymousMode, firstName, lastName,  lastPollTime, numberOfPolls, pfp, 
        pfpHash, pfpMedium, pfpMediumHash, pfpSmall, pfpSmallHash
      ) VALUES (?,?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

    const params = [
      age,
      username,
      phoneNumber,
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
      firstName,
      lastName,
      null, // lastPollTime
      0, // numberOfPolls
      null, // pfp
      null, // pfpHash
      null, // pfpMedium
      null, // pfpMediumHash
      null, // pfpSmall
      null, // pfpSmallHash
    ];

    await client.execute(UserCreationQuery, params, { prepare: true });

    await handleTransactionCompletion(uid, phoneNumber);

    return true;
  } catch (err) {
    console.log(err);
    await handleTransactionError("scylla", UserParams, phoneNumber);
    await OnUserCreationFailed(UserParams.transactionId);
    return false;
  }
}

async function createNeptuneUser(UserParams) {
  const session = driver.session();
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
  } = UserParams;
  if (gender == undefined) gender = "non-binary";
  try {
    // Add user vertex
    let addUserQuery = `
      CREATE (u:User {
        username: $username, 
        phoneNumber: $phoneNumber, 
        highschool: $highschool, 
        grade: $grade, 
        age: $age, 
        gender: $gender, 
        fname: $firstName, 
        lname: $lastName, 
        uid: $uid
      })
      RETURN u
    `;
    await session.run(addUserQuery, UserParams);

    // Check if contact for user vertex exists anywhere
    let checkContactQuery = `
      MATCH (c:Contact {phoneNumber: $phoneNumber}) 
      RETURN c
    `;
    const ContactVertex = await session.run(checkContactQuery, { phoneNumber });


    if (!ContactVertex.records.length) {
      // If contact vertex for the user does not exist, create it
      let addContactQuery = `
        CREATE (c:Contact {phoneNumber: $phoneNumber, uid: $uid})
      `;
      await session.run(addContactQuery, UserParams);
    } else {
      // If contact vertex exists, create an edge from all the users connected as "HAS_CONTACT" to "HAS_CONTACT_IN_APP"
      let replaceEdgeQuery = `
        MATCH (u:User)-[oldEdge:HAS_CONTACT]->(c:Contact {uid: $uid})
        DELETE oldEdge
        CREATE (u)-[:HAS_CONTACT_IN_APP]->(c)
      `;
      await session.run(replaceEdgeQuery, UserParams);
      console.log(
        `user ${username} already existed in the db, replaced all Contact Edge Connections while creating`
      );
    }

    // Add/Update contact
    let contactQuery = `
   MERGE (c:Contact {phoneNumber: $phoneNumber})
   ON CREATE SET c.uid = $uid
   WITH c
   MATCH (u:User {uid: $uid})
   MERGE (u)-[:SELF_CONTACT]->(c)
 `;
    await session.run(contactQuery, UserParams);

    // For school
    let schoolQuery = `
      MERGE (s:Highschool {name: $highschool})
      WITH s
      MATCH (u:User {uid: $uid})
      MERGE (u)-[:ATTENDS_SCHOOL]->(s)
    `;
    await session.run(schoolQuery, UserParams);

    await handleTransactionCompletion(uid, phoneNumber);
    return true; // Return the success response
  } catch (error) {
    session.close();
    console.error(error);
    await handleTransactionError("neptune", UserParams, phoneNumber);
    await OnUserCreationFailed(UserParams.transactionId);
    return false;
  }finally{
    session.close();
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

    const customToken = await admin.auth().createCustomToken(uid);
    const userCredential = await signInWithCustomToken(auth,customToken);
    const user = userCredential.user;
    const idToken = await getIdToken(user,true);
    await signOut(auth);
    //console.log(`Token For user ${username} is ${customToken}`);
    const query = 'INSERT INTO tokens (UserToken,phoneNumber,jwt) VALUES (?,?,?)';
    await client.execute(query,[customToken,phoneNumber,idToken]);
    await handleTransactionCompletion(uid, phoneNumber);
    return true;
  } catch (err) {
    console.log(err);
    await handleTransactionError("cognito", UserParams, phoneNumber); //recursive 3 times , else return false
    await OnUserCreationFailed(UserParams.transactionId);
    return false;
  }
}

async function StartUserCreation(UserParams){
  await onTransactionStart(UserParams.transactionId,UserParams.phoneNumber);
  await CreateScyllaUser(UserParams);
  await createNeptuneUser(UserParams);
  await CreateFirebaseUser(UserParams);
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
  const session = driver.session();
  const { phoneNumber, contactsList } = req.body;

  const regex = emojiRegex();

  // Helper function to check if a string has any emoji characters using the emoji-regex package
  function hasEmoji(text) {
    return regex.test(text);
  }

  try {
    let uploadAndPushPromises = [];
    let contactQueries = [];
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

      let contactQuery = `
      // Merge the contact
      MERGE (c:Contact {phoneNumber: $contactPhone})
      ON CREATE SET c.fav = $isFavorite, c.weight = $weight, c.photo = $uploadResult, c.uid = $uid
      
      // Match the user
      WITH c
      MATCH (u:User {phoneNumber: $userPhone})
      
      // Optionally match an existing HAS_CONTACT relationship
      OPTIONAL MATCH (u)-[existingRel:HAS_CONTACT]->(c:Contact {phoneNumber: $contactPhone})
      
      // Conditionally merge the HAS_CONTACT relationship
      WITH u, c, existingRel
      MERGE (u)-[r:HAS_CONTACT]->(c)
      ON CREATE SET r.type = COALESCE(CASE WHEN existingRel IS NULL THEN 'HAS_CONTACT' ELSE 'HAS_CONTACT_IN_APP' END, 'UNKNOWN')
  `;
  
  contactQueries.push({
      query: contactQuery,
      parameters: {
          contactPhone: contact.phoneNumber,
          userPhone: phoneNumber,
          isFavorite: isFavorite,
          weight: weight,
          uploadResult: uploadResult ? uploadResult.Location : null,  // Assuming Location stores the URL of the uploaded file
          uid: uuid.v4()
      }
  });

      console.log("contact edge added");
    }

    // Run all queries in a single transaction
    const session = driver.session();
    const transaction = session.beginTransaction();
    try {
      for (let i = 0; i < contactQueries.length; i++) {
        await transaction.run(contactQueries[i].query, contactQueries[i].parameters);
      }
      await transaction.commit();
    } catch (error) {
      console.log(error);
      await transaction.rollback();
    } finally {
      session.close();
    }

    await SendEvent("upload_user_contacts", phoneNumber, {
      num: contactsList.length,
    });

    res.status(200).json({ Success: true });
  } catch (err) {
    console.log(err);
    session.close();
    res.status(500).json({ Success: false, Error: err });
  }
  finally{
    session.close();
  }
}

module.exports = {
  CreateScyllaUser,
  createNeptuneUser,
  CreateFirebaseUser,
  DeleteUser,
  uploadUserContacts,
  CreateMixPanelUser,
  StartUserCreation
};