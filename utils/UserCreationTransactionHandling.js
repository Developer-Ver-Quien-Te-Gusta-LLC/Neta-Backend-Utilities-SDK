///
/// This function is internal-facing and thottled heavily. It creates all of the services
/// used in this application either syncronously or asyncrounsly (value taken from AWS KMS).
/// If v=async, then each service exists seperately duplicated in each region and is queud up all at once using Promise.allSettled
/// otherwise use a single service that creates all syncronously.

///
/// Assign user a 'pollIndex' that is inclusive 0 -> num(polls)
///


import cassandra from "cassandra-driver";
const region = process.env.AWS_REGION;

import{FetchFromSecrets} from "./AwsSecrets.js";

const client = new cassandra.Client({
  contactPoints: [await FetchFromSecrets("contactPoints")], // change to your ScyllaDB host
  localDataCenter: await FetchFromSecrets("localDataCenter"), // change to your data center
  keyspace: await FetchFromSecrets("keyspace"), // change to your keyspace
});

client.connect((err) => {
  if (err) {
    console.error("Error connecting to ScyllaDB:", err);
    return;
  }
});



// This function will be invoked by each service via SNS Topic
async function handleTransactionCompletion(phoneNumber, transactionId, encryptionKey) {
  const insertQuery =
    "INSERT INTO transactions (transaction_id, status, phone_number) VALUES (?, ?, ?) IF NOT EXISTS";
  const params = [transactionId, "completed", phoneNumber];
  const result = await client.execute(insertQuery, params, { prepare: true });

  if (result.applied) {
    // If LWT is successful (insert operation is applied)
    // Check all transactions
    checkAllTransactionsCompleted(transactionId, encryptionKey);
  } else {
    console.log(`Transaction ${transactionId} has already been completed.`);
  }
}

// This function checks if all three transactions are completed
async function checkAllTransactionsCompleted(transactionId, encryptionKey) {
  const selectQuery =
    "SELECT COUNT(*) as count FROM transactions WHERE transaction_id = ? AND status = ?";
  const params = [transactionId, "completed"];
  const result = await client.execute(selectQuery, params, { prepare: true });

  if (result && result.first() && result.first().count === 3) {
    // If all transactions are completed, then invoke the final function
    OnUserCreationComplete(transactionId, encryptionKey);
  }
}

async function OnUserCreationComplete(transactionId, encryptionKey = null) {
  // Send success signal via alby
  const albySuccessObj = {
    status: "success",
  };

  var channel = ably.channels.get(transactionId);

  // Publish a message to the channel
  channel.publish("event", JSON.stringify(albySuccessObj), (err) => {
    if (err) {
      console.log("Unable to publish message; err = " + err.message);
    }
  });
}

async function OnUserCreationFailed(transactionId, encryptionKey = null) {
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

export {
  handleTransactionCompletion,
 // checkForTransactionErrors,
 OnUserCreationFailed,
};
