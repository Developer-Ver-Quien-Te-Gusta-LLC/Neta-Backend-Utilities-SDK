const Cassandraclient = require("./SetupCassandra");
const Ably = require("ably");
const FetchFromSecrets = require("./AwsSecrets.js").FetchFromSecrets;
const AuthHandler = require("./AuthHandler.js");
var ably;
const AWS = require("aws-sdk");

const emojiRegex = require("emoji-regex");
const { SendEvent } = require("./Analytics");
const uuid = require("uuid");
const fs = require("fs");
const sharp = require("sharp");
const jwt = require('jsonwebtoken');
const secretKey = '930EE82F5F09EC2951BF6FA7B42C72F2AA6645AE1241492D15E9486BE17A2F75'; // replace with your secret key

async function fetchAlby() {
  ably = new Ably.Realtime.Promise(await FetchFromSecrets("AblyAPIKey"));
  await ably.connection.once("connected");
}
fetchAlby();
const Setupneo4j = require("./Setupneo4j.js");

var driver;
Setupneo4j.SetupNeo4jClient().then(result =>{driver = result});

let client;
Cassandraclient.SetupCassandraClient(client).then((result) => {
  client = result;
});

const{incrementNumberOfStudents} = require("./GeospatialDB.js");


const {OnUserCreationFailed,handleTransactionCompletion,onTransactionStart} = require("./UserCreationTransactionHandling.js");

async function handleTransactionError(reason,params,uid) {
  await DeleteUser(uid);
}

async function CreateScyllaUser(UserParams) {
  const {
    username,
    phoneNumber,
    platform,
    uid,
    gender,
    highschool,
    grade,
    firstName,
    lastName,
    age,
    invitesLeft = 0
  } = UserParams;

  try {
    const UserCreationQuery = `
      INSERT INTO users (
        age, username, phoneNumber, coins, invitesLeft, 
        pollIndex, numberOfStars, platform, gender, highschool, grade, uid,
        albyTopicName, anonymousMode, firstName, lastName,  lastPollTime, numberOfPolls, pfp, 
        pfpHash, pfpMedium, pfpMediumHash, pfpSmall, pfpSmallHash, numberofreveals
      ) VALUES (?, ?, ?, 0, ?, -1, 0, ?, ?, ?, ?, ?, null, false, ?, ?, null, 0, null, null, null, null, null, null, 0)`;

    const params = [
      age,
      username,
      phoneNumber,
      invitesLeft,
      platform,
      gender,
      highschool,
      grade,
      uid,
      firstName,
      lastName
    ];

    await client.execute(UserCreationQuery, params, { prepare: true });
    await handleTransactionCompletion(uid, phoneNumber);
    return true;
  } catch (err) {
    console.log(err);
    await handleTransactionError("scylla", UserParams, uid);
    await OnUserCreationFailed(UserParams.transactionId);
    return false;
  }
}

async function CreateNeo4jUser(UserParams) {
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
    MATCH (c:Contact) 
    WHERE c.phoneNumber CONTAINS $phoneNumber
    RETURN c
  `;
    const ContactVertex = await session.run(checkContactQuery, { phoneNumber });

    

    if (ContactVertex.records.length == 0) {
      // If contact vertex for the user does not exist, create it
      let addContactQuery = `CREATE (c:Contact {phoneNumber: $phoneNumber, uid: $uid})`;
      await session.run(addContactQuery, UserParams);
    } else {
      // If contact vertex exists, create an edge from all the users connected as "HAS_CONTACT" to "HAS_CONTACT_IN_APP"
      let replaceEdgeQuery = `
        MATCH (u:User)-[oldEdge:HAS_CONTACT]->(c:Contact)
        WHERE c.phoneNumber CONTAINS $phoneNumber
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
    await handleTransactionError("neptune", UserParams, uid);
    await OnUserCreationFailed(UserParams.transactionId);
    return false;
  }finally{
    session.close();
  }
}

