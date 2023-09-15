
const CassandraClient = require("./SetupCassandra");
const FetchFromSecrets = require("./AwsSecrets.js").FetchFromSecrets;
const FetchChannelId = require('./AlbyToken.js').FetchChannelId;
const uuidv4 = require('uuid').v4;
const Ably = require('ably');

var ably;

async function fetchAlby() {
  const key = await FetchFromSecrets("AblyAPIKey");
  ably = new Ably.Realtime({key:key});
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
    const insertQuery = "INSERT INTO transactions (pk, transaction_id, status, phoneNumber) VALUES (?, ?, ?, ?)";
    const params = [uuidv4(), uuidv4(), "in progress", phoneNumber];
    await client.execute(insertQuery, params, { prepare: true });
    return transactionId;
  }
}

async function handleTransactionCompletion(uid, phoneNumber) {
  const selectQuery = "SELECT transaction_id FROM transactions WHERE phoneNumber = ? ALLOW FILTERING";
  const selectParams = [phoneNumber];
  const selectResult = await client.execute(selectQuery, selectParams, { prepare: true });
 
  const transactionId = selectResult.rows[0].transaction_id;
  
  const insertQuery = "INSERT INTO transactions (pk, transaction_id, status, uid, phoneNumber) VALUES (?, ?, ?, ?, ?)";
  const params = [uuidv4(), transactionId, "completed", uid, phoneNumber];
  
  await client.execute(insertQuery, params, { prepare: true });
  checkAllTransactionsCompleted(transactionId, phoneNumber);
}
async function checkAllTransactionsCompleted(phoneNumber) {
  console.log("Checking for transactions complete");
  const selectQuery2 = "SELECT transaction_id FROM transactions WHERE phoneNumber = ? ALLOW FILTERING";
  const selectParams = [phoneNumber];
  const selectResult = await client.execute(selectQuery2, selectParams, { prepare: true });
  
  const transactionId = selectResult.rows[0].transaction_id;

    const selectQuery = "SELECT COUNT(*) as count FROM transactions WHERE phoneNumber = ? AND status = ? ALLOW FILTERING";
    const params = [phoneNumber, "completed"];
    const result = await client.execute(selectQuery, params, { prepare: true });


    if (result.rows[0].count === 4) {
      OnUserCreationComplete(transactionId, phoneNumber);
    }
    return transactionId
}

async function isTransactionInProgress(phoneNumber) {
  const selectQuery = "SELECT COUNT(*) as count FROM transactions WHERE phoneNumber = ? AND status = ? ALLOW FILTERING";
  const params = [phoneNumber, "in progress"];
  const result = await client.execute(selectQuery, params, { prepare: true });
  return (result.rows[0].count > 0);
}

async function OnUserCreationComplete(transactionId, phoneNumber) {
  console.log("transactions complete");
  const token = await client.execute('SELECT UserToken FROM tokens WHERE phoneNumber = ?', [phoneNumber], { prepare: true });
  const albySuccessObj = {
    status: "success",
    token: token.rows[0]
  };

  ably.channels.get(transactionId).publish("event", JSON.stringify(albySuccessObj), (err) => {
    if (err) {
      console.log("Unable to publish message; err = " + err.message);
    }
    else{
      console.log("published to ably");
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
