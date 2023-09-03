var AwsSecrets = require("./utils/AwsSecrets.js");
var AlbyToken = require("./utils/AlbyToken.js");
var Analytics = require("./utils/Analytics.js");
var AuthHandler = require("./utils/AuthHandler.js");
//var AwsEncryption = require("./utils/AwsEncryption.js");
var DataBaseQueriesHandler = require("./utils/DataBaseQueriesHandler.js");
//var Invitations = require("../microservices/Invitations/GenerateInviteLink.js");
var KV = require("./utils/KV.js");
var NotificationSystem = require("./utils/NotificationSystem.js");
var Recommendations = require("./utils/Recommendations.js");
var ServiceBus = require("./utils/ServiceBus.js");
var UserCreation = require("./utils/UserCreation.js");
var UserCreationTransactionHandling = require("./utils/UserCreationTransactionHandling.js");
var SetupCassandra = require("./utils/SetupCassandra.js");
var Datadog = require("./utils/Datadog.js")
var SetupGeospatialDB = require("./utils/SetupGeospatialDB.js")
console.log("Backend SDK initialized");

module.exports = {
  FetchChannelId: AlbyToken.FetchChannelId,
  SendEvent: Analytics.SendEvent,
  GetUserDataFromJWT: AuthHandler.GetUserDataFromJWT,
  //encrypt: AwsEncryption.encrypt,
  //decrypt: AwsEncryption.decrypt,
  FetchFromSecrets: AwsSecrets.FetchFromSecrets,
  FetchTopFriendsAndPolls: DataBaseQueriesHandler.FetchTopFriendsAndPolls,
  getDataFromNeptune: DataBaseQueriesHandler.getDataFromNeptune,
  getDataFromScyalla: DataBaseQueriesHandler.getDataFromScyalla,
  InsertDataInScylla: DataBaseQueriesHandler.InsertDataInScylla,
  UpdateDataInNeptune: DataBaseQueriesHandler.UpdateDataInNeptune,
  UpdateDataInScyallaDB: DataBaseQueriesHandler.UpdateDataInScyallaDB,
  UpdateDataInScyllaDBTTL: DataBaseQueriesHandler.UpdateDataInScyllaDBTTL,
  ExecuteCustomScyllaQuery: DataBaseQueriesHandler.ExecuteCustomScyllaQuery,
  AddFriendRelationInNeptune: DataBaseQueriesHandler.AddFriendRelationInNeptune,
  removeFriendsRelation: DataBaseQueriesHandler.removeFriendsRelation,
  SetupGraphDB: require('./utils/SetupGraphDB.js').SetupGraphDB,
  SetKV: KV.SetKV,
  getKV: KV.getKV,
  SetupGeospatialDB: SetupGeospatialDB.SetupGeospatialDB,
  measureRouteComputeLength : Datadog.measureRouteComputeLength,
  logSanitizedRequest : Datadog.logSanitizedRequest,
  SendNotification: NotificationSystem.SendNotification,
  SendNotificationInApp: NotificationSystem.SendNotificationInApp,
  SendNotificationPush: NotificationSystem.SendNotificationPush,
  ExtractUsersFromJson: Recommendations.ExtractUsersFromJson,
  WeightArraysUsingProbability: Recommendations.WeightArraysUsingProbability,
  InviteFriends: Recommendations.InviteFriends,
  FetchFriendsWithSubsActive: Recommendations.FetchFriendsWithSubsActive,
  GetRecommendationsOnboarding: Recommendations.GetRecommendationsOnboarding,
  GetRecommendationsExploreSection: Recommendations.GetRecommendationsExploreSection,
  GetRecommendationsQuestions: Recommendations.GetRecommendationsQuestions,
  handleTransactionError: ServiceBus.handleTransactionError,
  fetchRequestsFromSQS: ServiceBus.fetchRequestsFromSQS,
  CreateMixPanelUser: UserCreation.CreateMixPanelUser,
  CreateScyllaUser: UserCreation.CreateScyllaUser,
  createNeptuneUser: UserCreation.createNeptuneUser,
  CreateFirebaseUser: UserCreation.CreateFirebaseUser,
  handleTransactionCompletion: UserCreationTransactionHandling.handleTransactionCompletion,
  OnUserCreationFailed: UserCreationTransactionHandling.OnUserCreationFailed,
  publishAlbyMessage: NotificationSystem.publishAlbyMessage,
  publishAlbyMessageNaive: NotificationSystem.publishAlbyMessageNaive,
  SetupCassandraClient: SetupCassandra.SetupCassandraClient
};