async function CreateFirebaseUser(UserParams) {
  var {uid, phoneNumber } = UserParams;
 
  try {
    const customToken = jwt.sign({ uid: uid }, secretKey);
    const query = 'INSERT INTO tokens (phoneNumber,jwt) VALUES (?,?)';
    await client.execute(query,[phoneNumber,customToken]);
    await handleTransactionCompletion(uid, phoneNumber);
    return true;
  } catch (err) {
    console.log(err);
    await handleTransactionError("jwt", UserParams, uid); //recursive 3 times , else return false
    await OnUserCreationFailed(UserParams.transactionId);
    return false;
  }
}

async function StartUserCreation(UserParams){
  await onTransactionStart(UserParams.transactionId,UserParams.phoneNumber);
  await CreateScyllaUser(UserParams);
  await CreateNeo4jUser(UserParams);
  await CreateFirebaseUser(UserParams);
  await incrementNumberOfStudents(UserParams.highschool);
}

async function DeleteUser(uid, deleteVerification = false) {
  const promises = [];
  const queries = [];

  // Fill the array with query objects
  const highschoolQuery = "SELECT highschool, phoneNumber FROM users WHERE uid = ? ALLOW FILTERING";
  const highschoolResult = await client.execute(highschoolQuery, [uid], {prepare: true});
 
  const highschool = highschoolResult.rows[0].highschool;
  const phoneNumber = highschoolResult.rows[0].phonenumber;


  queries.push({
    query: "DELETE FROM users WHERE uid = ?",
    params: [uid],
  });

  queries.push({
    query: "DELETE FROM inbox WHERE uid = ? ALLOW FILTERING",
    params: [uid],
  });

  queries.push({
    query: "DELETE FROM userPolls WHERE uid = ? ALLOW FILTERING",
    params: [uid],
  });

  queries.push({
    query: "DELETE FROM tokens WHERE phoneNumber = ? ALLOW FILTERING",
    params: [phoneNumber],
  });

  if (deleteVerification) {
    queries.push({
      query: "DELETE FROM verification WHERE phoneNumber = ? ALLOW FILTERING",
      params: [phoneNumber],
    });
  }

  const DeleteUserScyllaPromise = client.batch(queries, { prepare: true });


  promises.push(DeleteUserScyllaPromise);

  // Wait for all promises to resolve
  await Promise.all(promises);
}


//#region Contact Sync
var weight, EmojiContactsWeight;
async function getWeights() {
  weight = await FetchFromSecrets("ContactsWeightOnboarding");
  EmojiContactsWeight = await FetchFromSecrets("EmojiContactsWeightOnboarding");
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
  const useruid = await AuthHandler.GetUserDataFromJWT(req);
  if(useruid.Success==false){
    return res.send("No Jwt Token Included");
  }

  
  const { phoneNumber, contactsList } = req.body;

  console.log("ContactsList---------->",JSON.stringify(contactsList));
  const regex = emojiRegex();

  // Helper function to check if a string has any emoji characters using the emoji-regex package
  function hasEmoji(text) {
    return regex.test(text);
  }

  const session = driver.session();

  try {
    let uploadAndPushPromises = [];
    let contactQueries = [];
    for (let i = 0; i < contactsList.length; i++) {
      let contact = contactsList[i];
      //contact.phoneNumber = contact.phoneNumber.replace(/[^0-9]/g, '');
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
      MATCH (u:User {uid: $useruid})
      
      // Merge the HAS_CONTACT relationship
      WITH u, c
      MERGE (u)-[r:HAS_CONTACT]->(c)
    `;
    
    contactQueries.push({
        query: contactQuery,
        parameters: {
            contactPhone: contact.phoneNumber,
            useruid: useruid.uid,
            isFavorite: isFavorite,
            weight: weight,
            uploadResult: uploadResult ? uploadResult.Location : null,  // Assuming Location stores the URL of the uploaded file
            uid: uuid.v4()
        }
    });

      //console.log("contact edge added---->",contact.phoneNumber,"Self PhoneNumber--->",phoneNumber);
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


//#endregion

module.exports = {
  CreateScyllaUser,
  createNeptuneUser: CreateNeo4jUser,
  CreateFirebaseUser,
  DeleteUser,
  uploadUserContacts,
  StartUserCreation
};