//#region vars and refs
const gremlin = require('gremlin');
const traversal = gremlin.process.AnonymousTraversalSource.traversal;
const DriverRemoteConnection = gremlin.driver.DriverRemoteConnection;
const Graph = gremlin.structure.Graph;

  let stored;
  function SetupGraphDB(f) {
    if (stored != undefined) return stored
    const graph = new Graph();
const g = graph
  .traversal()
  .withRemote(new DriverRemoteConnection("wss://hostname:port/gremlin", "{}"));
  stored = g
  f = g
  return f
  }

  export {SetupGraphDB}