import { setGlobalOptions } from "firebase-functions/v2";
import { onCall } from "firebase-functions/v2/https";
import { saveGameplayConfigHandler } from "./gameplayCommands";
import { saveAudioConfigHandler } from "./audioCommands";
import { deletePowerPackHandler, savePowerPackHandler } from "./powerPackCommands";

setGlobalOptions({ region: "africa-south1", maxInstances: 20, memory: "256MiB", timeoutSeconds: 60 });

import {
  buyBoosterBookHandler,
  buyDailyGridSlotHandler,
  chooseBoosterCardHandler,
  claimDailyRewardHandler,
  createPaymentIntentHandler,
  equipPowerCardsHandler,
  ensurePlayerProfileHandler,
  getPlayerEconomyHandler,
  joinEventHandler,
  leaveEventHandler,
  openBoosterBookHandler,
  openPackHandler,
  publishAdminDraftHandler,
  purchaseOfferHandler,
  spinLoyaltyWheelHandler,
  useEnergyPassHandler,
  verifyStorePurchaseHandler,
} from "./economyCommands";
import { abandonMatchHandler, advanceMatchRoundHandler, reconnectMatchHandler, setRoomReadyHandler, startMatchHandler, submitGameActionHandler } from "./matchCommands";
import {
  cashOutHiLoHandler,
  finishSkillGameHandler,
  guessHiLoHandler,
  playMiniGameHandler,
  startHiLoHandler,
  startSkillGameHandler,
} from "./minigameCommands";
import { usePowerCardHandler } from "./powerCommands";
import { migrateLegacyPlayerHandler, saveAdminDraftHandler, seedLiveOpsHandler, updateFeatureFlagsHandler } from "./adminCommands";
import {
  listAdminEventsHandler,
  getAdminEventHandler,
  saveEventDraftHandler,
  publishEventDraftHandler,
  cancelScheduledEventHandler,
  duplicateEventHandler,
  archiveEventHandler,
  discardEventDraftHandler,
  getAdminEventStatsHandler,
  listAdminUploadsHandler,
} from "./eventAdminCommands";
import {
  adminSearchPlayersHandler,
  adminGetPlayerHandler,
  adminGrantTicketHandler,
  adminGrantCosmeticHandler,
  adminResetEventRunHandler,
} from "./playerAdminCommands";
import { getEventLeaderboardHandler } from "./eventLeaderboardCommands";
import {
  listCampaignsHandler,
  createCampaignHandler,
  cancelCampaignHandler,
  setNotificationPrefsHandler,
} from "./campaignCommands";
import { reviveEventRunHandler } from "./eventRunCommands";
import {
  listCosmeticsHandler,
  saveCosmeticHandler,
  saveCosmeticDefaultsHandler,
  saveAssetPackHandler,
  getCosmeticCollectionHandler,
  equipCosmeticHandler,
} from "./cosmeticCommands";
import {
  getSeasonsHandler,
  claimSeasonTierHandler,
  listSeasonsHandler,
  saveSeasonHandler,
  getSeasonStatsHandler,
} from "./seasonCommands";
import {
  createEventChallengeHandler,
  respondEventChallengeHandler,
  listMyChallengesHandler,
} from "./challengeCommands";
import {
  seedPowerCardsHandler,
  listAdminPowerCardsHandler,
  setPowerCardStatusHandler,
  getAdminPowerCardHandler,
  savePowerCardDraftHandler,
  publishPowerCardHandler,
  duplicatePowerCardHandler,
  discardPowerCardDraftHandler,
} from "./powerCardAdminCommands";
import {
  listAdminAnimMotifsHandler,
  saveAnimMotifDraftHandler,
  publishAnimMotifHandler,
  discardAnimMotifDraftHandler,
  setAnimMotifArchivedHandler,
  setGameMomentsHandler,
} from "./animMotifAdminCommands";
import {
  listAdminAnimsV2Handler,
  saveAnimV2DraftHandler,
  publishAnimV2Handler,
  discardAnimV2DraftHandler,
  setAnimV2ArchivedHandler,
} from "./animV2AdminCommands";
import { registerPushTokenHandler } from "./notificationCommands";
import { createRoomHandler, joinRoomHandler, leaveRoomHandler, refreshRoomPlayerHandler, startGameHandler } from "./roomCommands";
import {
  acceptFriendRequestHandler,
  markConversationReadHandler,
  markNotificationReadHandler,
  rejectFriendRequestHandler,
  removeFriendHandler,
  saveProfileHandler,
  sendFriendRequestHandler,
  sendMessageHandler,
  sendReactionHandler,
  sendRoomInviteHandler,
  setPresenceHandler,
} from "./socialCommands";
export { refundCancelledMatch, refundExpiredEventQueues } from "./triggers";
export { notifyFullEnergy } from "./notificationCommands";
export { promoteScheduledEvents } from "./eventAdminCommands";
export { settleEventRankings } from "./eventLeaderboardCommands";
export { sendDueCampaigns } from "./campaignCommands";
export { settleEventChallenges } from "./challengeCommands";

