import type { CallableRequest } from "firebase-functions/v2/https";
import {
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
  publishAdminDraftHandler,
  purchaseOfferHandler,
  spinLoyaltyWheelHandler,
  verifyStorePurchaseHandler,
} from "../../functions/src/economyCommands";
import { abandonMatchHandler, reconnectMatchHandler, setRoomReadyHandler, startMatchHandler, submitGameActionHandler } from "../../functions/src/matchCommands";
import { usePowerCardHandler } from "../../functions/src/powerCommands";
import { migrateLegacyPlayerHandler, saveAdminDraftHandler, seedLiveOpsHandler, updateFeatureFlagsHandler } from "../../functions/src/adminCommands";
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
} from "../../functions/src/eventAdminCommands";
import {
  adminSearchPlayersHandler,
  adminGetPlayerHandler,
  adminGrantTicketHandler,
  adminResetEventRunHandler,
} from "../../functions/src/playerAdminCommands";
import { getEventLeaderboardHandler } from "../../functions/src/eventLeaderboardCommands";
import {
  listCampaignsHandler,
  createCampaignHandler,
  cancelCampaignHandler,
  setNotificationPrefsHandler,
} from "../../functions/src/campaignCommands";
import { reviveEventRunHandler } from "../../functions/src/eventRunCommands";
import {
  listCosmeticsHandler,
  saveCosmeticHandler,
  getCosmeticCollectionHandler,
  equipCosmeticHandler,
} from "../../functions/src/cosmeticCommands";
import {
  getSeasonsHandler,
  claimSeasonTierHandler,
  listSeasonsHandler,
  saveSeasonHandler,
  getSeasonStatsHandler,
} from "../../functions/src/seasonCommands";
import {
  createEventChallengeHandler,
  respondEventChallengeHandler,
  listMyChallengesHandler,
} from "../../functions/src/challengeCommands";
import {
  seedPowerCardsHandler,
  listAdminPowerCardsHandler,
  setPowerCardStatusHandler,
} from "../../functions/src/powerCardAdminCommands";
import { registerPushTokenHandler } from "../../functions/src/notificationCommands";
import { createRoomHandler, joinRoomHandler, leaveRoomHandler, refreshRoomPlayerHandler, startGameHandler } from "../../functions/src/roomCommands";
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
} from "../../functions/src/socialCommands";

type Handler = (request: CallableRequest<unknown>) => Promise<unknown>;

export const commands: Record<string, Handler> = {
  ensurePlayerProfile: ensurePlayerProfileHandler,
  getPlayerEconomy: getPlayerEconomyHandler,
  claimDailyReward: claimDailyRewardHandler,
  purchaseOffer: purchaseOfferHandler,
  openBoosterBook: openBoosterBookHandler,
  chooseBoosterCard: chooseBoosterCardHandler,
  buyDailyGridSlot: buyDailyGridSlotHandler,
  spinLoyaltyWheel: spinLoyaltyWheelHandler,
  equipPowerCards: equipPowerCardsHandler,
  joinEvent: joinEventHandler,
  leaveEvent: leaveEventHandler,
  createEventChallenge: createEventChallengeHandler,
  respondEventChallenge: respondEventChallengeHandler,
  listMyChallenges: listMyChallengesHandler,
  reviveEventRun: reviveEventRunHandler,
  getEventLeaderboard: getEventLeaderboardHandler,
  createPaymentIntent: createPaymentIntentHandler,
  verifyStorePurchase: verifyStorePurchaseHandler,
  startMatch: startMatchHandler,
  submitGameAction: submitGameActionHandler,
  reconnectMatch: reconnectMatchHandler,
  abandonMatch: abandonMatchHandler,
  usePowerCard: usePowerCardHandler,
  setRoomReady: setRoomReadyHandler,
  publishAdminDraft: publishAdminDraftHandler,
  seedLiveOps: seedLiveOpsHandler,
  migrateLegacyPlayer: migrateLegacyPlayerHandler,
  registerPushToken: registerPushTokenHandler,
  seedPowerCards: seedPowerCardsHandler,
  listAdminPowerCards: listAdminPowerCardsHandler,
  setPowerCardStatus: setPowerCardStatusHandler,
  getSeasons: getSeasonsHandler,
  claimSeasonTier: claimSeasonTierHandler,
  listSeasons: listSeasonsHandler,
  saveSeason: saveSeasonHandler,
  getSeasonStats: getSeasonStatsHandler,
  listCosmetics: listCosmeticsHandler,
  saveCosmetic: saveCosmeticHandler,
  getCosmeticCollection: getCosmeticCollectionHandler,
  equipCosmetic: equipCosmeticHandler,
  listCampaigns: listCampaignsHandler,
  createCampaign: createCampaignHandler,
  cancelCampaign: cancelCampaignHandler,
  setNotificationPrefs: setNotificationPrefsHandler,
  updateFeatureFlags: updateFeatureFlagsHandler,
  saveAdminDraft: saveAdminDraftHandler,
  listAdminEvents: listAdminEventsHandler,
  getAdminEvent: getAdminEventHandler,
  saveEventDraft: saveEventDraftHandler,
  publishEventDraft: publishEventDraftHandler,
  cancelScheduledEvent: cancelScheduledEventHandler,
  duplicateEvent: duplicateEventHandler,
  archiveEvent: archiveEventHandler,
  discardEventDraft: discardEventDraftHandler,
  getAdminEventStats: getAdminEventStatsHandler,
  listAdminUploads: listAdminUploadsHandler,
  adminSearchPlayers: adminSearchPlayersHandler,
  adminGetPlayer: adminGetPlayerHandler,
  adminGrantTicket: adminGrantTicketHandler,
  adminResetEventRun: adminResetEventRunHandler,

  createRoom: createRoomHandler,
  joinRoom: joinRoomHandler,
  leaveRoom: leaveRoomHandler,
  refreshRoomPlayer: refreshRoomPlayerHandler,
  startGame: startGameHandler,

  saveProfile: saveProfileHandler,
  setPresence: setPresenceHandler,
  sendFriendRequest: sendFriendRequestHandler,
  acceptFriendRequest: acceptFriendRequestHandler,
  rejectFriendRequest: rejectFriendRequestHandler,
  removeFriend: removeFriendHandler,
  markNotificationRead: markNotificationReadHandler,
  sendRoomInvite: sendRoomInviteHandler,
  sendMessage: sendMessageHandler,
  markConversationRead: markConversationReadHandler,
  sendReaction: sendReactionHandler,
};
