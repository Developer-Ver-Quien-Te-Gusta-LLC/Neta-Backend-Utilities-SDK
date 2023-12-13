const { Client } = require('cassandra-driver');
const { FetchFromSecrets } = require("./AwsSecrets.js").FetchFromSecrets;
const {GetClient} = require("./SetupCassandra.js");

let client, considerExpiryDate;

GetClient().then(result=>{client = result;});


/// included for redundancy purposes
async function FetchChannelId(uid) {
    // Fetch AlbyTopicName and creation date from Cassandra
    const query = 'SELECT transaction_id FROM transactions WHERE uid = ? ALLOW FILTERING';
    const result = await client.execute(query, [uid],{prepare:true});

    if (result.rowLength > 0) {
        return result.rows[0].transaction_id;
    } 
    else {
        // If no user found, do nothing
        console.log("no user found");
        return undefined;
    }
}
module.exports = {FetchChannelId};

