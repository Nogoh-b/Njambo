import { setGlobalOptions } from "firebase-functions/v2";
import { onCall } from "firebase-functions/v2/https";

setGlobalOptions({ region: "africa-south1", maxInstances: 20, memory: "256MiB", timeoutSeconds: 60 });

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
} from "./economyCommands";
import { abandonMatchHandler, reconnectMatchHandler, setRoomReadyHandler, startMatchHandler, submitGameActionHandler } from "./matchCommands";
import { migrateLegacyPlayerHandler, saveAdminDraftHandler, seedLiveOpsHandler, updateFeatureFlagsHandler } from "./adminCommands";
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

const callable = { enforceAppCheck: process.env.FUNCTIONS_EMULATOR !== "true", consumeAppCheckToken: true } as const;

export const ensurePlayerProfile = onCall(callable, ensurePlayerProfileHandler);
export const getPlayerEconomy = onCall(callable, getPlayerEconomyHandler);
export const claimDailyReward = onCall(callable, claimDailyRewardHandler);
export const purchaseOffer = onCall(callable, purchaseOfferHandler);
export const openBoosterBook = onCall(callable, openBoosterBookHandler);
export const chooseBoosterCard = onCall(callable, chooseBoosterCardHandler);
export const buyDailyGridSlot = onCall(callable, buyDailyGridSlotHandler);
export const spinLoyaltyWheel = onCall(callable, spinLoyaltyWheelHandler);
export const equipPowerCards = onCall(callable, equipPowerCardsHandler);
export const joinEvent = onCall(callable, joinEventHandler);
export const leaveEvent = onCall(callable, leaveEventHandler);
export const createPaymentIntent = onCall(callable, createPaymentIntentHandler);
export const verifyStorePurchase = onCall(callable, verifyStorePurchaseHandler);
export const startMatch = onCall(callable, startMatchHandler);
export const submitGameAction = onCall(callable, submitGameActionHandler);
export const reconnectMatch = onCall(callable, reconnectMatchHandler);
export const abandonMatch = onCall(callable, abandonMatchHandler);
export const setRoomReady = onCall(callable, setRoomReadyHandler);

export const publishAdminDraft = onCall(callable, publishAdminDraftHandler);
export const seedLiveOps = onCall(callable, seedLiveOpsHandler);
export const migrateLegacyPlayer = onCall(callable, migrateLegacyPlayerHandler);
export const registerPushToken = onCall(callable, registerPushTokenHandler);
export const updateFeatureFlags = onCall(callable, updateFeatureFlagsHandler);
export const saveAdminDraft = onCall(callable, saveAdminDraftHandler);

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
