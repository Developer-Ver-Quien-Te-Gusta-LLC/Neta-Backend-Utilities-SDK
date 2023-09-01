const SendEvent = require('./Analytics.js').SendEvent;
const admin = require('firebase-admin');
const getKV = require('./KV.js').getKV;

(async () => {
    if(admin.apps.length ===0){
    admin.initializeApp({
        credential: await getKV("FCMAccountCredentials")
    });
}
})();

//#region JWT Authentication
async function GetUserDataFromJWT(req) {
    const token = req.headers.authorization;

    if (!token) {
        await SendEvent('authorization_failed', null, { headers: req.headers, body: req.body, qstring: req.query });
        return { success: false, err: "A token is required for authentication" };
    }

    try {
        const decodedToken = await admin.auth().verifyIdToken(token);
        const uid = decodedToken.uid;
        return { ...decodedToken, uid, phoneNumber : uid, pn : uid, phonenumber : uid };  // This will return the full decoded token along with the UID.
    } catch (error) {
        return { success: false, err: error };
    }
}


module.exports = { GetUserDataFromJWT };