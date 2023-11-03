const FetchFromSecrets = require("./AwsSecrets.js").FetchFromSecrets;
const cassandra = require("cassandra-driver");

const UserCreation = require("./UserCreation.js");

const AWS = require("aws-sdk");

const sqs = new AWS.SQS();
const { GetClient } = require("./SetupCassandra.js");

var client;
GetClient().then(
  (Cassandraclient) => (client = Cassandraclient)
);

async function DeleteUser(req, deleteVerification = false) {
  const promises = [];
  const queries = [];
  const { uid } = req.query;

  // Fill the array with query objects
  const highschoolQuery =
    "SELECT highschool, phoneNumber FROM users WHERE uid = ?";
  const highschoolResult = await client.execute(highschoolQuery, [uid], {
    prepare: true,
  });
  const highschool = highschoolResult.rows[0].highschool;
  const phoneNumber = highschoolResult.rows[0].phoneNumber;

  queries.push({
    query:
      "UPDATE schools SET numofstudents = numofstudents - 1 WHERE name = ?",
    params: [highschool],
  });
  queries.push({
    query:
      "UPDATE schools SET numofstudents = numofstudents - 1 WHERE name = ?",
    params: [highschool], // assume schoolName is a variable that holds the name of the school
  });

  queries.push({
    query: "DELETE FROM users WHERE uid = ?",
    params: [pn],
  });

  queries.push({
    query: "DELETE FROM reports WHERE uid = ?",
    params: [pn],
  });

  queries.push({
    query: "DELETE FROM inbox WHERE uid = ?",
    params: [pn],
  });

  queries.push({
    query: "DELETE FROM topFriendsAndPolls WHERE uid = ?",
    params: [pn],
  });

  queries.push({
    query: "DELETE FROM userPolls WHERE uid = ?",
    params: [pn],
  });

  queries.push({
    query: "DELETE FROM notificationTable WHERE uid = ?",
    params: [pn],
  });

  if (deleteVerification) {
    queries.push({
      query: "DELETE FROM verification WHERE phoneNumber = ?",
      params: [phoneNumber],
    });
  }

  const DeleteUserScyllaPromise = client.batch(queries, { prepare: true });

  promises.push(DeleteUserScyllaPromise);

  const DeleteFirebaseUserPromise = admin.auth().deleteUser(phoneNumber);
  promises.push(DeleteFirebaseUserPromise);

  // Gremlin query to delete the vertex 'User' using the phoneNumber given
  const gremlinQuery = `g.hasV().has('User', 'uid', ${phoneNumber}).drop()`;
  const DeleteUserGremlinPromise = g.execute(gremlinQuery);
  promises.push(DeleteUserGremlinPromise);

  // Wait for all promises to resolve
  await Promise.all(promises);
}

async function handleTransactionError(phoneNumber, a = undefined, b = undefined) {
  await DeleteUser(phoneNumber)
}

//#endregion

//fetchRequestsFromSQS("https://sqs.us-east-1.amazonaws.com/422862242595/UserCreationSQSQueue");

//module.exports = { fetchRequestsFromSQS ,getNumberOfMessagesInSQS};
