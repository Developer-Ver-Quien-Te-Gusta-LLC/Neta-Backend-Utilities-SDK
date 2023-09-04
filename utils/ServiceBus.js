const FetchFromSecrets = require("./AwsSecrets.js").FetchFromSecrets;
const cassandra = require("cassandra-driver");

var queueURL;

const UserCreation = require("./UserCreation.js");

const AWS = require("aws-sdk");

const sqs = new AWS.SQS();
const { SetupCassandraClient } = require("./SetupCassandra.js");

var client;
SetupCassandraClient(client).then(
  (Cassandraclient) => (client = Cassandraclient)
);

async function handleTransactionError(service, data, phoneNumber) {
  await UserCreation.DeleteUser(phoneNumber)
}

//#region Fetching params stored in SQS , completely different from error handling
async function fetchRequestsFromSQS(queueURL) {
  //TODO: fetch max requests from KV
  const params = {
    QueueUrl: queueURL,
    MaxNumberOfMessages: 10,
    WaitTimeSeconds: 10, // Maximum wait time for messages (long polling)
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

//#endregion

//fetchRequestsFromSQS("https://sqs.us-east-1.amazonaws.com/422862242595/UserCreationSQSQueue");

module.exports = { handleTransactionError, fetchRequestsFromSQS };