const callable = { enforceAppCheck: process.env.FUNCTIONS_EMULATOR !== "true", consumeAppCheckToken: true } as const;

export const ensurePlayerProfile = onCall(callable, ensurePlayerProfileHandler);
export const getPlayerEconomy = onCall(callable, getPlayerEconomyHandler);
export const claimDailyReward = onCall(callable, claimDailyRewardHandler);
export const purchaseOffer = onCall(callable, purchaseOfferHandler);
export const buyBoosterBook = onCall(callable, buyBoosterBookHandler);
export const openBoosterBook = onCall(callable, openBoosterBookHandler);
export const openPack = onCall(callable, openPackHandler);
export const useEnergyPass = onCall(callable, useEnergyPassHandler);
export const chooseBoosterCard = onCall(callable, chooseBoosterCardHandler);
export const buyDailyGridSlot = onCall(callable, buyDailyGridSlotHandler);
export const spinLoyaltyWheel = onCall(callable, spinLoyaltyWheelHandler);
export const playMiniGame = onCall(callable, playMiniGameHandler);
export const startHiLo = onCall(callable, startHiLoHandler);
export const guessHiLo = onCall(callable, guessHiLoHandler);
export const cashOutHiLo = onCall(callable, cashOutHiLoHandler);
export const startSkillGame = onCall(callable, startSkillGameHandler);
export const finishSkillGame = onCall(callable, finishSkillGameHandler);
export const equipPowerCards = onCall(callable, equipPowerCardsHandler);
export const saveGameplayConfig = onCall(callable, saveGameplayConfigHandler);
export const saveAudioConfig = onCall(callable, saveAudioConfigHandler);
export const advanceMatchRound = onCall(callable, advanceMatchRoundHandler);
export const joinEvent = onCall(callable, joinEventHandler);
export const leaveEvent = onCall(callable, leaveEventHandler);
export const createEventChallenge = onCall(callable, createEventChallengeHandler);
export const respondEventChallenge = onCall(callable, respondEventChallengeHandler);
export const listMyChallenges = onCall(callable, listMyChallengesHandler);
export const reviveEventRun = onCall(callable, reviveEventRunHandler);
export const getEventLeaderboard = onCall(callable, getEventLeaderboardHandler);
export const createPaymentIntent = onCall(callable, createPaymentIntentHandler);
export const verifyStorePurchase = onCall(callable, verifyStorePurchaseHandler);
export const startMatch = onCall(callable, startMatchHandler);
export const submitGameAction = onCall(callable, submitGameActionHandler);
export const reconnectMatch = onCall(callable, reconnectMatchHandler);
export const abandonMatch = onCall(callable, abandonMatchHandler);
export const setRoomReady = onCall(callable, setRoomReadyHandler);
export const usePowerCard = onCall(callable, usePowerCardHandler);

