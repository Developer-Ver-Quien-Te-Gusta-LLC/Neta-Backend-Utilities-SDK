const FetchFromSecrets = require("./AwsSecrets.js").FetchFromSecrets;
const FetchChannelId = require("./AlbyToken.js").FetchChannelId;
const getDataFromScyalla = require("./DataBaseQueriesHandler.js").getDataFromScyalla;

const {CloudTasksClient} = require('@google-cloud/tasks');
const client = new CloudTasksClient();


const Ably = require('ably');

var ably;
let PubSubTopic;
async function fetchAlby() {
  const key = await FetchFromSecrets("AblyAPIKey");
  ably = new Ably.Realtime({ key: key });
  await ably.connection.once("connected");
}
fetchAlby();

const admin = require("firebase-admin");

let Credentials;
var NotifTitle;
async function SetupFCM() {
  PubSubTopic = await FetchFromSecrets("PubSubTopicName");
  NotifTitle = await FetchFromSecrets("InboxNotificationTitle");
  //import serviceAccount from './credentials/creds.json';
  Credentials = await FetchFromSecrets("FCMAccountCredentials");
  Credentials = JSON.parse(Credentials);
  if (admin.apps.length === 0) {
    admin.initializeApp({
      credential: admin.credential.cert(Credentials),
    });
  }
}
SetupFCM();

async function publishAlbyMessageNaive(user_id, message) {
  var topicName = user_id

  const channel = ably.channels.get(topicName);

  if (typeof (message) == "object") message = JSON.stringify(message)
  await channel.publish("event", message);


  return { message: `Published a message to the topic: ${topicName}` };
}

async function publishAlbyMessage(ChannelID, message,intent) {
  if (!ChannelID) {
    console.log("No topic name found for user");
    return { message: "No topic name found for user" };
  }

  const channel = ably.channels.get(ChannelID);
  await channel.publish("event", message);
  console.log(`Published a message to the topic: ${ChannelID}`);
  return { message: `Published a message to the topic: ${ChannelID}` };
}

async function publishFCMMessage(userToken, message,intent) {
  if (!userToken) {
    //console.error("User token is not provided");
    return;
  }

  var body ;

  switch(intent) {
    case "poll":
      if(message.askedgender == "Female"){
        message.askedgender = chica;

      }
      else if(message.askedgender == "Male"){
        message.askedgender = chico;

      }
      else{
        message.askedgender = estudiante;
      }
      if (message.askedschool == undefined || message.askedschool == null) {
        body = "someone from no school";
      } else {
        body = NotifTitle.replace("{GENDER}", message.askedgender).replace("{SCHOOL}", message.askedschool);
      }
      break;
    case "request":
      body = message.username + " Send you a Friend Request";
      break;
    case "try-reveal":
      body = "Someone tried to reveal your poll";
    case "reveal":
      body = "Someone revealed your poll";
    default:
      body = "You have unread notification";
      break;
  }

  const payload = {
    token: userToken,
    notification: {
      title: "Neta",
      body: body
    },
    data: {
      id: '10'
    }
  };

  //console.log("Notification Data ---->",payload.notification.body);

  admin
    .messaging()
    .send(payload)
    .then((response) => {
      
    })
    .catch((error) => {
      console.error(`Error sending notification: ${error}`);
    });
}

async function SendNotification(uid, payload, intent) {
  try {
    const ChannelID = await FetchChannelId(uid);
    await publishAlbyMessage(ChannelID, payload,intent);
    const userToken = await getDataFromScyalla("users", uid, "FCMToken");
    await publishFCMMessage(userToken, payload,intent);
   // console.log("RT Notificaiton Sent");
  }
  catch (err) {
    console.error(`Error Sending RT notif: ${err}`);
  }
}


const { PubSub } = require('@google-cloud/pubsub');
const pubSubClient = new PubSub();


async function PublishDelayedNotif(data, Timeout,title,token) { //make sure data is string and Timeout is minutes
  const project = 'massive-boulder-403908';
  const queue = 'Notifications';
  const location = 'us-east-1';
  const url = 'https://us-central1-massive-boulder-403908.cloudfunctions.net/sendFCMNotification';
  const payload = {
    token: token,
    title: title,
    body: data,
  };

  const parent = client.queuePath(project, location, queue);

  const task = {
    httpRequest: {
      httpMethod: 'POST',
      url,
      body: Buffer.from(JSON.stringify(payload)).toString('base64'),
      headers: {
        'Content-Type': 'application/json',
      },
    },
    scheduleTime: {
      seconds: Timeout + Date.now() / 1000,
    },
  };

  const request = {
    parent,
    task,
  };

  const [response] = await client.createTask(request);
  console.log(`Created task ${response.name}`);
}
module.exports = { SendNotification, publishFCMMessage, publishAlbyMessage, publishAlbyMessageNaive, PublishDelayedNotif };
