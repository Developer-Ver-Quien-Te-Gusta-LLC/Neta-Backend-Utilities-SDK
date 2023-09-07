const { SetupGraphDB } = require("./SetupGraphDB.js");
SetupGraphDB().then((result) => {
  global.g = result;
});

const { getKV } = require("./KV.js");
const cassandra = require("./SetupCassandra.js");

//Setup scylla Client
let client;
cassandra
  .SetupCassandraClient(client)
  .then((CassandraClient) => (client = CassandraClient));

let SameGradeWeightOnboarding,
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
}
fetchWeights(); // fetch the weights as soon as the module is imported
//#endregion
//#region Helper Functions

// CheckPlayerValidity function
async function CheckPlayerValidity(username) {
  const userResult = await g.submit("g.V().has('User', 'username', username)", {
    username: username,
  });
  if (userResult.value == null) {
    return false;
  } else {
    return true;
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
  // Find friends of the main user
  const userFriends = await g.submit(
    " g.V().has('uid', uid).out('FRIENDS_WITH').values('username')",
    { uid: uid }
  );

  // Find friends of the other user
  const otherUserFriends = await g.submit(
    "g.V().has('uid', otheruid).out('FRIENDS_WITH').values('username')",
    { otheruid: otheruid }
  );

  // Calculate mutual friends
  const mutualFriends = userFriends.filter((friend) =>
    otherUserFriends.includes(friend)
  );

  return mutualFriends.length;
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
  const offset_PeopleYouMayKnow =
    (page_peopleYouMayKnow - 1) * pagesize_PeopleYouMayKnow;


  const OnboardingRecommendationsPromise = await g.submit(
    `g.v().hasLabel('User').has('uid', uid).project(
      'PeopleYouMayKnow',
      'peopleInContacts'
    ).
    by(union(
      g.V().hasLabel('User').outE('ATTENDS_SCHOOL').inV().has('name',highschool).values('uid').range(offset_FriendsOfFriends, page_FriendsOfFriends * pagesize_FriendsOfFriends),
      g.V().hasLabel('User').outE('ATTENDS_SCHOOL').inV().has('name',highschool).has('grade', grade).not(inE('FRIENDS_WITH').has('uid', uid)).values('uid').range(offset_FriendsOfFriends, page_FriendsOfFriends * pagesize_FriendsOfFriends)
    ).fold()).
    by(outE('HAS_CONTACT_IN_APP').
  union(
    choose(has('fav', true),  outV().has('weight', EmojiContactsWeightQuestions),  outV().has('weight', ContactsWeightQuestions)),
    choose(has('photo', true),  outV().has('weight', PhotoContactsWeightQuestions),  outV().has('weight', ContactsWeightQuestions))
  ).
     not(inE('FRIENDS_WITH').has('uid', uid)).
     values('uid').
     range(offset_Contacts, page_Contacts * pagesize_Contacts).
     fold())`,
    {
      highschool: highschool,
      offset_PeopleYouMayKnow: offset_PeopleYouMayKnow,
      page_peopleYouMayKnow: page_peopleYouMayKnow,
      pagesize_PeopleYouMayKnow: pagesize_PeopleYouMayKnow,
      grade: grade,
      uid: uid,
      EmojiContactsWeightOnboarding: EmojiContactsWeightOnboarding,
      ContactsWeightOnboarding: ContactsWeightOnboarding,
      PhotoContactsWeightOnboarding: PhotoContactsWeightOnboarding,
    }
  );

  const [Recommendations] = await Promise.allSettled([
    OnboardingRecommendationsPromise
  ]);
  
  // Return both the result and the next page number for paging
  return {
    success: true,
    page_peopleYouMayKnow: page_peopleYouMayKnow,
    People_You_May_Know: Recommendations[0].PeopleYouMayKnow,
    page_peopleInContacts: page_peopleInContacts,
    PeopleInContacts: Recommendations[0].PeopleInContacts,
  };
}

// Get Recommendations for friends while in the explore section (after onboarding)
async function GetRecommendationsExploreSection(
  uid,
  page_FriendsOfFriends,
  page_SchoolUsers,
  page_Contacts,
  pagesize_FriendsOfFriends,
  pagesize_SchoolUsers,
  pagesize_Contacts,
  highschool,
  grade
) {
  // Calculate the offset
  const offset_FriendsOfFriends =
    (page_FriendsOfFriends - 1) * pagesize_FriendsOfFriends;

  const offset_SchoolUsers = (page_SchoolUsers - 1) * pagesize_SchoolUsers;

  const offset_Contacts = (page_Contacts - 1) * pagesize_Contacts;

  //#region GraphDB calls

  // Fetch friends of the given user
  const RecommendationsPromise = g.submit(
    `
    g.V().hasLabel('User').has('uid', uid).project(
    'InvitationRecommendation',
    'AllUsersInSchool',
    'AllUsersInContacts',
    'FriendsOfFriends',
    'FriendCount'
  ).
  by(out('HAS_CONTACT').values('phoneNumber').fold()).
  by(union(
       outE('ATTENDS_SCHOOL').inV().has('name',highschool).values('uid').range(offset_FriendsOfFriends, page_FriendsOfFriends * pagesize_FriendsOfFriends),
       outE('ATTENDS_SCHOOL').inV().has('name',highschool).has('grade', grade).not(inE('FRIENDS_WITH').has('uid', uid)).values('uid').range(offset_FriendsOfFriends, page_FriendsOfFriends * pagesize_FriendsOfFriends)
     ).fold()).
  by(outE('HAS_CONTACT_IN_APP').
  union(
    choose(has('fav', true),  outV().has('weight', EmojiContactsWeightQuestions),  outV().has('weight', ContactsWeightQuestions)),
    choose(has('photo', true),  outV().has('weight', PhotoContactsWeightQuestions),  outV().has('weight', ContactsWeightQuestions))
  ).
     not(inE('FRIENDS_WITH').has('uid', uid)).
     values('uid').
     range(offset_Contacts, page_Contacts * pagesize_Contacts).
     fold()).
  by(out('FRIENDS_WITH').out('FRIENDS_WITH').values('uid').dedup().fold()).
  by(outE('FRIENDS_WITH').count())
`,
    {
      uid: uid,
      highschool: highschool,
      offset_FriendsOfFriends: offset_FriendsOfFriends,
      page_FriendsOfFriends: page_FriendsOfFriends,
      pagesize_FriendsOfFriends: pagesize_FriendsOfFriends,
      grade: grade,
      EmojiContactsWeightQuestions: EmojiContactsWeightQuestions,
      ContactsWeightQuestions: ContactsWeightQuestions,
      PhotoContactsWeightQuestions: PhotoContactsWeightQuestions,
      offset_Contacts: offset_Contacts,
      page_Contacts: page_Contacts,
      pagesize_Contacts: pagesize_Contacts,
      offset_SchoolUsers: offset_SchoolUsers,
      page_SchoolUsers: page_SchoolUsers,
      pagesize_SchoolUsers: pagesize_SchoolUsers,
    }
  );
  //#endregion

  const FriendRequestQuery = "SELECT friendRequests FROM friends WHERE uid =?";
  const friendRequestsPromise = client.execute(FriendRequestQuery, [uid], {
    prepare: true,
  });

  const InviteSentQuery = "SELECT * FROM active_links WHERE inviter =?";
  const AllInvitesSentPromise = client.execute(InviteSentQuery, [uid]);

  const [Recommendations, friendRequests, AllInvitesSent] =
    await Promise.allSettled([
      RecommendationsPromise,
      friendRequestsPromise,
      AllInvitesSentPromise,
    ]);

  return {
    page_FriendsOfFriends: page_FriendsOfFriends,
    FriendsOfFriends: Recommendations[0].FriendsOfFriends,
    UsersInContacts: Recommendations[0].AllUsersInContacts,
    page_SchoolUsers: page_SchoolUsers,
    UsersInSchool: Recommendations[0].AllUsersInSchool,
    InvitationRecommendation: Recommendations[0].InvitationRecommendation,
    TotalFriends: Recommendations[0].FriendCount,
    FriendRequests: friendRequests.value,
    InvitesSent: AllInvitesSent,
  };
}

function getRandomOffset(total) {
  return Math.floor(Math.random() * total);
}

async function GetRecommendationsQuestions(uid, highschool, grade) {
  const randomOffset = getRandomOffset(10); // You need to have TOTAL_USERS defined or calculated somewhere in your script

  const allUsers = await g
    .submit(
      `
    g.V().hasLabel('User').has('uid', "${uid}")
    .coalesce(
      // Repeating traversal for contacts with 'fav' true
      __.repeat(__.outE('HAS_CONTACT').has('fav', true).inV()).times(${EmojiContactsWeightQuestions}),
      
      // Repeating traversal for contacts with photo
      __.repeat(__.outE('HAS_CONTACT').has('photo', true).inV()).times(${PhotoContactsWeightQuestions}),
      
      // Repeating traversal for contacts without 'fav' and without photo
      __.repeat(__.outE('HAS_CONTACT').inV()).times(${ContactsWeightQuestions}),
      
      // Repeating traversal for same high school
      __.repeat(__.has('highschool', "${highschool}")).times(${SameHighSchoolWeightQuestions}),
      
      // Repeating traversal for friends
      __.repeat(__.out('HAS_FRIEND')).times(${FriendsWeightQuestions}),
      
      // Repeating traversal for friends of friends
      __.repeat(__.out('HAS_FRIEND').out('HAS_FRIEND').dedup().where(P.neq('self'))).times(${FriendsOfFriendsWeightQuestions}),
      
      // Repeating traversal for same grade in same high school
      __.repeat(__.has('highschool', "${highschool}").has('grade', "${grade}")).times(${SameGradeWeightQuestions}),
      
      // Repeating traversal for top friends
      __.unfold().repeat(
        __.out('FRIENDS_WITH').order().by('PollsCount', decr)
      ).times(${TopFriendsWeightsQuestions})
    )
    .order().by(__.id().hashcode()) // Ordering pseudorandomly based on hashed ID
    .range(${randomOffset}, ${
        randomOffset + 10
      }) // Paginate using the random offset
    .fold()
    .coalesce(
      __.unfold(), 
      __.V().hasLabel('User').has('uid', "${uid}").out('HAS_CONTACT').limit(4)
    )
  `
    )
    .then((result) => {
      const allUsers = result;
      console.log(allUsers);
      return allUsers;
    })
    .catch((error) => {
      console.error(error);
    });
}

//#endregion

module.exports = {
  FetchFriendsWithSubsActive,
  GetRecommendationsOnboarding,
  GetRecommendationsExploreSection,
  GetRecommendationsQuestions,
};
