const FetchFromSecrets = require("./AwsSecrets.js").FetchFromSecrets;
const cassandra = require("cassandra-driver");

const UserCreation = require("./UserCreation.js");

const AWS = require("aws-sdk");

const sqs = new AWS.SQS();
const { SetupCassandraClient } = require("./SetupCassandra.js");

var client;
SetupCassandraClient(client).then(
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

//#region Fetching params stored in SQS , completely different from error handling
async function fetchRequestsFromSQS(queueURL, numberOfMessages = 10) {
  //TODO: fetch max requests from KV
  const params = {
    QueueUrl: queueURL,
    MaxNumberOfMessages: numberOfMessages,
    WaitTimeSeconds: 10, // Maximum wait time for messages (long polling)
    VisibilityTimeout: 30, // for example, 30 seconds
  };

  return new Promise((resolve, reject) => {
    sqs.receiveMessage(params, (err, data) => {
      if (err) {
        reject(err);
      } else {
        if (data.Messages!=undefined) {
          const deleteParams = {
            QueueUrl: queueURL,
            ReceiptHandle: data.Messages[0].ReceiptHandle,
          };

          sqs.deleteMessage(deleteParams, function (err, data) {
            if (err) {
              console.warn("Delete Error", err);
            }
          });
        }
        resolve(data.Messages || []);
      }
    });
  });
}
async function getNumberOfMessagesInSQS(queueURL) {
  const params = {
    QueueUrl: queueURL,
    AttributeNames: ['ApproximateNumberOfMessages']
  };

  try {
    const response = await sqs.getQueueAttributes(params).promise();
    return parseInt(response.Attributes.ApproximateNumberOfMessages);
  } catch (error) {
    console.error(error);
    return null;
  }
}

//#endregion

//fetchRequestsFromSQS("https://sqs.us-east-1.amazonaws.com/422862242595/UserCreationSQSQueue");

module.exports = { fetchRequestsFromSQS ,getNumberOfMessagesInSQS};