export const publishAdminDraft = onCall(callable, publishAdminDraftHandler);
export const seedLiveOps = onCall(callable, seedLiveOpsHandler);
export const migrateLegacyPlayer = onCall(callable, migrateLegacyPlayerHandler);
export const registerPushToken = onCall(callable, registerPushTokenHandler);
export const seedPowerCards = onCall(callable, seedPowerCardsHandler);
export const listAdminPowerCards = onCall(callable, listAdminPowerCardsHandler);
export const setPowerCardStatus = onCall(callable, setPowerCardStatusHandler);
export const getAdminPowerCard = onCall(callable, getAdminPowerCardHandler);
export const savePowerCardDraft = onCall(callable, savePowerCardDraftHandler);
export const publishPowerCard = onCall(callable, publishPowerCardHandler);
export const duplicatePowerCard = onCall(callable, duplicatePowerCardHandler);
export const discardPowerCardDraft = onCall(callable, discardPowerCardDraftHandler);
export const listAdminAnimMotifs = onCall(callable, listAdminAnimMotifsHandler);
export const saveAnimMotifDraft = onCall(callable, saveAnimMotifDraftHandler);
export const publishAnimMotif = onCall(callable, publishAnimMotifHandler);
export const discardAnimMotifDraft = onCall(callable, discardAnimMotifDraftHandler);
export const setAnimMotifArchived = onCall(callable, setAnimMotifArchivedHandler);
export const setGameMoments = onCall(callable, setGameMomentsHandler);
export const listAdminAnimsV2 = onCall(callable, listAdminAnimsV2Handler);
export const saveAnimV2Draft = onCall(callable, saveAnimV2DraftHandler);
export const publishAnimV2 = onCall(callable, publishAnimV2Handler);
export const discardAnimV2Draft = onCall(callable, discardAnimV2DraftHandler);
export const setAnimV2Archived = onCall(callable, setAnimV2ArchivedHandler);
export const getSeasons = onCall(callable, getSeasonsHandler);
export const claimSeasonTier = onCall(callable, claimSeasonTierHandler);
export const listSeasons = onCall(callable, listSeasonsHandler);
export const saveSeason = onCall(callable, saveSeasonHandler);
export const getSeasonStats = onCall(callable, getSeasonStatsHandler);
export const listCosmetics = onCall(callable, listCosmeticsHandler);
export const saveCosmetic = onCall(callable, saveCosmeticHandler);
export const saveCosmeticDefaults = onCall(callable, saveCosmeticDefaultsHandler);
export const saveAssetPack = onCall(callable, saveAssetPackHandler);
export const savePowerPack = onCall(callable, savePowerPackHandler);
export const deletePowerPack = onCall(callable, deletePowerPackHandler);
export const getCosmeticCollection = onCall(callable, getCosmeticCollectionHandler);
export const equipCosmetic = onCall(callable, equipCosmeticHandler);
export const listCampaigns = onCall(callable, listCampaignsHandler);
export const createCampaign = onCall(callable, createCampaignHandler);
export const cancelCampaign = onCall(callable, cancelCampaignHandler);
export const setNotificationPrefs = onCall(callable, setNotificationPrefsHandler);
export const updateFeatureFlags = onCall(callable, updateFeatureFlagsHandler);
export const saveAdminDraft = onCall(callable, saveAdminDraftHandler);
export const listAdminEvents = onCall(callable, listAdminEventsHandler);
export const getAdminEvent = onCall(callable, getAdminEventHandler);
export const saveEventDraft = onCall(callable, saveEventDraftHandler);
export const publishEventDraft = onCall(callable, publishEventDraftHandler);
export const cancelScheduledEvent = onCall(callable, cancelScheduledEventHandler);
export const duplicateEvent = onCall(callable, duplicateEventHandler);
export const archiveEvent = onCall(callable, archiveEventHandler);
export const discardEventDraft = onCall(callable, discardEventDraftHandler);
export const getAdminEventStats = onCall(callable, getAdminEventStatsHandler);
export const listAdminUploads = onCall(callable, listAdminUploadsHandler);
export const adminSearchPlayers = onCall(callable, adminSearchPlayersHandler);
export const adminGetPlayer = onCall(callable, adminGetPlayerHandler);
export const adminGrantTicket = onCall(callable, adminGrantTicketHandler);
export const adminGrantCosmetic = onCall(callable, adminGrantCosmeticHandler);
export const adminResetEventRun = onCall(callable, adminResetEventRunHandler);

export const createRoom = onCall(callable, createRoomHandler);
export const joinRoom = onCall(callable, joinRoomHandler);
export const leaveRoom = onCall(callable, leaveRoomHandler);
export const refreshRoomPlayer = onCall(callable, refreshRoomPlayerHandler);
export const startGame = onCall(callable, startGameHandler);

export const saveProfile = onCall(callable, saveProfileHandler);
export const setPresence = onCall(callable, setPresenceHandler);
export const sendFriendRequest = onCall(callable, sendFriendRequestHandler);
export const acceptFriendRequest = onCall(callable, acceptFriendRequestHandler);
export const rejectFriendRequest = onCall(callable, rejectFriendRequestHandler);
export const removeFriend = onCall(callable, removeFriendHandler);
export const markNotificationRead = onCall(callable, markNotificationReadHandler);
export const sendRoomInvite = onCall(callable, sendRoomInviteHandler);
export const sendMessage = onCall(callable, sendMessageHandler);
export const markConversationRead = onCall(callable, markConversationReadHandler);
export const sendReaction = onCall(callable, sendReactionHandler);
