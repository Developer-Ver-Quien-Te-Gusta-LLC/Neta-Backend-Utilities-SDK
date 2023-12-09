const { getKV } = require("./KV.js");
const cassandra = require("./SetupCassandra.js");
const Setupneo4j = require("./Setupneo4j.js");
var driver;
Setupneo4j.SetupNeo4jClient().then(result => { driver = result });

const neo4j = require("neo4j-driver");
//Setup scylla Client
var client;
cassandra
  .GetClient()
  .then(async (CassandraClient) => {
    client = CassandraClient;
  });

var SameGradeWeightOnboarding,
  SameHighSchoolWeightOnboarding,
  PhotoContactsWeightOnboarding,
  EmojiContactsWeightOnboarding,
  ContactsWeightOnboarding,
  EmojiContactsWeightQuestions,
  ContactsWeightQuestions,
  PhotoContactsWeightQuestions,
  SameHighSchoolWeightQuestions,
  FriendsWeightQuestions,
  SameGradeWeightQuestions,
  TopFriendsWeightsQuestions,
  FriendsOfFriendsWeightQuestions;

async function fetchWeights() {
  // Fetch all weights concurrently
  const [
    SameGradeWeightOnboarding_,
    SameHighSchoolWeightOnboarding_,
    PhotoContactsWeightOnboarding_,
    EmojiContactsWeightOnboarding_,
    ContactsWeightOnboarding_,
    EmojiContactsWeightQuestions_,
    ContactsWeightQuestions_,
    PhotoContactsWeightQuestions_,
    SameHighSchoolWeightQuestions_,
    FriendsWeightQuestions_,
    SameGradeWeightQuestions_,
    TopFriendsWeightsQuestions_,
    FriendsOfFriendsWeightQuestions_,
  ] = await Promise.allSettled([
    getKV(["SameGradeWeightOnboarding"]),
    getKV(["SameHighSchoolWeightOnboarding"]),
    getKV(["PhotoContactsWeightOnboarding"]),
    getKV(["EmojiContactsWeightOnboarding"]),
    getKV(["ContactsWeightOnboarding"]),
    getKV(["EmojiContactsWeightQuestions"]),
    getKV(["ContactsWeightQuestions"]),
    getKV(["PhotoContactsWeightQuestions"]),
    getKV(["SameHighSchoolWeightQuestions"]),
    getKV(["FriendsWeightQuestions"]),
    getKV(["SameGradeWeightQuestions"]),
    getKV(["TopFriendsWeightsQuestions"]),
    getKV(["FriendsOfFriendsWeightQuestions"]),
  ]);

  // Assign weights to the initialized vars
  SameGradeWeightOnboarding = SameGradeWeightOnboarding_.value;
  SameHighSchoolWeightOnboarding = SameHighSchoolWeightOnboarding_.value;
  PhotoContactsWeightOnboarding = PhotoContactsWeightOnboarding_.value;
  EmojiContactsWeightOnboarding = EmojiContactsWeightOnboarding_.value;
  ContactsWeightOnboarding = ContactsWeightOnboarding_.value;
  EmojiContactsWeightQuestions = EmojiContactsWeightQuestions_.value;
  ContactsWeightQuestions = ContactsWeightQuestions_.value;
  PhotoContactsWeightQuestions = PhotoContactsWeightQuestions_.value;
  SameHighSchoolWeightQuestions = SameHighSchoolWeightQuestions_.value;
  FriendsWeightQuestions = FriendsWeightQuestions_.value;
  SameGradeWeightQuestions = SameGradeWeightQuestions_.value;
  TopFriendsWeightsQuestions = TopFriendsWeightsQuestions_.value;
  FriendsOfFriendsWeightQuestions = FriendsOfFriendsWeightQuestions_.value;

  //const Recommendations = await GetRecommendationsOnboarding("999d360e-7a23-49f6-8349-cbcdf59ce84a",1,10,1,10,10,"neta");

}
fetchWeights(); // fetch the weights as soon as the module is imported
//#endregion
//#region Helper Functions
function extractProperties(arr) {
  // Check if the input is non-null and an array
  if (arr && Array.isArray(arr)) {
    return arr.map(user => user.properties);
  }
  return [];
}
// CheckPlayerValidity function

/// TODO: complete
// Fetch all the friends which have the coin sub for the poll active
// Set the index and status of the subscriptions users has active after use


//#endregion

