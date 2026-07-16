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
  updateFeatureFlags: updateFeatureFlagsHandler,
  saveAdminDraft: saveAdminDraftHandler,

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
