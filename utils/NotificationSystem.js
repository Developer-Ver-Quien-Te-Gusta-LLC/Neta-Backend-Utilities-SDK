const  FetchFromSecrets  = require("./AwsSecrets.js").FetchFromSecrets;
const  FetchChannelId  = require("./AlbyToken.js").FetchChannelId;
const  getDataFromScyalla  = require("./DataBaseQueriesHandler.js").getDataFromScyalla;
const { encrypt } = require("./AwsEncryption.js").encrypt;

const Ably = require('ably');

var ably;
async function fetchAlby() {
  ably = new Ably.Realtime.Promise(await FetchFromSecrets("AblyAPIKey"));
  await ably.connection.once("connected");
}
fetchAlby();
console.log("Connected to Ably!");
const fcm = require('firebase-admin');
//import serviceAccount from './credentials/creds.json';

/*admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});*/

async function publishAlbyMessage(user_id, message) {
  const temp = await FetchChannelId(user_id, true); //await DataHandler.getDataFromScyalla("Users", user_id, "AlbyTopicName");
  var topicName = temp.topicId;
  var encryptionKey = temp.encryptionKey;

  if (!topicName) {
    return { message: "No topic name found for user" };
  }

  const channel = ably.channels.get(topicName);
  if (!channel) channel = alby.channels.create(topicName);

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

async function SendNotificationPush(userId, payload) {
  await publishFCMMessage(userToken, JSON.stringify(payload));
}

async function SendNotificationInApp(userId, payload) {
  await publishAlbyMessage(userId, payload);
}


async function SendNotification(userId, payload) {
  const userStatus = await getDataFromScyalla("Users", userId, "Online");

  if (userStatus == true) {
    await publishAlbyMessage(userId, payload);
  } else {
    const userToken = await getDataFromScyalla("Users", userId, "token");
    await publishFCMMessage(userToken, JSON.stringify(payload));
  }
}
module.exports = { SendNotification ,publishAlbyMessage, SendNotificationPush, SendNotificationInApp };
