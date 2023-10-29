const SendEvent = require('./Analytics.js').SendEvent;
const admin = require('firebase-admin');
const { FetchFromSecrets } = require('./AwsSecrets.js');
const {isInitialized} = require('./KV.js');
const jwt = require ("jsonwebtoken");


//#region JWT Authentication
async function GetUserDataFromJWT(req) {
    const token = req.headers.authorization;
    return ExtractData(token);
}

async function ExtractData(token){
    if (!token) {
       // await SendEvent('authorization_failed', null, { headers: req.headers, body: req.body, qstring: req.query });
        console.log("no token");
        return { Success: false, err: "A token is required for authentication" };
    }

    try {
       // const decodedToken = await admin.auth().verifyIdToken(token);
       const decodedToken = jwt.decode(token); 
       const uid = decodedToken.uid;
        return {uid:uid,phoneNumber:uid};  // This will return the full decoded token along with the UID.
    } catch (error) {
        console.log(error);
        return { Success: false, err: error };
    }
}

module.exports = { GetUserDataFromJWT,ExtractData};