//#region Actual Fetching
async function GetRecommendationsOnboarding(
  uid,
  page_peopleYouMayKnow,
  page_peopleInContacts,
  grade,
  highschool
) {
  // Calculate the offset
  const offset_PeopleYouMayKnow = (page_peopleYouMayKnow - 1) * 10;
  const offset_peopleInContacts = (page_peopleInContacts - 1) * 10;

  var Pn = await client.execute("SELECT phonenumber FROM users WHERE uid = ?", [uid], { prepare: true });
  Pn = Pn.rows[0].phonenumber;

  const parameters = {
    uid: uid,
    highschool: highschool,
    offset_PeopleYouMayKnow: neo4j.int(offset_PeopleYouMayKnow),
    limit_PeopleYouMayKnow: neo4j.int(10),
    grade: grade,
    EmojiContactsWeightOnboarding: EmojiContactsWeightOnboarding,
    ContactsWeightOnboarding: ContactsWeightOnboarding,
    PhotoContactsWeightOnboarding: PhotoContactsWeightOnboarding,
    offset_peopleInContacts: neo4j.int(offset_peopleInContacts),
    limit_peopleInContacts: neo4j.int(40),
    phoneNumber: Pn,
  };

  const session = driver.session();
  try {
    const cypherQuery = `
    MATCH (user:User {uid: $uid})
    OPTIONAL MATCH (user)-[:ATTENDS_SCHOOL]->(school)
    WHERE school.name = $highschool
    
    // Find other users attending the same high school
    OPTIONAL MATCH (otherUser:User)-[:ATTENDS_SCHOOL]->(school)
    WHERE user <> otherUser
    WITH user, COLLECT(otherUser) AS PeopleYouMayKnow
    
    // Fetch all contacts of the contact with the provided phone number
    OPTIONAL MATCH (contact:Contact {phoneNumber: $phoneNumber})-[:HAS_CONTACT]->(otherContact:Contact)
    WITH user, PeopleYouMayKnow, COLLECT(otherContact) AS contacts

    RETURN {
        PeopleYouMayKnow: PeopleYouMayKnow[$offset_PeopleYouMayKnow..$limit_PeopleYouMayKnow],
        peopleInContacts: contacts[$offset_peopleInContacts..$limit_peopleInContacts]
    } AS result
    `;

    const OnboardingRecommendationsPromise = session.run(cypherQuery, parameters);

    const [Recommendations] = await Promise.allSettled([
      OnboardingRecommendationsPromise,
    ]);

    const data = Recommendations.value.records[0]._fields;

    const peopleYouMayKnowProperties = extractProperties(data[0].PeopleYouMayKnow);
    const peopleInContactsProperties = extractProperties(data[0].peopleInContacts);

    // Return both the result and the next page number for paging
    return {
      success: true,
      page_peopleYouMayKnow: page_peopleYouMayKnow,
      Recommendations: { peopleYouMayKnow: peopleYouMayKnowProperties, peopleInContacts: peopleInContactsProperties },
    };
  }
  catch (err) {
    console.log(err);
    session.close();
  }
  finally {
    session.close();
  }
}

