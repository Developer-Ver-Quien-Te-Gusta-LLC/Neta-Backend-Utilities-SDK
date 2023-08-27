

const {SetupGraphDB} = requie('./SetupGraphDB.js')
let g = SetupGraphDB(g)

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

async function InsertMutualCount(username,filteredList){
  index = 0;
  filteredList.forEach(async element => {
    const mutualCount = await getMutualFriends(username,element.username);
    filteredList[index].mutualCount = mutualCount;
    index++;
  });
}
//#endregion

//#region Actual Fetching
async function GetRecommendationsOnboarding(username,contactsList,FavcontactsList,page_peopleYouMayKnow,pagesize_PeopleYouMayKnow,page_peopleInContacts,pagesize_peopleInContacts,grade,highschool) {
  // Calculate the offset
  const offset_PeopleYouMayKnow = (page_peopleYouMayKnow - 1) * pagesize_PeopleYouMayKnow;
  const offset_PeopleInContacts = (page_peopleInContacts-1)* pagesize_peopleInContacts;
  // Check user validity first
  if (!(await CheckPlayerValidity(username))) {
    return { success: false, error: "User does not exist" };
  }
 // Fetch friends of the given user
 const userFriends = await g.V()
 .has('username', username)
 .out('FRIENDS_WITH')
 .values('username')
 .toList();


  const PeopleYouMayKnow = await g.V()
  .union(
    __.V().hasLabel('User').has('highschool', highschool).range(offset_PeopleYouMayKnow,page_peopleYouMayKnow*pagesize_PeopleYouMayKnow),
    __.V().hasLabel('User').has('highschool', highschool).has('grade', grade).values('username').range(offset_PeopleYouMayKnow,page_peopleYouMayKnow*pagesize_PeopleYouMayKnow),
  )
  .toList();

  const PeopleInContacts = await g.V()
  .union(
    __.V().hasLabel('User').has('phoneNumber', within(contactsList)).range(offset_PeopleInContacts,page_peopleInContacts*pagesize_peopleInContacts),
    __.V().hasLabel('User').has('phoneNumber', within(FavcontactsList)).range(offset_PeopleInContacts,page_peopleInContacts*pagesize_peopleInContacts),
  )
  .toList();

  const FilteredPeopleYouMayKnow = PeopleYouMayKnow.filter((user) => !userFriends.includes(user.username));
  const FilteredPeopleInContacts = PeopleInContacts.filter((user) => !userFriends.includes(user.username));

  var invited = await IsUserInvited(username);
  if (invited) PeopleYouMayKnow.concat(invited[0].inviter);

  // Return both the result and the next page number for paging
  return {
    success: true,
    page_peopleYouMayKnow: page_peopleYouMayKnow,
    People_You_May_Know: FilteredPeopleYouMayKnow,
    page_peopleInContacts: page_peopleInContacts,
    PeopleInContacts: FilteredPeopleInContacts,
    invited:invited
  };
}

