const admin = require('firebase-admin');
const FetchFromSecrets = require("./AwsSecrets.js").FetchFromSecrets;

let isInitialized = false;

//#region Setup
async function initializeFirebase() {
    try {
        // Ensure Firebase Admin SDK is only initialized once
        if (isInitialized) {
            console.warn("Firebase Admin SDK is already initialized.");
            return;
        }

        const credentials = await FetchFromSecrets("FCMAccountCredentials");
        if (!credentials) {
            console.error("Unable to fetch FCM Account Credentials.");
            return;
        }

        admin.initializeApp({
            credential: admin.credential.cert(credentials),
        });

        console.log("Firebase Admin SDK Initialized.");
        isInitialized = true;

    } catch (error) {
        console.error("Error during Firebase Admin SDK initialization:", error);
    }
}
initializeFirebase();
//#endregion

async function fetchRemoteConfig(key) {
    try {
        // Ensure that Firebase Admin SDK is initialized
        if (!isInitialized) {
            throw new Error("Firebase Admin SDK is not initialized.");
        }

        // Fetch the remote config template
        const template = await admin.remoteConfig().getTemplate();
        const parameter = template.parameters[key];

        if (parameter && parameter.defaultValue) {
            console.log(`Value for key '${key}' is: ${parameter.defaultValue.value}`);
            return parameter.defaultValue.value;
        } else {
            console.warn(`Key '${key}' is not found in the remote config.`);
            return null;
        }
    } catch (err) {
        console.error('Error fetching remote config:', err);
        return null;
    }
}

module.exports = { getKV: fetchRemoteConfig };
