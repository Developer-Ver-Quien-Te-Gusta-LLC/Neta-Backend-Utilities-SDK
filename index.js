import { FetchChannelId } from "./utils/AlbyToken.js";
import { SendEvent } from "./utils/Analytics.js";
import { GetUserDataFromJWT } from "./utils/AuthHandler.js";
import { UpdateCognitoUserPFP,DeleteCognitoUser,UpdateDeviceID,FetchDevice,FetchUserPrefs,SetSubscription } from "./utils/AwsCognito.js";
import {encrypt,decrypt} from "./utils/AwsEncryption.js"
import { FetchFromSecrets } from "./utils/AwsSecrets.js";
import { CheckForInvite } from "./utils/CheckIfUserInvited.js";
import { FetchTopFriendsAndPolls,getDataFromNeptune,getDataFromScyalla,FetchCognitoData,InsertDataInScylla,UpdateDataInNeptune,UpdateDataInScyallaDB,UpdateDataInScyllaDBTTL,FetchTopPolls,FetchTopFriends,ExecuteCustomScyllaQuery,AddFriendRelationInNeptune,removeFriendsRelation,listFriends} from "./utils/DataBaseQueriesHandler.js"
//import {GenerateInviteLink} from "../microservices/Invitations/GenerateInviteLink.js";
import {IsUserInvited} from "./utils/InviteHandler.js";
import {GetValueFromKV,isUserInVariant,SetKV,getKV} from "./utils/KV.js";
import { SendNotification } from "./utils/NotificationSystem.js";
import {ExtractUsersFromJson,WeightArraysUsingProbability,InviteFriends,FetchFriendsWithSubsActive,GetRecommendationsOnboarding,GetRecommendationsExploreSection,GetRecommendationsQuestions} from "./utils/Recommendations.js"
import {handleTransactionError,fetchRequestsFromSQS} from "./utils/ServiceBus.js";
import {CreateMixPanelUser,CreateScyllaUser,createNeptuneUser,CreateCognitoUser,} from "./utils/UserCreation.js";
import { handleTransactionCompletion,OnUserCreationFailed} from "./utils/UserCreationTransactionHandling.js";
console.log("Backend SDK initialized");
export {
  FetchChannelId,
  SendEvent,
  GetUserDataFromJWT,
  UpdateCognitoUserPFP,
  DeleteCognitoUser,
  UpdateDeviceID,
  FetchDevice,
  FetchUserPrefs,
  SetSubscription,
  encrypt,
  decrypt,
  FetchFromSecrets,
  CheckForInvite,
  FetchTopFriendsAndPolls,
  getDataFromNeptune,
  getDataFromScyalla,
  FetchCognitoData,
  InsertDataInScylla,
  UpdateDataInNeptune,
  UpdateDataInScyallaDB,
  UpdateDataInScyllaDBTTL,
  FetchTopPolls,
  FetchTopFriends,
  ExecuteCustomScyllaQuery,
  AddFriendRelationInNeptune,
  removeFriendsRelation,
  listFriends,
  IsUserInvited,
  GetValueFromKV,
  isUserInVariant,
  SetKV,
  getKV,
  SendNotification,
  ExtractUsersFromJson,
  WeightArraysUsingProbability,
  InviteFriends,
  FetchFriendsWithSubsActive,
  GetRecommendationsOnboarding,
  GetRecommendationsExploreSection,
  GetRecommendationsQuestions,
  handleTransactionError,
  fetchRequestsFromSQS,
  CreateMixPanelUser,
  CreateScyllaUser,
  createNeptuneUser,
  CreateCognitoUser,
  handleTransactionCompletion,
  OnUserCreationFailed,
};