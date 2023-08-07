import {
  FetchFromSecrets,
} from "./AwsSecrets.js"

import{FetchChannelId} from "./AlbyToken.js";
import{getDataFromScyalla} from "./DataBaseQueriesHandler.js";
import { encrypt } from "./AwsEncryption.js";

var ably;
async function fetchAlby() {
  alby = new Ably.Realtime.Promise(await FetchFromSecrets("AblyAPIKey"));
  await ably.connection.once("connected");
}
fetchAlby();
console.log("Connected to Ably!");

const fcm = require("firebase-admin");

var serviceAccount = require("./credentials/creds.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

async function publishAlbyMessage(user_id, message) {
  const temp = await FetchChannelId(user_id, true); //await DataHandler.getDataFromScyalla("Users", user_id, "AlbyTopicName");
  var topicName = temp.topicId;
  var encryptionKey = temp.encryptionKey;

  if (!topicName) {
    return { message: "No topic name found for user" };
  }

  const channel = ably.channels.get(topicName);
  if (!channel) channel = alby.channels.create(topicName);

  const EncryptedMessage = await encrypt(message, encryptionKey);
  await channel.publish(JSON.stringify(EncryptedMessage));

  return { message: `Published a message to the topic: ${topicName}` };
}

async function publishFCMMessage(userToken, message) {
  const payload = {
    notification: {
      title: "tbd",
      body: JSON.stringify(message),
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
  const userStatus = await getDataFromScyalla("Users", userId, "OnlineStatus");

  if (userStatus == true) {
    publishAlbyMessage(userId, payload);
  } else {
    const userToken = await getDataFromScyalla("Users", userId, "token");
    publishFCMMessage(userToken, JSON.stringify(payload));
  }
}
export { SendNotification };
