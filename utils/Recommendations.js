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
async function CheckPlayerValidity(username) {
  const session = driver.session();
  try {
    const query = `
      MATCH (user:User {username: $username})
      RETURN user
      LIMIT 1
    `;
    const result = await session.run(query, { username: username });
    const userRecord = result.records[0];

    if (userRecord) {
      return true;
    } else {
      return false;
    }
  } catch (error) {
    session.close();
    console.error('Error checking player validity:', error);
    return false;
  }
  finally {
    session.close();
  }
}

/// TODO: complete
// Fetch all the friends which have the coin sub for the poll active
// Set the index and status of the subscriptions users has active after use
async function FetchFriendsWithSubsActive(uid) {
  if (!CheckPlayerValidity(uid)) {
    return { success: false, data: "User does not exist" };
  }
  try {
    // Get the user
    const result = await client.execute(
      "SELECT TempSubCrush, Friends FROM Users WHERE uid = ?",
      [uid]
    );
    const user = result.first();

    // If the user does not exist or TempSubCrush is not true, simply return
    if (!user || !user.TempSubCrush) {
      const _result = await client.execute(
        "SELECT TempSubCrush, Friends FROM Users WHERE uid = ?",
        [uid]
      );
      const _user = result.first();
      if (!_user || _user.TempSubTop <= 0) {
        return null;
      }
      await client.execute("UPDATE Users SET TempTopCrush = ? WHERE uid = ?", [
        _user.TempSubTop - 1,
        uid,
      ]);

      return _user.username;
    }
    // Update TempSubCrush to false
    await client.execute(
      "UPDATE Users SET TempSubCrush = false WHERE uid = ?",
      [uid]
    );

    return user.username; /// why tf is it returning this
  } catch (err) {
    console.error(err);
  }
}

async function getMutualFriends(uid, otheruid) {
  const session = driver.session();

  try {
    // Cypher query to find mutual friends based on username
    const query = `
      MATCH (user:User {uid: $uid})-[:FRIENDS_WITH]->(friend:User)<-[:FRIENDS_WITH]-(otherUser:User {uid: $otheruid})
      RETURN friend.username as mutualFriend
    `;

    // Running the Cypher query
    const result = await session.run(query, { uid: uid, otheruid: otheruid });

    // Extracting the mutual friends from the result
    const mutualFriends = result.records.map(record => record.get('mutualFriend'));

    return mutualFriends.length;
  } catch (error) {
    console.error('Error in getting mutual friends:', error);
    return 0; // return 0 mutual friends in case of an error
  }
  finally {
    session.close();
  }
}

async function InsertMutualCount(uid, filteredList) {
  index = 0;
  for (let index = 0; index < filteredList.length; index++) {
    const mutualCount = await getMutualFriends(uid, filteredList[index].uid);
    filteredList[index].mutualCount = mutualCount;
  }
}
//#endregion

