const gremlin = require('gremlin');
const traversal = gremlin.process.AnonymousTraversalSource.traversal;
const DriverRemoteConnection = gremlin.driver.DriverRemoteConnection;
const Graph = gremlin.structure.Graph;

const graph = new Graph();
const g = graph
  .traversal()
  .withRemote(new DriverRemoteConnection("wss://hostname:port/gremlin", "{}"));

const { IsUserInvited } = require("./InviteHandler.js");
const { FetchFromSecrets } = require("./AwsSecrets.js");
const { getKV } = require("./KV.js");

const cassandra = require('cassandra-driver');

let client;

async function fetchCassandra() {
  const contactPoints = await FetchFromSecrets("contactPoints");
    const localDataCenter = await FetchFromSecrets("localDataCenter");
    const keyspace = await FetchFromSecrets("keyspace");

    client = new cassandra.Client({
        contactPoints: [contactPoints],
        localDataCenter: localDataCenter,
        keyspace:keyspace,
    });

    await client.connect();
}
fetchCassandra();




let SameGradeWeightOnboarding, SameGradeWeightExplore, SameGradeWeightQuestions,
    SameHighSchoolWeightOnboarding, SameHighSchoolWeightExplore, SameHighSchoolWeightQuestions,
    FriendsWeightOnboarding, FriendsWeightExplore, FriendsWeightQuestions,
    FriendsOfFriendsWeightOnboarding, FriendsOfFriendsWeightExplore, FriendsOfFriendsWeightQuestions,
    EmojiContactsWeightOnboarding, EmojiContactsWeightExplore, EmojiContactsWeightQuestions,
    ContactsWeightOnboarding, ContactsWeightExplore, ContactsWeightQuestions,TopFriendsWeightsQuestions;

async function fetchWeights() {
  // Fetch all weights concurrently
  const [SameGradeWeights, SameHighSchoolWeights, FriendsWeights, FriendsOfFriendsWeights, EmojiContactsWeights, ContactsWeights,TopFriendsWeights] = await Promise.allSettled([
    getKV(["SameGradeWeightOnboarding", "SameGradeWeightExplore", "SameGradeWeightQuestions"]),
    getKV(["SameHighSchoolWeightOnboarding", "SameHighSchoolWeightExplore", "SameHighSchoolWeightQuestions"]),
    getKV(["FriendsWeightOnboarding", "FriendsWeightExplore", "FriendsWeightQuestions"]),
    getKV(["FriendsOfFriendsWeightOnboarding", "FriendsOfFriendsWeightExplore", "FriendsOfFriendsWeightQuestions"]),
    getKV(["EmojiContactsWeightOnboarding", "EmojiContactsWeightExplore", "EmojiContactsWeightQuestions"]),
    getKV(["ContactsWeightOnboarding", "ContactsWeightExplore", "ContactsWeightQuestions"]),
    getKV(["TopFriendsWeightsQuestions"])
  ]);

  // Destructure weights for each category
 /* [SameGradeWeightOnboarding, SameGradeWeightExplore, SameGradeWeightQuestions] = SameGradeWeights;
  [SameHighSchoolWeightOnboarding, SameHighSchoolWeightExplore, SameHighSchoolWeightQuestions] = SameHighSchoolWeights;
  [FriendsWeightOnboarding, FriendsWeightExplore, FriendsWeightQuestions] = FriendsWeights;
  [FriendsOfFriendsWeightOnboarding, FriendsOfFriendsWeightExplore, FriendsOfFriendsWeightQuestions] = FriendsOfFriendsWeights;
  [EmojiContactsWeightOnboarding, EmojiContactsWeightExplore, EmojiContactsWeightQuestions] = EmojiContactsWeights;
  [ContactsWeightOnboarding, ContactsWeightExplore, ContactsWeightQuestions] = ContactsWeights;
  [TopFriendsWeightsQuestions] = TopFriendsWeights;*/
}

fetchWeights(); // fetch the weights as soon as the module is imported
//#endregion

//Returns Users from json
function ExtractUsersFromJson(json) {
  var users = [];
  for (var i = 0; i < json.length; i++) {
    var user = json[i].username;
    users.push(user);
  }
  return users;
}

//Given a list of arrays and their weights , returns a weighted array 
//if return four is true , returns only 4 users
function WeightArraysUsingProbability(data, weights, returnfour) {
  // Compute the sum of all weights
  var weightSum = weights.reduce((acc, cur) => acc + cur, 0);

  // Normalize weights so that they sum to 1
  var normalizedWeights = weights.map(weight => weight / weightSum);

  var FinalArray = [];
  for (var i = 0; i < data.length; i++) {
    let random = data[i]
      .sort(() => 0.5 - Math.random())
      .slice(0, Math.ceil(data[i].length * normalizedWeights[i]));
    for (let i = 0; i < random.length; i++) {
      FinalArray.push(random[i]);
    }
  }
  let _FinalArray = [...new Set(FinalArray)];
  if (returnfour) {
    _FinalArray = _FinalArray.slice(0, 4);
  }
  return _FinalArray;
}



