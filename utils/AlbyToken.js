const { Client } = require('cassandra-driver');
const { FetchFromSecrets } = require("./AwsSecrets.js").FetchFromSecrets;
const { getKV } = require("./KV.js").getKV;

let client;

async function initializeClient() {
    if (client == undefined) {
    const contactPoints = await FetchFromSecrets("contactPoints");
    const localDataCenter = await FetchFromSecrets("localDataCenter");
    const keyspace = await FetchFromSecrets("keyspace");

    return client = new Client({
        contactPoints: [contactPoints],
        localDataCenter: localDataCenter,
        keyspace: keyspace,
    });
}
}

/// included for redundancy purposes
async function FetchChannelId(phoneNumber, fetchEncryptionKey = false) {
    const client = await initializeClient();
    const AlbyChannelIdExpir = await getKV("AlbyChannelIdExpir");

    // Fetch AlbyTopicName and creation date from Cassandra
    const query = 'SELECT AlbyTopicName, createdAt, AlbyEncryptionKey FROM users WHERE phoneNumber = ?';
    const result = await client.execute(query, [phoneNumber]);
    let now = Date.now();

    if (result.rowLength > 0) {
        let user = result.rows[0];

        // If AlbyTopicName has expired or doesn't exist
        if (!user.AlbyTopicName || !user.createdAt || (now - user.createdAt > AlbyChannelIdExpir * 1000)) { 
            user.AlbyTopicName = Math.random().toString(36).substring(2, 14); // generate random 12 character string
            user.createdAt = now;
            user.AlbyEncryptionKey = Math.random().toString(36).substring(2, 14); // generate random 12 character string
        } 

        // Update the user properties and return the necessary details
        const updateQuery = 'UPDATE users SET AlbyTopicName = ?, createdAt = ?, AlbyEncryptionKey = ? WHERE phoneNumber = ?';
        await client.execute(updateQuery, [user.AlbyTopicName, user.createdAt, user.AlbyEncryptionKey, phoneNumber]);
    } else {
        // If no user found, create a new user
        const newUserQuery = 'INSERT INTO users (phoneNumber, AlbyTopicName, createdAt, AlbyEncryptionKey) VALUES (?, ?, ?, ?)';
        let AlbyTopicName = Math.random().toString(36).substring(2, 14);
        let AlbyEncryptionKey = Math.random().toString(36).substring(2, 14);
        await client.execute(newUserQuery, [phoneNumber, AlbyTopicName, now, AlbyEncryptionKey]);

        if(fetchEncryptionKey) return {topicId: AlbyTopicName, encryptionKey: AlbyEncryptionKey}
        
        return AlbyTopicName;
    }

    if (fetchEncryptionKey) return {encryptionKey : user.AlbyEncryptionKey, topicId : user.AlbyTopicName}
    
    return user.AlbyTopicName;
}

async function FetchChannelIdPre(phoneNumber, fetchEncryptionKey = false) {
    const client = await initializeClient();
    const AlbyChannelIdExpir = await getKV("AlbyChannelIdExpir");

    // Fetch AlbyTopicName and creation date from Cassandra
    const query = 'SELECT AlbyTopicName, createdAt, AlbyEncryptionKey FROM users WHERE phoneNumber = ?';
    const result = await client.execute(query, [phoneNumber]);
    return result;
}

async function FetchChannelIdPost(result, phoneNumber, fetchEncryptionKey = false) {
    let now = Date.now();

    if (result.rowLength > 0) {
        let user = result.rows[0];

        // If AlbyTopicName has expired or doesn't exist
        if (!user.AlbyTopicName || !user.createdAt || (now - user.createdAt > AlbyChannelIdExpir * 1000)) { 
            user.AlbyTopicName = Math.random().toString(36).substring(2, 14); // generate random 12 character string
            user.createdAt = now;
            user.AlbyEncryptionKey = Math.random().toString(36).substring(2, 14); // generate random 12 character string
        } 

        // Update the user properties and return the necessary details
        const updateQuery = 'UPDATE users SET AlbyTopicName = ?, createdAt = ?, AlbyEncryptionKey = ? WHERE phoneNumber = ?';
        await client.execute(updateQuery, [user.AlbyTopicName, user.createdAt, user.AlbyEncryptionKey, phoneNumber]);
    } else {
        // If no user found, log erorr
        throw new Error("FetchChannelIdPost: incorrect result")
    }

    if (fetchEncryptionKey) return {encryptionKey : user.AlbyEncryptionKey, topicId : user.AlbyTopicName}
    
    return user.AlbyTopicName;
}

module.exports = {FetchChannelIdPre, FetchChannelIdPost, FetchChannelId};