// Get Recommendations for friends while in the explore section (after onboarding)
async function GetRecommendationsExploreSection(
  uid,
  page_FriendsOfFriends,
  page_SchoolUsers,
  page_Contacts,
  highschool,
  grade,
  query
) {
  const session = driver.session();
  try {
    const parameters = {
      uid: uid,
      highschool: highschool,
      grade: grade,
      query: query || '', // add the query parameter
      offset_FriendsOfFriends: neo4j.int((page_FriendsOfFriends - 1) * 10),
      limit_FriendsOfFriends: neo4j.int(page_FriendsOfFriends * 10),
      offset_SchoolUsers: neo4j.int((page_SchoolUsers - 1) * 10),
      limit_SchoolUsers: neo4j.int(page_SchoolUsers * 10),
      offset_Contacts: neo4j.int((page_Contacts - 1) * 10),
      limit_Contacts: neo4j.int(page_Contacts * 10),
    };

    const cypherQuery = `
    MATCH (user:User {uid: $uid})
    
    // Split the query into first name and last name
    WITH user, split($query, ' ') AS nameParts
    
    // 1. People in the same high school
    OPTIONAL MATCH (user)-[:ATTENDS_SCHOOL]->(school)
    WHERE school.name = $highschool
    OPTIONAL MATCH (otherUser:User)-[:ATTENDS_SCHOOL]->(school)
    WHERE user <> otherUser AND toLower(otherUser.fname) CONTAINS toLower(nameParts[0]) AND (size(nameParts) = 1 OR toLower(otherUser.lname) CONTAINS toLower(nameParts[1]))
    WITH user, nameParts, COLLECT(otherUser)[$offset_SchoolUsers..$limit_SchoolUsers] AS PeopleInSameSchool
    
    // 2. People in contacts
    OPTIONAL MATCH (user)-[:HAS_CONTACT]->(contact)
    WITH user, nameParts, PeopleInSameSchool, COLLECT(contact)[$offset_Contacts..$limit_Contacts] AS contacts
    
    // 3. Friends of user's friends
    OPTIONAL MATCH (user)-[:FRIENDS_WITH]->(:User)-[:FRIENDS_WITH]->(friendsOfFriends:User)
    WHERE NOT (user)-[:FRIENDS_WITH]->(friendsOfFriends) AND user <> friendsOfFriends AND toLower(friendsOfFriends.fname) CONTAINS toLower(nameParts[0]) AND (size(nameParts) = 1 OR toLower(friendsOfFriends.lname) CONTAINS toLower(nameParts[1]))
    WITH user, nameParts, PeopleInSameSchool, contacts, COLLECT(DISTINCT friendsOfFriends)[$offset_FriendsOfFriends..$limit_FriendsOfFriends] AS FriendsOfFriends
    
    // 4. People connected to user with HAS_CONTACT_IN_APP
    OPTIONAL MATCH (user)-[:HAS_CONTACT_IN_APP]->(hasContactInAppUser:User)
    WHERE toLower(hasContactInAppUser.fname) CONTAINS toLower(nameParts[0]) AND (size(nameParts) = 1 OR toLower(hasContactInAppUser.lname) CONTAINS toLower(nameParts[1]))
    WITH user, PeopleInSameSchool, contacts, FriendsOfFriends, COLLECT(DISTINCT hasContactInAppUser)[$offset_Contacts..$limit_Contacts] AS ContactsInApp
    
    RETURN {
      PeopleInSameSchool: PeopleInSameSchool,
      peopleInContacts: contacts,
      FriendsOfFriends: FriendsOfFriends,
      ContactsInApp: ContactsInApp
    } AS result
    `;

    const otherFriendsQuery = `
    WITH split($query, ' ') AS nameParts
    MATCH (u:User)
    WHERE 
      CASE 
        WHEN size(nameParts) = 1 THEN toLower(u.fname) = toLower(nameParts[0])
        WHEN size(nameParts) > 1 THEN toLower(u.fname) = toLower(nameParts[0]) AND toLower(u.lname) = toLower(nameParts[1])
        ELSE FALSE
      END
    RETURN {OtherFriends:u} AS result
`;



    // Execute the query
    var Recommendations = await session.run(cypherQuery, parameters);
    Recommendations.value = Recommendations;

    var otherUser = await session.run(otherFriendsQuery,parameters);
    otherUser = otherUser.records[0]._fields;

    console.log("Recommendations--------->",JSON.stringify(otherUser));
    //#endregion
    

    const data = Recommendations.value.records[0]._fields;

    const PeopleInSameSchool = extractProperties(data[0].PeopleInSameSchool).map(user => ({ ...user, firstname: user.fname, lastname: user.lname }));
    const peopleInContacts = extractProperties(data[0].peopleInContacts);//.map(user => ({...user, firstname: user.fname, lastname: user.lname}));
    const FriendsOfFriends = extractProperties(data[0].FriendsOfFriends).map(user => ({ ...user, firstname: user.fname, lastname: user.lname }));
    const OtherFriends = otherUser[0].OtherFriends.properties.map(user => ({ ...user, firstname: user.fname, lastname: user.lname }));


    peopleInContacts.forEach(person => {
      person.mutualCount = 0;
    });


    //const ContactsInApp = extractProperties(data[0].ContactsInApp)

    for (let i = 0; i < PeopleInSameSchool.length; i++) {
      const mutualFriendsQuery = `
        MATCH (user:User {uid: $uid})-[:FRIENDS_WITH]->(mutualFriend:User)<-[:FRIENDS_WITH]-(otherUser:User {uid: $otherUid})
        RETURN COUNT(mutualFriend) AS mutualFriendsCount
      `;
      const mutualFriendsResult = await session.run(mutualFriendsQuery, { uid: uid, otherUid: PeopleInSameSchool[i].uid });
      const mutualFriendsCount = mutualFriendsResult.records[0].get('mutualFriendsCount');
      PeopleInSameSchool[i].mutualCount = mutualFriendsCount.high;
    }

    for (let i = 0; i < FriendsOfFriends.length; i++) {
      const mutualFriendsQuery = `
        MATCH (user:User {uid: $uid})-[:FRIENDS_WITH]->(mutualFriend:User)<-[:FRIENDS_WITH]-(otherUser:User {uid: $otherUid})
        RETURN COUNT(mutualFriend) AS mutualFriendsCount
      `;
      const mutualFriendsResult = await session.run(mutualFriendsQuery, { uid: uid, otherUid: FriendsOfFriends[i].uid });
      const mutualFriendsCount = mutualFriendsResult.records[0].get('mutualFriendsCount');
      FriendsOfFriends[i].mutualCount = mutualFriendsCount.high;
    }

    const returndata = {
      friendsInSchool: Recommendations.value ? PeopleInSameSchool : [],
      friendsOfFriends: Recommendations.value ? FriendsOfFriends : [],
      otherFriends: OtherFriends,
      invites: Recommendations.value ? peopleInContacts : [],
      friendsOfFriendsCount: Recommendations.value ? FriendsOfFriends.length : 0,
      friendsInSchoolCount: Recommendations.value ? PeopleInSameSchool.length : 0,
    }

    //console.log(Recommendations.value? PeopleInSameSchool.length: 0);
    // console.log("returndata--->",returndata);
    return returndata;
  } catch (err) {
    session.close();
    console.log(err);
  }
  finally {
    session.close();
  }
}

