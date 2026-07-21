/**
 * Préchargement centralisé des chunks de scène.
 *
 * Chaque scène de `NjamboApp` est un `dynamic(() => import(...))` : son chunk
 * n'est téléchargé qu'au premier affichage, d'où la lenteur initiale. On réutilise
 * ici EXACTEMENT les mêmes specifiers d'import que `NjamboApp` : webpack les résout
 * vers le même chunk, donc précharger via ce module met le chunk en cache avant le clic.
 *
 * Deux consommateurs :
 *  - `lib/idlePreload.ts` : précharge les scènes fréquentes au repos (post-splash).
 *  - Les boutons de navigation (`onPointerEnter`/`onFocus`) : préchargent au survol.
 */

type SceneLoader = () => Promise<unknown>;

/** Map partielle scène → import(). N'inclut que les scènes atteignables depuis la nav. */
const SCENE_LOADERS: Record<string, SceneLoader> = {
  play: () => import("@/components/scenes/PlayHubScreen"),
  bot_setup: () => import("@/components/scenes/BotSetupScreen"),
  online_setup: () => import("@/components/scenes/OnlineSetupScreen"),
  friends_invite: () => import("@/components/scenes/FriendsSetupScreen"),
  wallet: () => import("@/components/scenes/WalletScreen"),
  events: () => import("@/components/scenes/EventsScreen"),
  event_detail: () => import("@/components/scenes/EventDetailScreen"),
  leaderboard: () => import("@/components/scenes/LeaderboardScreen"),
  history: () => import("@/components/scenes/HistoryScreen"),
  rules: () => import("@/components/scenes/RulesScreen"),
  profile: () => import("@/components/scenes/ProfileScreen"),
  shop: () => import("@/components/scenes/ShopScreen"),
  friends: () => import("@/components/scenes/FriendsScreen"),
  notifications: () => import("@/components/scenes/NotificationsScreen"),
  messages: () => import("@/components/scenes/MessagesScreen"),
  options: () => import("@/components/scenes/OptionsScreen"),
};

/** Scènes préchargées au repos (les plus visitées depuis le home). */
export const IDLE_PREFETCH_SCENES = [
  "play",
  "wallet",
  "events",
  "leaderboard",
  "history",
  "rules",
  "profile",
  "shop",
] as const;

const started = new Set<string>();

/** Précharge le chunk d'une scène (idempotent). Silencieux en cas d'échec. */
export function preloadScene(scene: string): void {
  if (started.has(scene)) return;
  const loader = SCENE_LOADERS[scene];
  if (!loader) return;
  started.add(scene);
  void loader().catch(() => {
    // Réseau/chunk indisponible : on laisse le dynamic() réessayer au clic.
    started.delete(scene);
  });
}
