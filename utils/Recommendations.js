const { SetupGraphDB } = require("./SetupGraphDB.js");
SetupGraphDB().then(result => global.g = result);

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
  ContactsWeightOnboarding;

async function fetchWeights() {
  // Fetch all weights concurrently
  const [
    SameGradeWeightOnboarding_,
    SameHighSchoolWeightOnboarding_,
    PhotoContactsWeightOnboarding_,
    EmojiContactsWeightOnboarding_,
    ContactsWeightOnboarding_,
  ] = await Promise.allSettled([
    getKV(["SameGradeWeightOnboarding"]),
    getKV(["SameHighSchoolWeightOnboarding"]),
    getKV(["PhotoContactsWeightOnboarding"]),
    getKV(["EmojiContactsWeightOnboarding"]),
    getKV(["ContactsWeightOnboarding"]),
  ]);

  // Assign weights to the initialized vars
  SameGradeWeightOnboarding = SameGradeWeightOnboarding_.value;
  SameHighSchoolWeightOnboarding = SameHighSchoolWeightOnboarding_.value;
  PhotoContactsWeightOnboarding = PhotoContactsWeightOnboarding_.value;
  EmojiContactsWeightOnboarding = EmojiContactsWeightOnboarding_.value;
  ContactsWeightOnboarding = ContactsWeightOnboarding_.value;

  
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
  filteredList.forEach(async (element) => {
    const mutualCount = await getMutualFriends(uid, element.uid);
    filteredList[index].mutualCount = mutualCount;
    index++;
  });
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
  const offset_PeopleInContacts =
    (page_peopleInContacts - 1) * pagesize_peopleInContacts;
  const peopleYouMayKnowPromise = await g.submit(
    `g.V().union(
      __.V().hasLabel('User').has('highschool', highschool)
        .range(offset_PeopleYouMayKnow, page_peopleYouMayKnow * pagesize_PeopleYouMayKnow), 
      __.V().hasLabel('User').has('highschool', highschool).has('grade', grade)
        .values('username')
        .range(offset_PeopleYouMayKnow, page_peopleYouMayKnow * pagesize_PeopleYouMayKnow)
    )`,
    {
      highschool: highschool,
      offset_PeopleYouMayKnow: offset_PeopleYouMayKnow,
      page_peopleYouMayKnow: page_peopleYouMayKnow,
      pagesize_PeopleYouMayKnow: pagesize_PeopleYouMayKnow,
      grade: grade,
    }
  );

  const peopleInContactsPromise = await g.submit(
    "g.V().hasLabel('User').has('uid', uid).outE('HAS_CONTACT')" +
    ".choose(__.has('fav', true), __.inV().property('weight', EmojiContactsWeightOnboarding), __.inV().property('weight', ContactsWeightOnboarding))" +
    ".choose(__.has('photo', true), __.inV().property('weight', PhotoContactsWeightOnboarding), __.inV().property('weight', ContactsWeightOnboarding))",
  {
    uid: uid,
    EmojiContactsWeightOnboarding: EmojiContactsWeightOnboarding,
    ContactsWeightOnboarding: ContactsWeightOnboarding,
    PhotoContactsWeightOnboarding: PhotoContactsWeightOnboarding
  });

  const [PeopleYouMayKnow, PeopleInContacts] = await Promise.allSettled([
    peopleYouMayKnowPromise,
    peopleInContactsPromise,
  ]);
  // Return both the result and the next page number for paging
  return {
    success: true,
    page_peopleYouMayKnow: page_peopleYouMayKnow,
    People_You_May_Know: PeopleYouMayKnow,
    page_peopleInContacts: page_peopleInContacts,
    PeopleInContacts: PeopleInContacts,
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
  const userFriendsPromise = g.submit("g.V().has('uid', uid).out('FRIENDS_WITH').values('uid')", {uid: uid});
  const AllUsersInSchoolPromise = g.submit("g.V().union(__.V().hasLabel('User').has('highschool', highschool).range(offset_FriendsOfFriends, page_FriendsOfFriends * pagesize_FriendsOfFriends), __.V().hasLabel('User').has('highschool', highschool).has('grade', grade).range(offset_FriendsOfFriends, page_FriendsOfFriends * pagesize_FriendsOfFriends).not(__.inE('FRIENDS_WITH').has('uid', uid)))", {highschool: highschool, offset_FriendsOfFriends: offset_FriendsOfFriends, page_FriendsOfFriends: page_FriendsOfFriends, pagesize_FriendsOfFriends: pagesize_FriendsOfFriends, grade: grade, uid: uid});

  const AllUsersInContactsPromise = g.submit("g.V().hasLabel('User').has('username', username).outE('HAS_CONTACT').choose(__.has('fav', true), __.inV().property('weight', EmojiContactsWeightQuestions), __.inV().property('weight', ContactsWeightQuestions)).choose(__.has('photo', true), __.inV().property('weight', PhotoContactsWeightQuestions), __.inV().property('weight', ContactsWeightQuestions)).not(__.inE('FRIENDS_WITH').has('uid', uid)).range(offset_Contacts, page_Contacts * pagesize_Contacts)", {username: username, EmojiContactsWeightQuestions: EmojiContactsWeightQuestions, ContactsWeightQuestions: ContactsWeightQuestions, PhotoContactsWeightQuestions: PhotoContactsWeightQuestions, uid: uid, offset_Contacts: offset_Contacts, page_Contacts: page_Contacts, pagesize_Contacts: pagesize_Contacts});

  const FriendsOfFriendsPromise = g.submit("g.V().hasLabel('User').has('uid', uid).out('FRIENDS_WITH').out('FRIENDS_WITH').dedup().where(P.neq('self')).not(__.inE('FRIENDS_WITH').has('uid', uid)).range(offset_SchoolUsers, page_SchoolUsers * pagesize_SchoolUsers).valueMap('uid')", {uid: uid, offset_SchoolUsers: offset_SchoolUsers, page_SchoolUsers: page_SchoolUsers, pagesize_SchoolUsers: pagesize_SchoolUsers});

  //#endregion

  const FriendRequestQuery = "SELECT friendRequests FROM friends WHERE uid =?";
  const friendRequestsPromise = client.execute(FriendRequestQuery, [uid], {
    prepare: true,
  });

  const UserDataScyllaQuery =
    "SELECT contactsList,favcontactsList,FriendsCount FROM users WHERE uid = ?";
  const UserDataScyllaPromise = client.execute(UserDataScyllaQuery, [uid]);

  const InviteSentQuery = "SELECT * FROM active_links WHERE inviter =?";
  const AllInvitesSentPromise = client.execute(InviteSentQuery, [uid]);

  const [
    userFriends,
    AllUsersInSchool,
    FriendsOfFriends,
    friendRequests,
    AllUsersInContacts,
    AllUserData,
    AllInvitesSent,
  ] = await Promise.allSettled([
    userFriendsPromise,
    AllUsersInSchoolPromise,
    FriendsOfFriendsPromise,
    friendRequestsPromise,
    AllUsersInContactsPromise,
    UserDataScyllaPromise,
    AllInvitesSentPromise,
  ]);

  //#region Filtering
  // Filter out the existing friends from allUsers

  const FilteredInvitationRecommendations = [
    ...new Set([...FilteredContactList, ...FilteredFavContactList]),
  ];

  await InsertMutualCount(uid, FilteredUsersInSchool);
  await InsertMutualCount(uid, FriendsOfFriends);

  //#endregion

  return {
    page_FriendsOfFriends: page_FriendsOfFriends,
    FriendsOfFriends: FriendsOfFriends,
    UsersInContacts: AllUsersInContacts,
    page_SchoolUsers: page_SchoolUsers,
    UsersInSchool: FilteredUsersInSchool,
    InvitationRecommendation: FilteredInvitationRecommendations,
    TotalFriends: AllUserData[2],
    FriendRequests: friendRequests.value,
    InvitesSent: AllInvitesSent,
  };
}

async function GetRecommendationsQuestions(uid, highschool, grade) {
  const allUsers = await g.submit("g.V().hasLabel('User').has('username', uid).union(__.outE('HAS_CONTACT').choose(__.has('fav', true), __.inV().property('weight', EmojiContactsWeightQuestions), __.inV().property('weight', ContactsWeightQuestions)).choose(__.has('photo', true), __.inV().property('weight', PhotoContactsWeightQuestions), __.inV().property('weight', ContactsWeightQuestions)), __.has('highschool', highschool).property('weight', SameHighSchoolWeightQuestions), __.out('FRIENDS_WITH').property('weight', FriendsWeightQuestions), __.out('FRIENDS_WITH').out('FRIENDS_WITH').dedup().where(P.neq('self')).property('weight', FriendsOfFriendsWeightQuestions), __.has('highschool', highschool).has('grade', grade).property('weight', SameGradeWeightQuestions), __.out('FRIENDS_WITH').order().by('PollsCount', decr).property('weight', TopFriendsWeightsQuestions)).local(__.repeat(__.sample(1).math('sin(random()) + _').is(P.gt(0))).times(4)).coalesce(__.unfold(), __.V().hasLabel('User').has('username', username).out('HAS_CONTACT').limit(4))");

  return allUsers;
}

//#endregion


module.exports = {
  FetchFriendsWithSubsActive,
  GetRecommendationsOnboarding,
  GetRecommendationsExploreSection,
  GetRecommendationsQuestions,
};
