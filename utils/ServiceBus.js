const secrets = require("./AwsSecrets");
const cassandra = require("cassandra-driver");

var queueURL;
import{CreateScyllaUser,CreateCognitoUser,CreateNeptuneUser} from "../index.js";

const { contains } = require("cheerio/lib/static");

const AWS = require("aws-sdk");
const sqs = new AWS.SQS();

async function SetupClients(){
contactPoints = await secrets.FetchFromSecrets("contactPoints");
localDataCenter = await secrets.FetchFromSecrets("localDataCenter");
keyspace = await secrets.FetchFromSecrets("keyspace");
const client = new cassandra.Client({
  contactPoints: [contactPoints], // change to your ScyllaDB host
  localDataCenter: localDataCenter, // change to your data center
  keyspace: keyspace, // change to your keyspace
});
}

SetupClients();

client.connect((err) => {
  if (err) {
    console.error("Error connecting to ScyllaDB:", err);
    return;
  }
});

async function CheckRetry(phoneNumber, transactionId) {
  // Define retry limit
  const retryLimit = await KV.getKV("RetryTimes");

  // Fetch the transaction
  const selectQuery = "SELECT retry_count FROM transactions WHERE transaction_id = ? AND phone_number = ?";
  const params = [transactionId, phoneNumber];
  const result = await client.execute(selectQuery, params, { prepare: true });

  if (result.rowLength > 0) {
    const retryCount = result.first().retry_count;
    if (retryCount < retryLimit) {
      // Increment retry count
      const incrementRetryCountQuery = "UPDATE transactions SET retry_count = retry_count + 1 WHERE transaction_id = ? AND phone_number = ?";
      await client.execute(incrementRetryCountQuery, [transactionId, phoneNumber], { prepare: true });
      return true;
    } else {
      console.log(`Transaction ${transactionId} for phone number ${phoneNumber} has reached the retry limit.`);
      return false;
    }
  } else {
    console.log(`Transaction ${transactionId} for phone number ${phoneNumber} does not exist.`);
    return false;
  }
}

async function handleTransactionError(service, data) {
  if (!(await CheckRetry(data.transactionId))){
    //TODO: Delete The Entire User and reset retries for next attempy
     return;
    }
    /// service = "scylla", "cognito", "graphdb"
    /// send the data back to this specfic service
   
    if(service == "scylla") {
      CreateScyllaUser(data);
    }
    else if(service == "cognito") {
      CreateCognitoUser(data);
    }

    else if(service == "graphdb") {
      CreateNeptuneUser(data);
    }

  }


//#region Fetching params stored in SQS , completely different from error handling
async function fetchRequestsFromSQS(queueURL) { //TODO: fetch max requests from KV
  const params = {
    QueueUrl: queueURL,
    MaxNumberOfMessages: 1000,
    WaitTimeSeconds: 10, // Maximum wait time for messages (long polling)
  };

  return new Promise((resolve, reject) => {
    sqs.receiveMessage(params, (err, data) => {
      if (err) {
        reject(err);
      } else {
        resolve(data.Messages || []);
      }
    });
  });
}

//#endregion

module.exports = {handleTransactionError,fetchRequestsFromSQS};