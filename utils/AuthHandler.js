const SendEvent = require('./Analytics.js').SendEvent;
const admin = require('firebase-admin');
const { FetchFromSecrets } = require('./AwsSecrets.js');
const {isInitialized} = require('./KV.js');

async function initializeFirebase() {
    try {
      var credentials = await FetchFromSecrets("FCMAccountCredentials");
  
      credentials = JSON.parse(credentials);
      if (!credentials) {
        console.error("Unable to fetch FCM Account Credentials.");
        return;
      }
  
      if (admin.apps.length === 0) {
        admin.initializeApp({
          credential: admin.credential.cert(credentials),
        });
  
        console.log("Firebase Admin SDK Initialized.");
      }
    } catch (error) {
      console.error("Error during Firebase Admin SDK initialization:", error);
    }
  }
  initializeFirebase();

//#region JWT Authentication
async function GetUserDataFromJWT(req) {
    const token = req.headers.authorization;
    return ExtractData(token);
}

async function ExtractData(token){
    if (!token) {
        await SendEvent('authorization_failed', null, { headers: req.headers, body: req.body, qstring: req.query });
        console.log("no token");
        return { success: false, err: "A token is required for authentication" };
    }

    try {
        const decodedToken = await admin.auth().verifyIdToken(token);
        const uid = decodedToken.uid;
        return {uid:decodedToken.uid,phoneNumber:decodedToken.uid};  // This will return the full decoded token along with the UID.
    } catch (error) {
        console.log(error);
        return { Success: false, err: error };
    }
}


module.exports = { GetUserDataFromJWT,ExtractData};