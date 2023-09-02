const  FetchFromSecrets  = require("./AwsSecrets.js").FetchFromSecrets;
const cassandra = require('cassandra-driver');

var queueURL;

const UserCreation = require("./UserCreation.js");

const AWS = require('aws-sdk');

const sqs = new AWS.SQS();
const {SetupCassandraClient} = require('./SetupCassandra.js')


var client;
SetupCassandraClient(client).then(
  (Cassandraclient) => (client = Cassandraclient)
);



async function CheckRetry(uid, transactionId) {
  // Define retry limit
  const retryLimit = await KV.getKV("RetryTimes");

  // Fetch the transaction
  const selectQuery = "SELECT retry_count FROM transactions WHERE transaction_id = ? AND uid = ?";
  const params = [transactionId, uid];
  const result = await client.execute(selectQuery, params, { prepare: true });

  if (result.rowLength > 0) {
    const retryCount = result.first().retry_count;
    if (retryCount < retryLimit) {
      // Increment retry count
      const incrementRetryCountQuery = "UPDATE transactions SET retry_count = retry_count + 1 WHERE transaction_id = ? AND uid = ?";
      await client.execute(incrementRetryCountQuery, [transactionId, uid], { prepare: true });
      return true;
    } else {
      console.log(`Transaction ${transactionId} for uid ${uid} has reached the retry limit.`);
      return false;
    }
  } else {
    console.log(`Transaction ${transactionId} for uid ${uid} does not exist.`);
    return false;
  }
}

async function handleTransactionError(service, data) {
  if (!(await CheckRetry(data.transactionId))) {
    //TODO: Delete The Entire User and reset retries for next attempy
    return;
  }
  /// service = "scylla", "cognito", "graphdb"
  /// send the data back to this specfic service

  if (service == "scylla") {
    UserCreation.CreateScyllaUser(data);
  } else if (service == "cognito") {
    UserCreation.CreateCognitoUser(data);
  } else if (service == "graphdb") {
    UserCreation.CreateNeptuneUser(data);
  }
}


//#region Fetching params stored in SQS , completely different from error handling
async function fetchRequestsFromSQS(queueURL) { //TODO: fetch max requests from KV
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
        const deleteParams = {
          QueueUrl: queueURL,
          ReceiptHandle: data.Messages[0].ReceiptHandle
        };
        sqs.deleteMessage(deleteParams, function(err, data) {
          if (err) {
            console.warn("Delete Error", err);
          } 
        });
        resolve(data.Messages || []);
      }
    });
  });
}

//#endregion

//fetchRequestsFromSQS("https://sqs.us-east-1.amazonaws.com/422862242595/UserCreationSQSQueue");

module.exports = {handleTransactionError,fetchRequestsFromSQS};