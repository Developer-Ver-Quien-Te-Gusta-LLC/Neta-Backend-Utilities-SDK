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
        await ExtractData("eyJhbGciOiJSUzI1NiIsImtpZCI6IjE5MGFkMTE4YTk0MGFkYzlmMmY1Mzc2YjM1MjkyZmVkZThjMmQwZWUiLCJ0eXAiOiJKV1QifQ.eyJuYW1lIjoidXNlcjAiLCJpc3MiOiJodHRwczovL3NlY3VyZXRva2VuLmdvb2dsZS5jb20vbmV0YS0yOWU0ZSIsImF1ZCI6Im5ldGEtMjllNGUiLCJhdXRoX3RpbWUiOjE2OTQ1MDExMDgsInVzZXJfaWQiOiI0N2U4ODM5MS0zMTgyLTQ5ZjAtYWJjNi02NjAxZWI4MTk4MDMiLCJzdWIiOiI0N2U4ODM5MS0zMTgyLTQ5ZjAtYWJjNi02NjAxZWI4MTk4MDMiLCJpYXQiOjE2OTQ1MDExMTAsImV4cCI6MTY5NDUwNDcxMCwiZmlyZWJhc2UiOnsiaWRlbnRpdGllcyI6e30sInNpZ25faW5fcHJvdmlkZXIiOiJjdXN0b20ifX0.HEtdKYlckY1e6x3IHDd8XLaFVh7UEVaENC89RKUsiwq0A_mts_RcJZKD9aMWFVSmuRAQAbsxBddUK3i4jkKrLYI_1Vy1e5_O3wC08b5ISvwI4jdqSadko_zT1wCySj5NIKFl50Uno1YaXDsSXV2PpraTsvEoBQNhRsuN5u4IwwnfuD_0gsjfu-gefVx4xHanazTgRW59wXQj90p-gZ2vpWuNkFMPjiG8rm8SW_x25UY3FZSJJB2Ax7AzVXxMzHrJWKH6-GvfOHBbqNIlitKgQwzYdZ48qV5T0tWSu-q3mCH7NkGK0e9tZpogtARoHADPeTxG24G8rsMwW0b8iQsnaQ")


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
        console.log(decodedToken);
        const uid = decodedToken.uid;
        return {uid:decodedToken.uid,phoneNumber:decodedToken.uid};  // This will return the full decoded token along with the UID.
    } catch (error) {
        console.log(error);
        return { success: false, err: error };
    }
}


module.exports = { GetUserDataFromJWT,ExtractData};