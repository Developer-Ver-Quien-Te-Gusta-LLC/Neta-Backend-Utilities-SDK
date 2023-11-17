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
//var Datadog = require("./utils/Datadog.js")
var GeospatialDB = require("./utils/GeospatialDB.js");
var Neo4j = require("./utils/Setupneo4j.js")
console.log("Backend SDK initialized");

module.exports = {
  FetchChannelId: AlbyToken.FetchChannelId,
  SendEvent: Analytics.SendEvent,
  GetUserDataFromJWT: AuthHandler.GetUserDataFromJWT,
  SetupGeospatialDB: GeospatialDB.SetupGeospatialDB,
  fetchSchools: GeospatialDB.fetchSchools,
  pushSchools: GeospatialDB.pushSchools,
  clearSchools: GeospatialDB.clearSchools,
  //encrypt: AwsEncryption.encrypt,
  //decrypt: AwsEncryption.decrypt,
  FetchFromSecrets: AwsSecrets.FetchFromSecrets,
  FetchTopFriendsAndPolls: DataBaseQueriesHandler.FetchTopFriendsAndPolls,
  getDataFromScyalla: DataBaseQueriesHandler.getDataFromScyalla,
  InsertDataInScylla: DataBaseQueriesHandler.InsertDataInScylla,
  UpdateDataInNeptune: DataBaseQueriesHandler.UpdateDataInNeptune,
  UpdateDataInScyallaDB: DataBaseQueriesHandler.UpdateDataInScyallaDB,
  UpdateDataInScyllaDBTTL: DataBaseQueriesHandler.UpdateDataInScyllaDBTTL,
  ExecuteCustomScyllaQuery: DataBaseQueriesHandler.ExecuteCustomScyllaQuery,
  AddFriendRelationInNeptune: DataBaseQueriesHandler.AddFriendRelationInNeptune,
  removeFriendsRelation: DataBaseQueriesHandler.removeFriendsRelation,
  SetKV: KV.SetKV,
  getKV: KV.getKV,
  formatPhoneNumber : require('./utils/PhoneNumberFormatter.js').formatPhoneNumber,
  //measureRouteComputeLength : Datadog.measureRouteComputeLength,
  //logSanitizedRequest : Datadog.logSanitizedRequest,
  SendNotification: NotificationSystem.SendNotification,
  publishFCMMessage : NotificationSystem.publishFCMMessage,
  SendNotificationInApp: NotificationSystem.SendNotificationInApp,
  SendNotificationPush: NotificationSystem.SendNotificationPush,
  ExtractUsersFromJson: Recommendations.ExtractUsersFromJson,
  WeightArraysUsingProbability: Recommendations.WeightArraysUsingProbability,
  InviteFriends: Recommendations.InviteFriends,
  FetchFriendsWithSubsActive: Recommendations.FetchFriendsWithSubsActive,
  GetRecommendationsOnboarding: Recommendations.GetRecommendationsOnboarding,
  GetRecommendationsExploreSection: Recommendations.GetRecommendationsExploreSection,
  GetRecommendationsQuestions: Recommendations.GetRecommendationsQuestions,
  fetchRequestsFromSQS: ServiceBus.fetchRequestsFromSQS,
  getNumberOfMessagesInSQS: ServiceBus.getNumberOfMessagesInSQS,
  CreateMixPanelUser: UserCreation.CreateMixPanelUser,
  StartUserCreation : UserCreation.StartUserCreation,
  clearSchools : GeospatialDB.clearSchools,
  uploadUserContacts: UserCreation.uploadUserContacts,
  handleTransactionCompletion: UserCreationTransactionHandling.handleTransactionCompletion,
  onTransactionStart : UserCreationTransactionHandling.onTransactionStart,
  checkAllTransactionsCompleted: UserCreationTransactionHandling.checkAllTransactionsCompleted,
  isTransactionInProgress: UserCreationTransactionHandling.isTransactionInProgress,
  OnUserCreationFailed: UserCreationTransactionHandling.OnUserCreationFailed,
  publishAlbyMessage: NotificationSystem.publishAlbyMessage,
  publishAlbyMessageNaive: NotificationSystem.publishAlbyMessageNaive,
  SetupCassandraClient: SetupCassandra.SetupCassandraClient,
  SetupNeo4jClient: Neo4j.SetupNeo4jClient,
  PublishDelayedNotif:NotificationSystem.PublishDelayedNotif,
};
