
const CassandraClient = require("./SetupCassandra");
const FetchFromSecrets = require("./AwsSecrets.js").FetchFromSecrets;
const FetchChannelId = require('./AlbyToken.js').FetchChannelId;
const uuidv4 = require('uuid').v4;
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

// To initiate a transaction when user creation starts
async function onTransactionStart(phoneNumber) {
  const isInProgress = await isTransactionInProgress(phoneNumber);
  
  if (isInProgress) {
    console.error(`Transaction for phoneNumber ${phoneNumber} is already in progress.`);
    throw new Error('Transaction already in progress');
  } else {
    const transactionId = uuidv4();
    const insertQuery = "INSERT INTO transactions (pk, transaction_id, status, phoneNumber) VALUES (?, ?, ?, ?) IF NOT EXISTS";
    const params = [uuidv4(), transactionId, "in progress", phoneNumber];
    await client.execute(insertQuery, params, { prepare: true });
    return transactionId;
  }
}

async function handleTransactionCompletion(uid, transactionId, phoneNumber) {
  const insertQuery = "INSERT INTO transactions (pk, transaction_id, status, uid) VALUES (?, ?, ?, ?) IF NOT EXISTS";
  const params = [uuidv4(), transactionId, "completed", uid];
  const insertResult = await client.execute(insertQuery, params, { prepare: true });
  
  if (insertResult.applied) {
    checkAllTransactionsCompleted(transactionId, phoneNumber);
  } else {
    console.log(`Transaction ${transactionId} has already been completed.`);
  }
}

async function checkAllTransactionsCompleted(transactionId, phoneNumber) {
  console.log("checkAllTransactionsCompleted = " + phoneNumber);
  await ernesto(transactionId, phoneNumber);

  async function ernesto(transactionId, phoneNumber) {
    const selectQuery = "SELECT COUNT(*) as count FROM transactions WHERE phoneNumber = ? AND status = ? ALLOW FILTERING";
    const params = [phoneNumber, "completed"];
    const result = await client.execute(selectQuery, params, { prepare: true });

    if (result && result.first() && result.first().count === 4) {
      OnUserCreationComplete(transactionId, phoneNumber);
    }
  }
}

async function isTransactionInProgress(phoneNumber) {
  console.log("isTransactionInProgress")
  const selectQuery = "SELECT COUNT(*) as count FROM transactions WHERE phoneNumber = ? AND status = ? ALLOW FILTERING";
  const params = [phoneNumber, "in progress"];
  const result = await client.execute(selectQuery, params, { prepare: true });
  return (result && result.first() && result.first().count > 0);
}

async function OnUserCreationComplete(transactionId, phoneNumber) {
  const token = await client.execute('SELECT UserToken FROM tokens WHERE phoneNumber = ?', [phoneNumber], { prepare: true });
  const albySuccessObj = {
    status: "success",
    token: token.rows[0]
  };

  ably.channels.get(transactionId).publish("event", JSON.stringify(albySuccessObj), (err) => {
    if (err) {
      console.log("Unable to publish message; err = " + err.message);
    }
  });
}

async function OnUserCreationFailed(transactionId) {
  const albyFailureObj = { status: "failed" };
  ably.channels.get(transactionId).publish("event", JSON.stringify(albyFailureObj), (err) => {
    if (err) {
      console.log("Unable to publish message; err = " + err.message);
    }
  });
}

module.exports = {
  onTransactionStart,
  handleTransactionCompletion,
  checkAllTransactionsCompleted,
  OnUserCreationFailed,
  isTransactionInProgress
};