// CheckPlayerValidity function
async function CheckPlayerValidity(username) {
  const userResult = await g.V().has("User", "username", username).next();
  if (userResult.value == null) {
    return false;
  } else {
    return true;
  }
}

// Fetch all the friends which have the coin sub for the poll active 
// Set the index and status of the subscriptions users has active after use
async function FetchFriendsWithSubsActive(username) {
  if (!CheckPlayerValidity(username)) {
    return { success: false, data: "User does not exist" };
  }
  try {
    // Get the user
    const result = await client.execute(
      "SELECT TempSubCrush, Friends FROM Users WHERE PhoneNumber = ?",
      [phoneNumber]
    );
    const user = result.first();

    // If the user does not exist or TempSubCrush is not true, simply return
    if (!user || !user.TempSubCrush) {
      const _result = await client.execute(
        "SELECT TempSubCrush, Friends FROM Users WHERE PhoneNumber = ?",
        [phoneNumber]
      );
      const _user = result.first();
      if (!_user || _user.TempSubTop <= 0) {
        return null;
      }
      await client.execute(
        "UPDATE Users SET TempTopCrush = ? WHERE PhoneNumber = ?",
        [_user.TempSubTop - 1, phoneNumber]
      );

      return _user.username;
    }
    // Update TempSubCrush to false
    await client.execute(
      "UPDATE Users SET TempSubCrush = false WHERE PhoneNumber = ?",
      [phoneNumber]
    );

    return user.username;
  } catch (err) {
    console.error(err);
  }
}


// InviteFriends function
async function InviteFriends(username) {
  //TODO
  if (!CheckPlayerValidity(username)) {
    return { success: false, data: "User does not exist" };
  }
}

async function GetRecommendationsOnboarding(username, pagelimit) {
  // Check user validity first
  if (!(await CheckPlayerValidity(username))) {
    return { success: false, error: "User does not exist" };
  }

  // Calculate offset
 // const offset = pagelimit * (pagenumber - 1);

  const data = await g
    .V()
    .has("User", "username", username)
    .union(
      __.out("contactsList").in("phoneNumber").range(offset, offset + pagelimit),
      __.out("emojicontactsList").in("phoneNumber").range(offset, offset + pagelimit),
      __.out("highSchool"),
      __.out("highSchool").in("highSchool").has("User", "grade", __.values("grade"))
    )
    .valueMap("username")
    .toList();

  const UsersInContactsResult = ExtractUsersFromJson(data[0]);
  const UsersInContactsWithEmojisResult = ExtractUsersFromJson(data[1]);
  const SchoolMatesResult = ExtractUsersFromJson(data[2]);
  const ClassMatesResult = ExtractUsersFromJson(data[3]);

  const allUsers = [
    ...UsersInContactsResult,
    ...UsersInContactsWithEmojisResult,
    ...SchoolMatesResult,
    ...ClassMatesResult,
  ];

  const Result = WeightArraysUsingProbability(
    [allUsers],
    [ContactsWeightOnboarding, EmojiContactsWeightOnboarding, SameHighSchoolWeightOnboarding, SameGradeWeightOnboarding],
    false
  );
  var invited = await IsUserInvited(username);
  if (invited != false) Result.concat(invited[0].inviter);

  // Return both the result and the next page number for paging
  return { success: true, data: Result, nextPage: pagenumber + 1 };
}

// Get Recommendations for friends while in the explore section (after onboarding)
async function GetRecommendationsExploreSection(username, page) {
  const pagesize = getKV("pagesize"); // Assuming this retrieves the number of items per page
  
  // Calculate the offset
  const offset = (page - 1) * pagesize;

  // Check user validity first
  if (!(await CheckPlayerValidity(username))) {
    return { success: false, error: "User does not exist" };
  }

  const data = await g
    .V()
    .has("User", "username", username)
    .union(
      // Fetch users from contacts
      __.out("contactsList").in("phoneNumber").range(offset, offset + pagesize),
      // Fetch users from favorite contacts
      __.out("emojicontactsList").in("phoneNumber").range(offset, offset + pagesize),
      // Fetch schoolmates
      __.out("highSchool").range(offset, offset + pagesize),
      // Fetch classmates
      __.out("highSchool").in("highSchool").has(
        "User",
        "grade",
        __.values("grade")
      ).range(offset, offset + pagesize),
      // Fetch friends
      __.out("FRIENDS_WITH").range(offset, offset + pagesize),
      // Fetch friends of friends
      __.out("FRIENDS_WITH").out("FRIENDS_WITH").dedup().where(P.neq("self")).range(offset, offset + pagesize)
    )
    .valueMap("username")
    .toList();

  const UsersInContactsResult = ExtractUsersFromJson(data[0]);
  const UsersInContactsWithEmojisResult = ExtractUsersFromJson(data[1]);
  const SchoolMatesResult = ExtractUsersFromJson(data[2]);
  const ClassMatesResult = ExtractUsersFromJson(data[3]);
  const FriendsResult = ExtractUsersFromJson(data[4]);
  const FriendsOfFriendsResult = ExtractUsersFromJson(data[5]);

  const allUsers = [
    ...UsersInContactsResult,
    ...UsersInContactsWithEmojisResult,
    ...SchoolMatesResult,
    ...ClassMatesResult,
    ...FriendsResult,
    ...FriendsOfFriendsResult,
  ];

  const Result = WeightArraysUsingProbability(
    [
      allUsers,
    ],
    [
      ContactsWeightExplore,
      EmojiContactsWeightExplore,
      SameHighSchoolWeightExplore,
      SameGradeWeightExplore,
      FriendsWeightExplore,
      FriendsOfFriendsWeightExplore,
    ],
    false
  );

  return { page, data: Result };
}


