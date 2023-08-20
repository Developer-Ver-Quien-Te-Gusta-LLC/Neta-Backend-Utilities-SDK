var AwsSecrets = require("./utils/AwsSecrets.js");
var AlbyToken = require("./utils/AlbyToken.js");
var Analytics = require("./utils/Analytics.js");
var AuthHandler = require("./utils/AuthHandler.js");
var AwsCognito = require("./utils/AwsCognito.js");
var AwsEncryption = require("./utils/AwsEncryption.js");
var CheckIfUserInvited = require("./utils/CheckIfUserInvited.js");
var DataBaseQueriesHandler = require("./utils/DataBaseQueriesHandler.js");
//var Invitations = require("../microservices/Invitations/GenerateInviteLink.js");
var InviteHandler = require("./utils/InviteHandler.js");
var KV = require("./utils/KV.js");
var NotificationSystem = require("./utils/NotificationSystem.js");
var Recommendations = require("./utils/Recommendations.js");
var ServiceBus = require("./utils/ServiceBus.js");
var UserCreation = require("./utils/UserCreation.js");
var UserCreationTransactionHandling = require("./utils/UserCreationTransactionHandling.js");
var SetupCassandra = require("./utils/SetupCassandra.js");
console.log("Backend SDK initialized");

module.exports = {
  FetchChannelId: AlbyToken.FetchChannelId,
  FetchChannelIdPre : AlbyToken.FetchChannelIdPre,
  FetchChannelIdPost : AlbyToken.FetchChannelIdPost,
  SendEvent: Analytics.SendEvent,
  GetUserDataFromJWT: AuthHandler.GetUserDataFromJWT,
  DeleteCognitoUser: AwsCognito.DeleteCognitoUser,
  UpdateDeviceID: AwsCognito.UpdateDeviceID,
  FetchDevice: AwsCognito.FetchDevice,
  FetchUserPrefs: AwsCognito.FetchUserPrefs,
  SetSubscription: AwsCognito.SetSubscription,
  encrypt: AwsEncryption.encrypt,
  decrypt: AwsEncryption.decrypt,
  FetchFromSecrets: AwsSecrets.FetchFromSecrets,
  CheckForInvite: CheckIfUserInvited.CheckForInvite,
  FetchTopFriendsAndPolls: DataBaseQueriesHandler.FetchTopFriendsAndPolls,
  getDataFromNeptune: DataBaseQueriesHandler.getDataFromNeptune,
  getDataFromScyalla: DataBaseQueriesHandler.getDataFromScyalla,
  FetchCognitoData: DataBaseQueriesHandler.FetchCognitoData,
  InsertDataInScylla: DataBaseQueriesHandler.InsertDataInScylla,
  UpdateDataInNeptune: DataBaseQueriesHandler.UpdateDataInNeptune,
  UpdateDataInScyallaDB: DataBaseQueriesHandler.UpdateDataInScyallaDB,
  UpdateDataInScyllaDBTTL: DataBaseQueriesHandler.UpdateDataInScyllaDBTTL,
  FetchTopPolls: DataBaseQueriesHandler.FetchTopPolls,
  FetchTopFriends: DataBaseQueriesHandler.FetchTopFriends,
  ExecuteCustomScyllaQuery: DataBaseQueriesHandler.ExecuteCustomScyllaQuery,
  AddFriendRelationInNeptune: DataBaseQueriesHandler.AddFriendRelationInNeptune,
  removeFriendsRelation: DataBaseQueriesHandler.removeFriendsRelation,
  listFriends: DataBaseQueriesHandler.listFriends,
  IsUserInvited: InviteHandler.IsUserInvited,
  SetKV: KV.SetKV,
  getKV: KV.getKV,
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
  CreateCognitoUser: UserCreation.CreateCognitoUser,
  handleTransactionCompletion: UserCreationTransactionHandling.handleTransactionCompletion,
  OnUserCreationFailed: UserCreationTransactionHandling.OnUserCreationFailed,
  publishAlbyMessage: NotificationSystem.publishAlbyMessage,
  SetupCassandraClient: SetupCassandra.SetupCassandraClient
};
