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

async function GetRecommendationsOnboarding(username,contactsList,FavcontactsList,page,pagesize) {
  // Calculate the offset
  const offset = (page - 1) * pagesize;
  // Check user validity first
  if (!(await CheckPlayerValidity(username))) {
    return { success: false, error: "User does not exist" };
  }

  const sameSchoolUsers = await g
    .V()
    .hasLabel("User")
    .has("username", username) // Start with the user who has the given username
    .values("highschool") // Fetch the highschool property of that user
    .as("school") // Save the value in variable "school"
    .V()
    .hasLabel("User")
    .has("highschool", within("school")) // Find all users with the saved school
    .values("username") // Fetch the username property of those users
    .range(offset, offset + pagesize)
    .toList(); // Convert to list

  const sameSchoolAndGradeUsers = await g
    .V()
    .hasLabel("User")
    .has("username", givenUsername) // Start with the user who has the given username
    .project("school", "grade") // Project the highschool and grade properties
    .by(values("highschool"))
    .by(values("grade"))
    .as("userInfo") // Save the values in variable "userInfo"
    .V()
    .hasLabel("User")
    .where(both("highschool").where(eq("userInfo"))) // Filter users who have the same school
    .where(both("grade").where(eq("userInfo"))) // And the same grade
    .values("username") // Fetch the username property of those users
    .range(offset, offset + pagesize)
    .toList(); // Convert to list

  const usersInContactList = await g
    .V()
    .hasLabel("User")
    .has("phoneNumber", within(contactsList))
    .range(offset, offset + pagesize)
    .toList();
  const usersFavoriteList = await g
    .V()
    .hasLabel("User")
    .has("phoneNumber", within(FavcontactsList))
    .range(offset, offset + pagesize)
    .toList();

  const allUsers = [
    ...sameSchoolUsers,
    ...sameSchoolAndGradeUsers,
    ...usersInContactList,
    ...usersFavoriteList,
  ];

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
async function GetRecommendationsExploreSection(username, page,pagesize,contactsList,FavcontactsList) {
  // Calculate the offset
  const offset = (page - 1) * pagesize;

  // Check user validity first
  if (!(await CheckPlayerValidity(username))) {
    return { success: false, error: "User does not exist" };
  }
  const contactsUsers = await g
  .V()
  .hasLabel("User")
  .has("phoneNumber", within(contactsList))
  .range(offset, offset + pagesize)
  .toList();

  const emojicontactsUsers = await g
  .V()
  .hasLabel("User")
  .has("phoneNumber", within(FavcontactsList))
  .range(offset, offset + pagesize)
  .toList();

  const schoolmates = await g
  .V()
  .hasLabel("User")
  .has("username", username) // Start with the user who has the given username
  .values("highschool") // Fetch the highschool property of that user
  .as("school") // Save the value in variable "school"
  .V()
  .hasLabel("User")
  .has("highschool", within("school")) // Find all users with the saved school
  .values("username") // Fetch the username property of those users
  .range(offset, offset + pagesize)
  .toList(); // Convert to list

  const classmates = await g
  .V()
  .hasLabel("User")
  .has("username", givenUsername) // Start with the user who has the given username
  .project("school", "grade") // Project the highschool and grade properties
  .by(values("highschool"))
  .by(values("grade"))
  .as("userInfo") // Save the values in variable "userInfo"
  .V()
  .hasLabel("User")
  .where(both("highschool").where(eq("userInfo"))) // Filter users who have the same school
  .where(both("grade").where(eq("userInfo"))) // And the same grade
  .values("username") // Fetch the username property of those users
  .range(offset, offset + pagesize)
  .toList(); // Convert to list

  const friends = await g.V()
  .has("User", "username", username)
  .out("FRIENDS_WITH")
  .range(offset, offset + pagesize)
  .valueMap("username")
  .toList();

  const friendsOfFriends = await g.V()
  .has("User", "username", username)
  .out("FRIENDS_WITH")
  .out("FRIENDS_WITH")
  .dedup()
  .where(P.neq("self"))
  .range(offset, offset + pagesize)
  .valueMap("username")
  .toList();

 

  const allUsers = [
    ...contactsUsers,
    ...emojicontactsUsers,
    ...schoolmates,
    ...classmates,
    ...friends,
    ...friendsOfFriends,
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
async function GetRecommendationsQuestions(username,contactsList,FavcontactsList,pagesize) {

 // Check user validity first
  if (!(await CheckPlayerValidity(username))) {
    return { success: false, error: "User does not exist" };
  }


  const contactsUsers = await g
  .V()
  .hasLabel("User")
  .has("phoneNumber", within(contactsList))
  .range( pagesize)
  .toList();

  const emojicontactsUsers = await g
  .V()
  .hasLabel("User")
  .has("phoneNumber", within(FavcontactsList))
  .range(pagesize)
  .toList();

  const schoolmates = await g
  .V()
  .hasLabel("User")
  .has("username", username) // Start with the user who has the given username
  .values("highschool") // Fetch the highschool property of that user
  .as("school") // Save the value in variable "school"
  .V()
  .hasLabel("User")
  .has("highschool", within("school")) // Find all users with the saved school
  .values("username") // Fetch the username property of those users
  .range(pagesize)
  .toList(); // Convert to list

  const classmates = await g
  .V()
  .hasLabel("User")
  .has("username", givenUsername) // Start with the user who has the given username
  .project("school", "grade") // Project the highschool and grade properties
  .by(values("highschool"))
  .by(values("grade"))
  .as("userInfo") // Save the values in variable "userInfo"
  .V()
  .hasLabel("User")
  .where(both("highschool").where(eq("userInfo"))) // Filter users who have the same school
  .where(both("grade").where(eq("userInfo"))) // And the same grade
  .values("username") // Fetch the username property of those users
  .range(pagesize)
  .toList(); // Convert to list

  const friends = await g.V()
  .has("User", "username", username)
  .out("FRIENDS_WITH")
  .range(pagesize)
  .valueMap("username")
  .toList();
  
  const friendsOfFriends = await g.V()
  .has("User", "username", username)
  .out("FRIENDS_WITH")
  .out("FRIENDS_WITH")
  .dedup()
  .where(P.neq("self"))
  .range(pagesize)
  .valueMap("username")
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


  const allUsers = [
    ...contactsUsers,
    ...emojicontactsUsers,
    ...schoolmates,
    ...classmates,
    ...friends,
    ...friendsOfFriends,
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

module.exports= {
  WeightArraysUsingProbability,
  InviteFriends,
  FetchFriendsWithSubsActive,
  GetRecommendationsOnboarding,
  GetRecommendationsExploreSection,
  GetRecommendationsQuestions,
};