async function GetRecommendationsQuestions(uid, highschool, grade) {
  const session = driver.session();
  try {
    const cypherQuery = `
  MATCH (user:User {uid: $uid})

// 1. People in the same high school
OPTIONAL MATCH (user)-[:ATTENDS_SCHOOL]->(school)
WHERE school.name = $highschool
OPTIONAL MATCH (otherUser:User)-[:ATTENDS_SCHOOL]->(school)
WHERE user <> otherUser
WITH user, COLLECT(otherUser) AS PeopleInSameSchool
    
// 3. Friends of user's friends
OPTIONAL MATCH (user)-[:FRIENDS_WITH]->(:User)-[:FRIENDS_WITH]->(friendsOfFriends:User)
WHERE NOT (user)-[:FRIENDS_WITH]->(friendsOfFriends) AND user <> friendsOfFriends
WITH user, PeopleInSameSchool, COLLECT(DISTINCT friendsOfFriends) AS FriendsOfFriends
    
// 4. People connected to user with HAS_CONTACT_IN_APP
OPTIONAL MATCH (user)-[:HAS_CONTACT_IN_APP]->(hasContactInAppUser:User)
WITH user, PeopleInSameSchool, FriendsOfFriends, COLLECT(DISTINCT hasContactInAppUser) AS ContactsInApp
    
// Combine all the lists and pick 4 users randomly
WITH user, 
     PeopleInSameSchool + FriendsOfFriends + ContactsInApp AS allPossibleConnections
RETURN {
  Users: apoc.coll.randomItems(allPossibleConnections, 4)
} AS result
  `;

    const result = await session.run(cypherQuery, { uid, highschool, grade });
    let propertiesList = result.records[0] && result.records[0]._fields ? result.records[0]._fields[0].Users.map(user => user.properties) : [];

    // If the number of users is less than 4, add more users with "HAS_CONTACT" relationship
    if (propertiesList.length < 4) {
      const additionalUsersQuery = `
        MATCH (user:User {uid: $uid})-[:HAS_CONTACT]->(additionalUser:User)
        RETURN additionalUser
        LIMIT ${4 - propertiesList.length}
      `;



      const additionalUsersResult = await session.run(additionalUsersQuery, { uid, existingUsers: propertiesList });
      // console.log("additionalUsersResult----------------->",JSON.stringify(additionalUsersResult));
      const additionalUsers = additionalUsersResult.records.map(record => record.get('additionalUser').properties);
      //console.log("additionalUsers----------------->",JSON.stringify(additionalUsers));

      propertiesList = [...propertiesList, ...additionalUsers];
    }

    let { rows: [{ crushcount: TempCrushSubCount }] } = await client.execute('SELECT crushCount FROM users WHERE uid = ?', [uid], { prepare: true });
    TempCrushSubCount = parseInt(TempCrushSubCount);

    if (TempCrushSubCount > 0) {
      const topFriends = await getAllTopFriends(uid);
      if (topFriends.length > 0) {
        propertiesList[3] = topFriends[0].Data;
        await client.execute("UPDATE users SET crushCount = ? WHERE uid = ?", [TempCrushSubCount - 1, uid], { prepare: true });
      }
    }

    // Shuffle the list before returning
    return propertiesList.sort(() => Math.random() - 0.5);
  } catch (err) {
    console.log(err);
  } finally {
    session.close();
  }
}

async function getAllTopFriends(uid) {
  const session = driver.session();
  try {
    const result = await session.run(
      `MATCH (a:User {uid: $uid})-[r:TOP_FRIEND]->(b:User)
         RETURN r, b`,
      {
        uid: uid,
      }
    );
    const relationshipData = [];

    result.records.forEach((record) => {
      const r = record._fields[0]; // Assuming the relationship data is in the first field
      const b = record._fields[1]; // Assuming the target node data is in the second field
      const Data = r.properties;
      Data.numberofanswered = Data.numberofanswered.low;

      relationshipData.push({ Data });
    });

    //console.log(JSON.stringify(result));
    return relationshipData;
  } catch (error) {
    console.error(error);
    return [];
  } finally {
    await session.close();
  }
}
//#endregion

module.exports = {
  GetRecommendationsOnboarding,
  GetRecommendationsExploreSection,
  GetRecommendationsQuestions,
};