// Get Recommendations for friends in the questions section
// returns only 4 users
async function GetRecommendationsQuestions(username) {
  // Check user validity first
  if (!(await CheckPlayerValidity(username))) {
    return { success: false, error: "User does not exist" };
  }

  // Fetch all the required data in a single traversal using union step
  const pagelimit = getKV("pagelimit");

  const data = await g
    .V()
    .has("User", "username", username)
    .union(
      // Fetch users from contacts
      __.out("contactsList").in("phoneNumber").limit(pagelimit),
      // Fetch users from favorite contacts
      __.out("emojicontactsList").in("phoneNumber").limit(pagelimit),
      // Fetch schoolmates
      __.out("highSchool").limit(pagelimit),
      // Fetch classmates
      __.out("highSchool").in("highSchool").has(
        "User",
        "grade",
        __.values("grade")
      ).limit(pagelimit),
      // Fetch friends
      __.out("FRIENDS_WITH").limit(pagelimit),
      // Fetch friends of friends
      __.out("FRIENDS_WITH").out("FRIENDS_WITH").dedup().where(P.neq("self")).limit(pagelimit),
      // Fetch friends with active poll coin subscription
      __.has("TempSubCrush", true).limit(pagelimit)
    )
    .valueMap("username")
    .toList();

  const UsersInContactsResult = ExtractUsersFromJson(data[0]);
  const UsersInContactsWithEmojisResult = ExtractUsersFromJson(data[1]);
  const SchoolMatesResult = ExtractUsersFromJson(data[2]);
  const ClassMatesResult = ExtractUsersFromJson(data[3]);
  const FriendsResult = ExtractUsersFromJson(data[4]);
  const FriendsOfFriendsResult = ExtractUsersFromJson(data[5]);
  const FriendsWithSubsActiveResult = ExtractUsersFromJson(data[6]);

  const FetchTopFriendsQuery = 'SELECT topFriends FROM users WHERE phoneNumber = ?';
  const TopFriends = await client.execute(FetchTopFriendsQuery, [username], { prepare: true }); //TODO: make sure it returns an array when route testing
  
  const GetTopFriendCountQuery = 'SELECT friends_count FROM topFriendsAndPolls WHERE phoneNumber =? AND friendPhoneNumber =? ';
  let TopFriendsWeights;
  let TopFriendPhoneNumberArray;
  let i=0;

  for(TopFriend in TopFriends){
    const TopFriendCount =  await client.execute(GetTopFriendCountQuery, [username,TopFriends.result.rows[i].phoneNumber,pagelimit], { prepare: true });//TODO:use batch queries instead of repeating calls(do when testing routes)
    TopFriendsWeights.push(TopFriendCount*TopFriendsWeightsQuestions);
    TopFriendPhoneNumberArray.push(TopFriends.result.rows[i].phoneNumber);
    i++;
  }

  const TopFriendsToConsider = WeightArraysUsingProbability([TopFriendPhoneNumberArray],[TopFriendsWeights],false);


  // Combine all the fetched results into a single array
  const allUsers = [
    ...UsersInContactsResult,
    ...UsersInContactsWithEmojisResult,
    ...SchoolMatesResult,
    ...ClassMatesResult,
    ...FriendsResult,
    ...FriendsOfFriendsResult,
    ...TopFriendsToConsider
  ];

 

  // Weigh the users using the probability fetched from KV
  const Result = WeightArraysUsingProbability(
    [
      allUsers,
    ],
    [
      ContactsWeightQuestions,
      EmojiContactsWeightQuestions,
      SameHighSchoolWeightQuestions,
      SameGradeWeightQuestions,
      FriendsWeightQuestions,
      FriendsOfFriendsWeightQuestions,
      TopFriendsWeightsQuestions
    ],
    true // Return only 4 users
  );

  if(FriendsWithSubsActiveResult.length > 0) {
    //get friends with active poll coin subscription and add to top result
    Result[0] = TempSubUser;
  }
  return Result;
}

module.exports= {
  ExtractUsersFromJson,
  WeightArraysUsingProbability,
  InviteFriends,
  FetchFriendsWithSubsActive,
  GetRecommendationsOnboarding,
  GetRecommendationsExploreSection,
  GetRecommendationsQuestions,
};
