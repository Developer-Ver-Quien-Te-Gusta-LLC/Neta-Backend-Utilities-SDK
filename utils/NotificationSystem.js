const  FetchFromSecrets  = require("./AwsSecrets.js").FetchFromSecrets;
const  FetchChannelId  = require("./AlbyToken.js").FetchChannelId;
const  getDataFromScyalla  = require("./DataBaseQueriesHandler.js").getDataFromScyalla;
const getKV = require('./KV.js').getKV

const Ably = require('ably');

var ably;
let sendRedundantly
async function fetchAlby() {
  const key = await getKV("AblyAPIKey");
  ably = new Ably.Realtime({key:key});
  await ably.connection.once("connected");
  //sendRedundantly = getKV("RedundantNotifications")
}
fetchAlby();

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
  await channel.publish("event",message);


  return { message: `Published a message to the topic: ${topicName}` };
}

async function publishAlbyMessage(ChannelID, message) {
  if (!ChannelID) {
    return { message: "No topic name found for user" };
  }

  const channel = ably.channels.get(ChannelID);
  await channel.publish("event",message);

  return { message: `Published a message to the topic: ${topicName}` };
}

async function publishFCMMessage(userToken, message) {
  const payload = {
    token: userToken,
    notification: {
      title: "tbd",
      body: typeof(message) == "object" ? message : JSON.stringify(message),
    },
  };

  admin
    .messaging()
    .send( payload)
    .then((response) => {
      console.log("Notification sent successfully:", response);
    })
    .catch((error) => {
      console.error("Error sending notification:", error);
    });
}

async function SendNotification(uid, payload) {
  /*if (sendRedundantly) {
    const userToken = await getDataFromScyalla("users", uid, "FCMToken");
    await Promise.allSettled([publishAlbyMessage(uid, payload), publishFCMMessage(userToken, JSON.stringify(payload))])
  }*/
  const ChannelID = await FetchChannelId(uid);

  if(ChannelID !=undefined) await publishAlbyMessage(ChannelID, payload);

  const userToken = await getDataFromScyalla("users", uid, "FCMToken");

  if(userToken!=undefined)await publishFCMMessage(userToken, JSON.stringify(payload));
}
module.exports = { SendNotification,publishFCMMessage ,publishAlbyMessage, publishAlbyMessageNaive };
