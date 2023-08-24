//#region vars and refs
const gremlin = require('gremlin');
const traversal = gremlin.process.AnonymousTraversalSource.traversal;
const DriverRemoteConnection = gremlin.driver.DriverRemoteConnection;
const Graph = gremlin.structure.Graph;

const graph = new Graph();
const g = graph
  .traversal()
  .withRemote(new DriverRemoteConnection("wss://hostname:port/gremlin", "{}"));

const { IsUserInvited } = require("./InviteHandler.js");
const { getKV } = require("./KV.js");
const cassandra = require("./SetupCassandra.js");

//Setup scylla Client
let client;
cassandra.SetupCassandraClient(client).then(CassandraClient => client = CassandraClient);

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
}
fetchWeights(); // fetch the weights as soon as the module is imported
//#endregion
//#region Helper Functions
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

function GetRandomFromContacts(contactsList, FavcontactsList) {
  // Merge the two arrays
  const mergedArray = [...contactsList, ...FavcontactsList];
  
  // Check if the merged array is empty
  if (mergedArray.length === 0) {
    return null;  // or you could throw an error, return a message, etc.
  }
  
  // Generate a random index
  const randomIndex = Math.floor(Math.random() * mergedArray.length);
  
  // Return a random element from the merged array
  return mergedArray[randomIndex];
}

async function getMutualFriends(username, otherUsername) {
  // Find friends of the main user
  const userFriends = await g.V()
    .has('username', username)
    .out('FRIENDS_WITH')
    .values('username')
    .toList();

  // Find friends of the other user
  const otherUserFriends = await g.V()
    .has('username', otherUsername)
    .out('FRIENDS_WITH')
    .values('username')
    .toList();

  // Calculate mutual friends
  const mutualFriends = userFriends.filter(friend => otherUserFriends.includes(friend));

  return mutualFriends.length;
}
//#endregion

//#region Actual Fetching
async function GetRecommendationsOnboarding(username,contactsList,FavcontactsList,page,pagesize,grade,highschool) {
  // Calculate the offset
  const offset = (page - 1) * pagesize;
  // Check user validity first
  if (!(await CheckPlayerValidity(username))) {
    return { success: false, error: "User does not exist" };
  }

  const allUsers = await g.V()
  .union(
    __.V().hasLabel('User').has('phoneNumber', within(contactsList)).range(pagesize),
    __.V().hasLabel('User').has('phoneNumber', within(FavcontactsList)).range(pagesize),
    __.V().hasLabel('User').has('highschool', highschool).range(pagesize),
    __.V().hasLabel('User').has('highschool', highschool).has('grade', grade).values('username').range(pagesize)
  )
  .toList();

  const Result = WeightArraysUsingProbability(
    [allUsers],
    [
      ContactsWeightOnboarding,
      EmojiContactsWeightOnboarding,
      SameHighSchoolWeightOnboarding,
      SameGradeWeightOnboarding,
    ],
    false
  );
  var invited = await IsUserInvited(username);
  if (invited != false) Result.concat(invited[0].inviter);

  // Return both the result and the next page number for paging
  return { success: true, data: Result, nextPage: pagenumber + 1 };
}

// Get Recommendations for friends while in the explore section (after onboarding)
async function GetRecommendationsExploreSection(username, page,pagesize,contactsList,FavcontactsList,highschool,grade) {
  // Calculate the offset
  const offset = (page - 1) * pagesize;

  // Check user validity first
  if (!(await CheckPlayerValidity(username))) {
    return { success: false, error: "User does not exist" };
  }
  const allUsers = await g.V()
  .union(
    __.V().hasLabel('User').has('phoneNumber', within(contactsList)).range(pagesize),
    __.V().hasLabel('User').has('phoneNumber', within(FavcontactsList)).range(pagesize),
    __.V().hasLabel('User').has('highschool', highschool).range(pagesize),
    __.V().hasLabel('User').has('username', username).out('FRIENDS_WITH').out('FRIENDS_WITH').dedup().where(P.neq('self')).range(pagesize).valueMap('username'),
    __.V().hasLabel('User').has('highschool', highschool).has('grade', grade).values('username').range(pagesize)
  )
  .toList();

    // Fetch friends of the given user
    const userFriends = await g.V()
    .has('username', username)
    .out('FRIENDS_WITH')
    .values('username')
    .toList();

  // Filter out the existing friends from allUsers
  const nonFriendUsers = allUsers.filter((user) => !userFriends.includes(user.username));


  const usersWithMutuals = [];

  for (const otherUser of nonFriendUsers) {
    const otherUsername = otherUser.get('username'); // Assuming that the username can be extracted this way
    let mutualCount = 0; // Initialize to 0

    if (otherUsername !== username) { // Skip the mutual friend calculation for the main user
      mutualCount = await getMutualFriends(username, otherUsername);
    }

    usersWithMutuals.push({
      ...otherUser, // Assuming this works to merge the user object/data
      mutualCount,
    });
  }

  //TODO: proposed changes : remove weights from explore and onboarding lists
  const Result = WeightArraysUsingProbability(
    [
      usersWithMutuals,
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
async function GetRecommendationsQuestions(username,contactsList,FavcontactsList,pagesize,highschool,grade) {

 // Check user validity first
  if (!(await CheckPlayerValidity(username))) {
    return { success: false, error: "User does not exist" };
  }


  const allUsers = await g.V()
  .union(
    __.V().hasLabel('User').has('phoneNumber', within(contactsList)).range(pagesize),
    __.V().hasLabel('User').has('phoneNumber', within(FavcontactsList)).range(pagesize),
    __.V().hasLabel('User').has('highschool', highschool).range(pagesize),
    __.V().hasLabel('User').has('username', username).out('FRIENDS_WITH').range(pagesize).valueMap('username'),
    __.V().hasLabel('User').has('username', username).out('FRIENDS_WITH').out('FRIENDS_WITH').dedup().where(P.neq('self')).range(pagesize).valueMap('username'),
    __.V().hasLabel('User').has('highschool', highschool).has('grade', grade).values('username').range(pagesize)
  )
  .toList();


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


//Return people from contacts if result is < 3
  if(Result.length<3){
    for(i=0;i<3;i++){
      if(Result[i]==null){
        Result[i] = GetRandomFromContacts(contactsList,FavcontactsList);
      }
    }

  }
  else{
  return Result;
  }
}

//#endregion 

module.exports= {
  WeightArraysUsingProbability,
  FetchFriendsWithSubsActive,
  GetRecommendationsOnboarding,
  GetRecommendationsExploreSection,
  GetRecommendationsQuestions,
};
