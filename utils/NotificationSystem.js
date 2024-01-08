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
//var NotifTitle;
async function SetupFCM() {
  PubSubTopic = await FetchFromSecrets("PubSubTopicName");
  //NotifTitle = await FetchFromSecrets("InboxNotificationTitle");
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
    return;
  }

  var body;

  switch(intent) {
    case "poll":
      if(message.askedgender == "Female"){
        message.askedgender = "chica";
      }
      else if(message.askedgender == "Male"){
        message.askedgender = "chico";
      }
      else{
        message.askedgender = "estudiante";
      }
      if (message.askedschool == undefined || message.askedschool == null) {
        body = "alguien de ninguna escuela te envió un mensaje";
      } else {
        body = await FetchFromSecrets("InboxNotificationTitle");
        body = body.replace("{GENDER}", message.askedgender).replace("{SCHOOL}", message.askedschool);
      }
      break;
    case "request":
      body = await FetchFromSecrets("Notification_FriendRequest");
      body = body.replace("USERNAME", message.username);
      //body = message.username + " Send you a Friend Request";
      break;
    case "try-reveal":
      body = await FetchFromSecrets("Notification_Try_Reveal");
     // body = "Someone tried to reveal your poll";
    case "reveal":
      body = await FetchFromSecrets("Notification_PollReveal");
      //body = "Someone revealed your poll";
    case "notify-classmates":
      body = await FetchFromSecrets("Notification_Notify_Classmates");
      body = body.replace("NAME", message.name);
      //body = `Your classmate ${message.name} is on Neta!!!`
    case "contact":
      body = await FetchFromSecrets("Notification_Notify_Contacts");
      body = body.replace("NAME",message.name);
      //body = `Your contact ${message.name} is on Neta!!!`
    default:
      body = "Tienes notificaciones no leídas";
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


async function PublishDelayedNotif(data, Timeout,title,token,uid,scylla) { //make sure data is string and Timeout is minutes
  const project = 'massive-boulder-403908';
  const queue = 'Notifications';
  const location = 'us-east1';
  const url = 'https://us-east1-massive-boulder-403908.cloudfunctions.net/sendFCMNotification';
  const payload = {
    token: token,
    title: title,
    body: data,
    uid: uid,
    scylla: scylla
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
