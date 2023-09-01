const { Client } = require('cassandra-driver');
const { FetchFromSecrets } = require("./AwsSecrets.js").FetchFromSecrets;
const { getKV } = require("./KV.js").getKV;

let client, considerExpiryDate;

async function initializeClient() {
    if (client == undefined) {
    const contactPoints = await FetchFromSecrets("contactPoints");
    const localDataCenter = await FetchFromSecrets("localDataCenter");
    const keyspace = await FetchFromSecrets("keyspace");
    considerExpiryDate = await FetchChannelId("ConsiderExpiryDate") == "false" ? false : true

    return client = new Client({
        contactPoints: [contactPoints],
        localDataCenter: localDataCenter,
        keyspace: keyspace,
    });
}
}


/// included for redundancy purposes
async function FetchChannelId(uid) {
    const client = await initializeClient();
    const AlbyChannelIdExpir = await FetchFromSecrets("AlbyChannelIdExpir");

    // Fetch AlbyTopicName and creation date from Cassandra
    const query = 'SELECT AlbyTopicName, FROM users WHERE uid = ?';
    const result = await client.execute(query, [uid]);
    let now = Date.now();

    if (result.rowLength > 0) {
        let user = result.rows[0];

        // If AlbyTopicName has expired or doesn't exist
        if (!user.AlbyTopicName || !user.createdAt || ((now - user.createdAt > AlbyChannelIdExpir * 1000) && considerExpiryDate)) { 
            user.AlbyTopicName = Math.random().toString(36).substring(2, 14); // generate random 12 character string
            user.createdAt = now;

            // Update the user properties and return the necessary details
            const updateQuery = 'UPDATE users SET AlbyTopicName = ? WHERE uid = ?';
            await client.execute(updateQuery, [user.AlbyTopicName, uid]);
        }
    } else {
        // If no user found, do nothing
    }
    
    return user.AlbyTopicName;
}
module.exports = {FetchChannelId};

