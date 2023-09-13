///
/// This function is internal-facing and thottled heavily. It creates all of the services
/// used in this application either syncronously or asyncrounsly (value taken from AWS KMS).
/// If v=async, then each service exists seperately duplicated in each region and is queud up all at once using Promise.allSettled
/// otherwise use a single service that creates all syncronously.

///
/// Assign user a 'pollIndex' that is inclusive 0 -> num(polls)
///
const CassandraClient = require("./SetupCassandra");


const  FetchFromSecrets  = require("./AwsSecrets.js").FetchFromSecrets;
const FetchChannelId = require('./AlbyToken.js').FetchChannelId;

const Ably = require('ably');

var ably;
async function fetchAlby() {
  ably = new Ably.Realtime.Promise(await FetchFromSecrets("AblyAPIKey"));
  await ably.connection.once("connected");
}
fetchAlby()
let client;

CassandraClient.SetupCassandraClient(client).then((result) => {
  client = result;
});

// TODO: implemenet isTransactionInProgress

// This function will be invoked by each service via SNS Topic
async function handleTransactionCompletion(uid, transactionId, phoneNumber) {
  const insertQuery =
    "INSERT INTO transactions (transaction_id, status, uid) VALUES (?, ?, ?) IF NOT EXISTS?";
  const params = [transactionId, "completed", uid];
  const insertPromise = client.execute(insertQuery, params, { prepare: true });
  
  const [insertResult] = await Promise.all([insertPromise]);
  const result = insertResult;

  if (result.applied) {
    // If LWT is successful (insert operation is applied)
    // Check all transactions
    checkAllTransactionsCompleted(transactionId,phoneNumber);
  } else {
    console.log(`Transaction ${transactionId} has already been completed.`);
  }
}

// This function checks if all three transactions are completed
async function checkAllTransactionsCompleted(transactionId,phoneNumber) {
  const selectQuery =
    "SELECT COUNT(*) as count FROM transactions WHERE transaction_id = ? AND status = ? ALLOW FILTERING";
  const params = [transactionId, "completed"];
  const result = await client.execute(selectQuery, params, { prepare: true });
  console.log("RESULT!!! " + JSON.stringify(result))

  if (result && result.first() && result.first().count === 3) {
    // If all transactions are completed, then invoke the final function
    OnUserCreationComplete(transactionId,phoneNumber);
  }
}

async function isTransactionInProgress(phoneNumber) {
  const selectQuery =
    "SELECT COUNT(*) as count FROM transactions WHERE phoneNumber = ? AND status = ? ALLOW FILTERING";
  const params = [phoneNumber, "in progress"];
  const result = await client.execute(selectQuery, params, { prepare: true });

  if (result && result.first() && result.first().count > 0) {
    return true;
  } else {
    return false;
  }
}


async function OnUserCreationComplete(transactionId,phoneNumber) {

  const token = await client.execute('SELECT UserToken FROM tokens WHERE phoneNumber = ?',[phoneNumber],{prepare:true});
  // Send success signal via alby
  const albySuccessObj = {
    status: "success",
    token: token.rows[0]
  };

  // Publish a message to the channel
  ably.channnels.get(transactionId).channel.publish("event", JSON.stringify(albySuccessObj), (err) => {
    if (err) {
      console.log("Unable to publish message; err = " + err.message);
    }
  });
}

async function OnUserCreationFailed(transactionId) {
// Send success signal via alby
const albySuccessObj = {
  status: "failed",
};

var channel = ably.channels.get(transactionId);

// Publish a message to the channel
channel.publish("event", JSON.stringify(albySuccessObj), (err) => {
  if (err) {
    console.log("Unable to publish message; err = " + err.message);
  }
});
}

/*async function checkForTransactionErrors(transaction_id) {
  const selectQuery =
    "SELECT status as status FROM transactions WHERE transaction_id = ?";
  const params = [transactionId];
  const result = await client.execute(selectQuery, params, { prepare: true });

  if (result.first().status == "Failed") {
    return true;
  } else {
    return false;
  }
}*/

module.exports= {
  handleTransactionCompletion,
  checkAllTransactionsCompleted,
 // checkForTransactionErrors,
 OnUserCreationFailed,
 isTransactionInProgress
};