// Get Recommendations for friends while in the explore section (after onboarding)
async function GetRecommendationsExploreSection(username, page_FriendsOfFriends,page_SchoolUsers,pagesize_FriendsOfFriends,pagesize_SchoolUsers,highschool,grade) {
  // Calculate the offset
  const offset_FriendsOfFriends = (page_FriendsOfFriends-1 ) * pagesize_FriendsOfFriends;
  const offset_SchoolUsers = (page_SchoolUsers-1) * pagesize_SchoolUsers;
  // Check user validity first
  if (!(await CheckPlayerValidity(username))) {
    return { success: false, error: "User does not exist" };
  }
  // Fetch friends of the given user
  const userFriends = await g.V()
  .has('username', username)
  .out('FRIENDS_WITH')
  .values('username')
  .toList();

  const AllUsersInSchool = await g.V()
  .union(
  //  __.V().hasLabel('User').has('phoneNumber', within(contactsList)).range(pagesize_FriendsOfFriends),
   // __.V().hasLabel('User').has('phoneNumber', within(FavcontactsList)).range(pagesize_FriendsOfFriends),
    __.V().hasLabel('User').has('highschool', highschool).range(offset_FriendsOfFriends,page_FriendsOfFriends*pagesize_FriendsOfFriends),
    __.V().hasLabel('User').has('highschool', highschool).has('grade', grade).values('username').range(offset_FriendsOfFriends,page_FriendsOfFriends*pagesize_FriendsOfFriends)
  )
  .toList();

  const FriendsOfFriends = await g
    .V()
    .hasLabel("User")
    .has("username", username)
    .out("FRIENDS_WITH")
    .out("FRIENDS_WITH")
    .dedup()
    .where(P.neq("self"))
    .range(offset_SchoolUsers,page_SchoolUsers*pagesize_SchoolUsers)
    .valueMap("username")
    .toList();

   

  // Filter out the existing friends from allUsers

  const FilteredContactList = contactsList.filter((user)=> !userFriends.includes(user.phoneNumber));
  const FilteredFavContactList = FavcontactsList.filter((user)=> !userFriends.includes(user.phoneNumber));

  const FilteredUsersInSchool = AllUsersInSchool.filter((user) => !userFriends.includes(user.username));
  const FilteredFriendsofFriends = FriendsOfFriends.filter((user) => !userFriends.includes(user.username));
  const FilteredInvitationRecommendations = [...new Set([...FilteredContactList,...FilteredFavContactList])];

  await InsertMutualCount(username,FilteredUsersInSchool);
  await InsertMutualCount(username,FilteredFriendsofFriends);
  
  const friendsCountQuery = "SELECT FriendsCount FROM users WHERE phoneNumber=?";
  const FriendCount = await client.execute(friendsCountQuery,[phoneNumber],{prepare:true});
  return {
    page_FriendsOfFriends: page_FriendsOfFriends,
    FriendsOfFriends: FilteredFriendsofFriends,
    page_SchoolUsers: page_SchoolUsers,
    UsersInSchool: FilteredUsersInSchool,
    InvitationRecommendation: FilteredInvitationRecommendations,
    TotalFriends:FriendCount
  };
}


async function GetRecommendationsQuestions(username, pagesize, highschool, grade) {
  // Check user validity first
  if (!(await CheckPlayerValidity(username))) {
      return { success: false, error: "User does not exist" };
  }

  const allUsers = await g.V()
      .hasLabel('User').has('username', username)
      .union(
          // Contacts and FavContacts merged
          __.outE('HAS_CONTACT').choose(
              __.has('fav', true),
              __.inV().property('weight', EmojiContactsWeightQuestions), // treated as favContact
              __.inV().property('weight', ContactsWeightQuestions)
          ),

          // Highschool friends
          __.has('highschool', highschool).property('weight', SameHighSchoolWeightQuestions),

          // Friends
          __.out('FRIENDS_WITH').property('weight', FriendsWeightQuestions),

          // Friends of Friends
          __.out('FRIENDS_WITH').out('FRIENDS_WITH').dedup().where(P.neq('self')).property('weight', FriendsOfFriendsWeightQuestions),

          // Same Grade
          __.has('highschool', highschool).has('grade', grade).property('weight', SameGradeWeightQuestions),

          // Poll count
          __.order().by('PollsCount', decr).property('weight', TopFriendsWeightsQuestions)
      )
      .order().by('weight', decr)
      .limit(pagesize)
      .fold()
      .coalesce(
          __.unfold(),
          __.V().hasLabel('User').has('username', username).out('HAS_CONTACT').limit(3)
      )
      .toList();

  return allUsers;
}



//#endregion 

module.exports= {
  WeightArraysUsingProbability,
  FetchFriendsWithSubsActive,
  GetRecommendationsOnboarding,
  GetRecommendationsExploreSection,
  GetRecommendationsQuestions,
};
