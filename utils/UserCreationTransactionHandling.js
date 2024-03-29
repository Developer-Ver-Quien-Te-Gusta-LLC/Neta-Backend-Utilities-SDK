
const CassandraClient = require("./SetupCassandra");
const FetchFromSecrets = require("./AwsSecrets.js").FetchFromSecrets;
const FetchChannelId = require('./AlbyToken.js').FetchChannelId;

const {SendNotification,PublishDelayedNotif} = require("./NotificationSystem.js");
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
async function onTransactionStart(transaction_id,phoneNumber) {
  const isInProgress = await isTransactionInProgress(phoneNumber);
  
  if (isInProgress) {
    console.error(`Transaction for phoneNumber ${phoneNumber} is already in progress.`);
    throw new Error('Transaction already in progress');
  } else {
    const transactionId = uuidv4();
    const insertQuery = "INSERT INTO transactions (pk, transaction_id, status, phoneNumber) VALUES (?, ?, ?, ?)";
    const params = [uuidv4(), transaction_id, "in progress", phoneNumber];
    await client.execute(insertQuery, params, { prepare: true });
    return transactionId;
  }
}

async function handleTransactionCompletion(uid, phoneNumber) {
  const selectQuery = "SELECT transaction_id FROM transactions WHERE phoneNumber = ? ALLOW FILTERING";
  const selectParams = [phoneNumber];
  const selectResult = await client.execute(selectQuery, selectParams, { prepare: true });
 
  var transactionId = String(selectResult.rows[0].transaction_id);

  const insertQuery = "INSERT INTO transactions (pk, transaction_id, status, uid, phoneNumber) VALUES (?, ?, ?, ?, ?)";
  const params = [uuidv4(), transactionId, "completed", uid, phoneNumber];
  
  await client.execute(insertQuery, params, { prepare: true });
  checkAllTransactionsCompleted(transactionId, phoneNumber,uid);
}
async function checkAllTransactionsCompleted(transactionId,phoneNumber,uid) {
    const selectQuery = "SELECT COUNT(*) as count FROM transactions WHERE phoneNumber = ? AND status = ? ALLOW FILTERING";
    const params = [phoneNumber, "completed"];
    const result = await client.execute(selectQuery, params, { prepare: true });
    if (result.rows[0].count >= 3) {
      OnUserCreationComplete(transactionId, phoneNumber,uid);
      return true
    }
    else{
      return false
    }
   
}

async function isTransactionInProgress(phoneNumber) {
  const selectQuery = "SELECT COUNT(*) as count FROM transactions WHERE phoneNumber = ? AND status = ? ALLOW FILTERING";
  const params = [phoneNumber, "in progress"];
  const result = await client.execute(selectQuery, params, { prepare: true });
  return (result.rows[0].count > 0);
}

async function OnUserCreationComplete(transactionId, phoneNumber,uid) {
  console.log("transactions complete");
  const token = await client.execute('SELECT jwt FROM tokens WHERE phoneNumber = ? ALLOW FILTERING', [phoneNumber], { prepare: true });
  
  const albySuccessObj = {
    status: "success",
    token: String(token.rows[0].jwt)
  };
  
  console.log("JWT returned--->",token.rows[0].jwt);

  const insertInboxQuery = "INSERT INTO inbox (messageuid, pushedtime, read, inboxindex,uid) VALUES (?, ?, ?, ?,?)";
  const inboxParams = [uuidv4(), new Date(), false, 0,uid];
  await client.execute(insertInboxQuery, inboxParams, { prepare: true });

  ably.channels.get(String(transactionId)).publish("event", JSON.stringify(albySuccessObj), (err) => {
    if (err) {
      console.log("Unable to publish message; err = " + err.message);
    }
    
  });

  var userdata = await client.execute("SELECT gender,firstname,lastname,highschool,grade,fcmtoken FROM users WHERE uid = ?",[uid],{prepare:true});
  userdata = userdata.rows[0];
  
  const users = await client.execute("SELECT uid FROM users WHERE highschool = ? AND grade = ? ALLOW FILTERING", [userdata.highschool, userdata.grade], { prepare: true });

  for(let user of users.rows) {
    await SendNotification(user.uid.toString(),{name:userdata.firstname + " "+ userdata.lastname},"notify-classmates");
  }
  
  var ReviewNotificationDelay = await FetchFromSecrets("ReviewNotificationTime");
  await PublishDelayedNotif("Hope you're liking Neta, please leave us a review!!!",parseInt(ReviewNotificationDelay),"Neta",userdata.fcmtoken);
  var body;
  body = await FetchFromSecrets("InboxNotificationTitle");

  if(userdata.gender == "Female"){
    body = body.replace("{GENDER}", "chico").replace("{SCHOOL}",userdata.highschool);
  }
  else if(userdata.gender == "Male"){
    body = body.replace("{GENDER}", "chica").replace("{SCHOOL}", userdata.highschool);
  }
  else{
    body = body.replace("{GENDER}", "estudiante").replace("{SCHOOL}", userdata.highschool);
  }
  
  await PublishDelayedNotif(body,60*30,"Neta",userdata.fcmtoken,uid,true);
  
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