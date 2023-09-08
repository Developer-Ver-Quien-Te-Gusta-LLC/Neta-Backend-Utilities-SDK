const  FetchFromSecrets  = require("./AwsSecrets.js").FetchFromSecrets;
const  FetchChannelId  = require("./AlbyToken.js").FetchChannelId;
const  getDataFromScyalla  = require("./DataBaseQueriesHandler.js").getDataFromScyalla;
const getKV = require('./KV.js').getKV

const Ably = require('ably');

var ably;
let sendRedundantly
async function fetchAlby() {
  ably = new Ably.Realtime.Promise(await FetchFromSecrets("AblyAPIKey"));
  await ably.connection.once("connected");
  sendRedundantly = getKV("RedundantNotifications")
}
fetchAlby();

console.log("Connected to Ably!");
const admin = require("firebase-admin");

let Credentials;
async function SetupFCM() {
  //import serviceAccount from './credentials/creds.json';
  Credentials = await FetchFromSecrets("FCMAccountCredentials");
  Credentials = JSON.parse(Credentials);
  if(admin.apps.length ===0){
  admin.initializeApp({
    credential: admin.credential.cert(Credentials),
  });
}
}
SetupFCM();

async function publishAlbyMessageNaive(user_id, message) {
  var topicName = user_id

  const channel = ably.channels.get(topicName);

  if (typeof(message) == "object") message = JSON.stringify(message)
  await channel.publish(message);

  return { message: `Published a message to the topic: ${topicName}` };
}

async function publishAlbyMessage(user_id, message) {
  const temp = await FetchChannelId(user_id, true); //await DataHandler.getDataFromScyalla("Users", user_id, "AlbyTopicName");
  var topicName = temp.topicId;
  var encryptionKey = temp.encryptionKey;

  if (!topicName) {
    return { message: "No topic name found for user" };
  }

  const channel = ably.channels.get(topicName);

  if (typeof(message) == "object") message = JSON.stringify(message)

  const EncryptedMessage = await encrypt(message, encryptionKey);
  await channel.publish(JSON.stringify(EncryptedMessage));

  return { message: `Published a message to the topic: ${topicName}` };
}

async function publishFCMMessage(userToken, message) {
  const payload = {
    notification: {
      title: "tbd",
      body: typeof(message) == "object" ? message : JSON.stringify(message),
    },
  };

  admin
    .messaging()
    .sendToDevice(userToken, payload)
    .then((response) => {
      console.log("Notification sent successfully:", response);
    })
    .catch((error) => {
      console.error("Error sending notification:", error);
    });
}

async function SendNotification(userId, payload) {
  let userStatus = await getDataFromScyalla("users", userId, "online");
  if (userStatus == undefined || userStatus == null) userStatus = false /// no value defaults to false

  if (sendRedundantly) {
    const userToken = await getDataFromScyalla("users", userId, "uid");
    await Promise.allSettled([publishAlbyMessage(userId, payload), publishFCMMessage(userToken, JSON.stringify(payload))])
  }

  if (userStatus == true) {
    await publishAlbyMessage(userId, payload);
  } else {
    const userToken = await getDataFromScyalla("users", userId, "uid");
    await publishFCMMessage(userToken, JSON.stringify(payload));
  }
}
module.exports = { SendNotification ,publishAlbyMessage, publishAlbyMessageNaive };
