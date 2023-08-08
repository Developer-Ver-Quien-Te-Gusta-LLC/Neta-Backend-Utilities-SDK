import {cassandra} from "cassandra-driver";
import { FetchFromSecrets } from "./AwsSecrets.js";


async function SetupCassandraClient(client) {
  const contactPoints = await FetchFromSecrets("contactPoints");
  const localDataCenter = await FetchFromSecrets("localDataCenter");
  const keyspace = await FetchFromSecrets("keyspace");
  client = new cassandra.Client({
    contactPoints: [contactPoints],
    localDataCenter: localDataCenter,
    keyspace: keyspace,
  });

  await client.connect();

  return client;
}

export{SetupCassandraClient};