//#region Actual Fetching
async function GetRecommendationsOnboarding(
  uid,
  page_peopleYouMayKnow,
  pagesize_PeopleYouMayKnow,
  page_peopleInContacts,
  pagesize_peopleInContacts,
  grade,
  highschool
) {
  // Calculate the offset
  const offset_PeopleYouMayKnow = Math.floor
    (page_peopleYouMayKnow - 1) * pagesize_PeopleYouMayKnow;
  const offset_peopleInContacts = Math.floor
    (page_peopleInContacts - 1) * pagesize_peopleInContacts;
  // Parameters
  const parameters = {
    uid: uid,
    highschool: highschool,
    offset_PeopleYouMayKnow: neo4j.int(offset_PeopleYouMayKnow),
    limit_PeopleYouMayKnow: neo4j.int(Math.floor(page_peopleYouMayKnow * pagesize_PeopleYouMayKnow)),
    grade: grade,
    EmojiContactsWeightOnboarding: EmojiContactsWeightOnboarding,
    ContactsWeightOnboarding: ContactsWeightOnboarding,
    PhotoContactsWeightOnboarding: PhotoContactsWeightOnboarding,
    offset_peopleInContacts: neo4j.int(offset_peopleInContacts),
    limit_peopleInContacts: neo4j.int(Math.floor(page_peopleInContacts * pagesize_peopleInContacts)),
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
  WITH user, COLLECT(otherUser)[..$limit_PeopleYouMayKnow] AS PeopleYouMayKnow
  
  OPTIONAL MATCH (user)-[:HAS_CONTACT_IN_APP]->(contact)
  WITH user, 
       PeopleYouMayKnow,
       CASE 
           WHEN contact.fav = true THEN [contact IN contact.weight WHERE contact.weight = $EmojiContactsWeightOnboarding]
           ELSE [contact IN contact.weight WHERE contact.weight = $ContactsWeightOnboarding]
       END AS contactsEmoji,
       CASE 
           WHEN contact.photo = true THEN [contact IN contact.weight WHERE contact.weight = $PhotoContactsWeightOnboarding]
           ELSE [contact IN contact.weight WHERE contact.weight = $ContactsWeightOnboarding]
       END AS contactsPhoto
  RETURN {
      PeopleYouMayKnow: PeopleYouMayKnow,
      peopleInContacts: contactsEmoji + contactsPhoto
  } AS result
  SKIP $offset_peopleInContacts
  LIMIT $limit_peopleInContacts
  
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
      page_peopleInContacts: page_peopleInContacts,
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
  pagesize_FriendsOfFriends,
  pagesize_SchoolUsers,
  pagesize_Contacts,
  highschool,
  grade,
  query
) {
  const session = driver.session();
  try {
    const parameters = {
      uid: uid,
      highschool: highschool,
      limit_FriendsOfFriends: neo4j.int(pagesize_FriendsOfFriends),
      limit_SchoolUsers: neo4j.int(pagesize_SchoolUsers),
      grade: grade,
      limit_Contacts: neo4j.int(pagesize_Contacts),
      query: query || '', // add the query parameter
    };
    
    // Cypher Query
    const cypherQuery = `
    MATCH (user:User {uid: $uid})
    
    // 1. People in the same high school
    OPTIONAL MATCH (user)-[:ATTENDS_SCHOOL]->(school)
    WHERE school.name = $highschool
    OPTIONAL MATCH (otherUser:User)-[:ATTENDS_SCHOOL]->(school)
    WHERE user <> otherUser AND toLower(otherUser.fname) CONTAINS toLower($query) // add the condition here
    WITH user, COLLECT(otherUser)[..$limit_SchoolUsers] AS PeopleInSameSchool
         
    // 2. People in contacts
    OPTIONAL MATCH (user)-[:HAS_CONTACT]->(contact)
    WHERE toLower(contact.fname) CONTAINS toLower($query) // add the condition here
    WITH user, PeopleInSameSchool, COLLECT(contact)[..$limit_Contacts] AS contacts
    
    // 3. Friends of user's friends
    OPTIONAL MATCH (user)-[:FRIENDS_WITH]->(:User)-[:FRIENDS_WITH]->(friendsOfFriends:User)
    WHERE NOT (user)-[:FRIENDS_WITH]->(friendsOfFriends) AND user <> friendsOfFriends AND toLower(friendsOfFriends.fname) CONTAINS toLower($query) // add the condition here
    WITH user, PeopleInSameSchool, contacts, COLLECT(DISTINCT friendsOfFriends)[..$limit_FriendsOfFriends] AS FriendsOfFriends
        
    // 4. People connected to user with HAS_CONTACT_IN_APP
    OPTIONAL MATCH (user)-[:HAS_CONTACT_IN_APP]->(hasContactInAppUser:User)
    WHERE toLower(hasContactInAppUser.fname) CONTAINS toLower($query) // add the condition here
    WITH user, PeopleInSameSchool, contacts, FriendsOfFriends, COLLECT(DISTINCT hasContactInAppUser)[..$limit_Contacts] AS ContactsInApp
        
    RETURN {
      PeopleInSameSchool: PeopleInSameSchool,
      peopleInContacts: contacts,
      FriendsOfFriends: FriendsOfFriends,
      ContactsInApp: ContactsInApp
    } AS result
    `;
    
    // Execute the query
    const result = session.run(cypherQuery, parameters);
    //#endregion
    const [Recommendations] = await Promise.allSettled([result]);

    const data = Recommendations.value.records[0]._fields;

    const PeopleInSameSchool = extractProperties(data[0].PeopleInSameSchool);
    const peopleInContacts = extractProperties(data[0].peopleInContacts);
    const FriendsOfFriends = extractProperties(data[0].FriendsOfFriends);
    //const ContactsInApp = extractProperties(data[0].ContactsInApp)

    const returndata = {
    
      friendsInSchool: Recommendations.value ? PeopleInSameSchool : [],
      friendsOfFriends: Recommendations.value ? FriendsOfFriends : [],
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

    const result = await session.run(cypherQuery, {
      uid: uid,
      highschool: highschool,
      grade: grade,
    });


    const data = result.records[0]._fields;
    const propertiesList = data[0].Users.map(user => user.properties);
    return propertiesList;
  }
  catch (err) {
    console.log(err);
  }
  finally {
    session.close();
  }
}
//#endregion

async function ExecuteCustomQuery() {
  const RecommendationsPromise = await GetRecommendationsQuestions(null, null, null);
  console.log(RecommendationsPromise);
}


setTimeout(async () => {
  //await ExecuteCustomQuery();
}, 10000);


module.exports = {
  FetchFriendsWithSubsActive,
  GetRecommendationsOnboarding,
  GetRecommendationsExploreSection,
  GetRecommendationsQuestions,
};
