const { SetupGraphDB } = require("./SetupGraphDB.js");
var g;
SetupGraphDB().then(async (result) => {
  g = result;

 
});

const { getKV } = require("./KV.js");
const cassandra = require("./SetupCassandra.js");

//Setup scylla Client
var client;
cassandra
  .GetClient()
  .then(async (CassandraClient) => {
    client = CassandraClient;

   // const value = (await GetRecommendationsExploreSection("13c39822-4a37-4096-9f77-6cb1d32eaaa7",1,1,1,10,10,10,"SERVICIOS EDUCATIVOS DE OCCIDENTE, S.C.",10));
    //console.log(value.Recommendations)
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
  const offset_PeopleYouMayKnow = (page_peopleYouMayKnow - 1) * pagesize_PeopleYouMayKnow;
  const offset_peopleInContacts = (page_peopleInContacts -1 ) * pagesize_peopleInContacts;

  const OnboardingRecommendationsPromise = await g.submit(
    `g.v().hasLabel('User').has('uid', uid).project(
      'PeopleYouMayKnow',
      'peopleInContacts'
    ).
    by( g.V().hasLabel('User').outE('ATTENDS_SCHOOL').outV().range(offset_PeopleYouMayKnow, page_peopleYouMayKnow * pagesize_PeopleYouMayKnow).dedup().fold()).
    by(outE('HAS_CONTACT_IN_APP').union(
    choose(has('fav', true),  outV().has('weight', EmojiContactsWeightOnboarding),  outV().has('weight', ContactsWeightOnboarding)),
    choose(has('photo', true),  outV().has('weight', PhotoContactsWeightOnboarding),  outV().has('weight', ContactsWeightOnboarding)).
     values('uid','fname','username').
     range(offset_peopleInContacts, page_peopleInContacts * pagesize_peopleInContacts).
     fold()))`,
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
      offset_peopleInContacts:offset_peopleInContacts,
      pagesize_peopleInContacts : pagesize_peopleInContacts,
      page_peopleInContacts:page_peopleInContacts
    }
  );

  const [Recommendations] = await Promise.allSettled([
    OnboardingRecommendationsPromise
  ]);
  console.log(Recommendations.value);
  
  // Return both the result and the next page number for paging
  return {
    success: true,
    page_peopleInContacts: page_peopleInContacts,
    Recommendations:Recommendations.value
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
  try{
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
       g.V().outE('ATTENDS_SCHOOL').inV().has('name',highschool).range(offset_FriendsOfFriends, page_FriendsOfFriends * pagesize_FriendsOfFriends),
       g.V().outE('ATTENDS_SCHOOL').inV().has('name',highschool).has('grade', grade).not(inE('FRIENDS_WITH').has('uid', uid)).range(offset_FriendsOfFriends, page_FriendsOfFriends * pagesize_FriendsOfFriends)
     ).fold()).
  by(outE('HAS_CONTACT_IN_APP').
  union(
    choose(has('fav', true),  outV().has('weight', EmojiContactsWeightQuestions),  outV().has('weight', ContactsWeightQuestions)),
    choose(has('photo', true),  outV().has('weight', PhotoContactsWeightQuestions),  outV().has('weight', ContactsWeightQuestions))
  ).
     not(inE('FRIENDS_WITH').has('uid', uid)).
     range(offset_Contacts, page_Contacts * pagesize_Contacts).
     fold()).
  by(out('FRIENDS_WITH').out('FRIENDS_WITH').dedup().fold()).
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

  const FriendRequestQuery = "SELECT friendRequests FROM friends WHERE ownerPhoneNumber =?";
  const friendRequestsPromise = client.execute(FriendRequestQuery, [uid], {
    prepare: true,
  });

  const InviteSentQuery = "SELECT * FROM active_links WHERE inviter =? ALLOW FILTERING";
  const AllInvitesSentPromise = client.execute(InviteSentQuery, [uid]);


  const [Recommendations, friendRequests, AllInvitesSent] =
    await Promise.allSettled([
      RecommendationsPromise,
      friendRequestsPromise,
      AllInvitesSentPromise,
    ]);

    if (friendRequests.value && friendRequests.value.rows.length>0) {
      const retrieveUserData = async (friendListName) => {
          const udataQuery = "SELECT firstname, lastname, username, pfpsmall, pfpsmallhash FROM users WHERE uid = ?";
          const list = [];
          
          const currentList = friendRequests.value.rows[0][friendListName];
  
          // Check if the current list is iterable and is not empty
          if (Array.isArray(currentList) && currentList.length) {
              for (const friend of currentList) {
                  const udata = await client.execute(udataQuery, [friend], { prepare: true });
                  list.push(udata.rows[0]);
              }
  
              friendRequests.value.rows[0][friendListName] = list;
          }
      }
      await retrieveUserData('friendrequests');
    }

    console.log(Recommendations);
    console.log(friendRequests);


  return {
    page_FriendsOfFriends: page_FriendsOfFriends,
    page_SchoolUsers: page_SchoolUsers,
    Recommendations : Recommendations.value ? Recommendations.value._items:[],
    FriendRequests: friendRequests.value?friendRequests.value.rows[0]:[],
    InvitesSent: AllInvitesSent.value?AllInvitesSent.value.rows:[],
  };
}
catch(err){
  console.log(err);
}
}



async function GetRecommendationsQuestions(uid, highschool, grade) {
  const maxUsers = 10;  // Assume you have 100 users
  const limit = 4;
  
  // Generate a random starting point
  const randomOffset = Math.floor(Math.random() * (maxUsers - limit + 1));
  
  const query = `
      g.V().hasLabel('User').range(${randomOffset}, ${randomOffset + limit})
  `;
  
  const result = await g.submit(query);
  
   /* await g
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
      console.log(allUsers);
      return result;
    })
    .catch((error) => {
      console.error(error);
    });*/
    
    
    // Parse the result to only return an array of uids and phoneNumbers
    const parsedResult = result._items.map(user => ({
      uid: user.properties.uid[0].value,
      phoneNumber: user.properties.phoneNumber[0].value,
      fname: user.properties.fname[0].value,
      lname:user.properties.lname[0].value,
      username:user.properties.username[0].value,
    }));

    return parsedResult;
  }

//#endregion

module.exports = {
  FetchFriendsWithSubsActive,
  GetRecommendationsOnboarding,
  GetRecommendationsExploreSection,
  GetRecommendationsQuestions,
};
