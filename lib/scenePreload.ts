/**
 * Préchargement centralisé des chunks de scène.
 *
 * Chaque scène de `NjamboApp` est un `dynamic(() => SCENE_IMPORTS.X())` : son chunk
 * n'est téléchargé qu'au premier affichage, d'où la lenteur initiale. Le préchargement
 * appelle les MÊMES fonctions `SCENE_IMPORTS` (voir plus bas), donc le même chunk.
 *
 * Deux consommateurs :
 *  - `lib/idlePreload.ts` : précharge les scènes fréquentes au repos (post-splash).
 *  - Les boutons de navigation (`onPointerEnter`/`onFocus`) : préchargent au survol.
 */

import { prefetchAssets } from "./assets/AssetLoader";
import { sceneManifest } from "./assets/manifests";

/** Modules de scène déjà résolus, pour un rendu SYNCHRONE sans passer par React.lazy. */
const resolvedModules = new Map<() => Promise<unknown>, unknown>();

/** Enveloppe un import() : un seul appel réseau, et le module résolu reste consultable (`peekScene`). */
function tracked<M>(load: () => Promise<M>): () => Promise<M> {
  let pending: Promise<M> | null = null;
  const wrapped = (): Promise<M> => {
    pending ??= load().then(
      (module) => { resolvedModules.set(wrapped, module); return module; },
      (error: unknown) => { pending = null; throw error; },
    );
    return pending;
  };
  return wrapped;
}

/** Module déjà chargé (ou undefined). Permet d'afficher un écran préchargé sans suspension :
 *  next/dynamic (React.lazy) suspend au 1er rendu même si le chunk est en cache, et React
 *  retarde alors l'affichage du contenu (~300 ms) → fondu d'un écran vide puis contenu en retard. */
export function peekScene<M>(load: () => Promise<M>): M | undefined {
  return resolvedModules.get(load) as M | undefined;
}

/**
 * SOURCE UNIQUE des import() de scène, utilisée à la fois par `NjamboApp` (next/dynamic) et par le
 * préchargement. Indispensable avec Turbopack : deux `import("…")` du même module écrits à deux
 * endroits différents produisent des groupes de chunks DIFFÉRENTS. Le préchargement téléchargeait
 * alors un chunk que l'écran n'utilisait pas, et le vrai chunk n'arrivait qu'au clic.
 */
export const SCENE_IMPORTS = {
  BotSetupScreen: tracked(() => import("@/components/scenes/BotSetupScreen")),
  OnlineSetupScreen: tracked(() => import("@/components/scenes/OnlineSetupScreen")),
  FriendsSetupScreen: tracked(() => import("@/components/scenes/FriendsSetupScreen")),
  LobbyScreen: tracked(() => import("@/components/scenes/LobbyScreen")),
  TableScreen: tracked(() => import("@/components/scenes/TableScreen")),
  ResultScreen: tracked(() => import("@/components/scenes/ResultScreen")),
  ProfileScreen: tracked(() => import("@/components/scenes/ProfileScreen")),
  LeaderboardScreen: tracked(() => import("@/components/scenes/LeaderboardScreen")),
  FriendsScreen: tracked(() => import("@/components/scenes/FriendsScreen")),
  PlayersScreen: tracked(() => import("@/components/scenes/PlayersScreen")),
  FriendRequestsScreen: tracked(() => import("@/components/scenes/FriendRequestsScreen")),
  NotificationsScreen: tracked(() => import("@/components/scenes/NotificationsScreen")),
  MessagesScreen: tracked(() => import("@/components/scenes/MessagesScreen")),
  ChatScreen: tracked(() => import("@/components/scenes/ChatScreen")),
  PublicProfileScreen: tracked(() => import("@/components/scenes/PublicProfileScreen")),
  OptionsScreen: tracked(() => import("@/components/scenes/OptionsScreen")),
  HistoryScreen: tracked(() => import("@/components/scenes/HistoryScreen")),
  RulesScreen: tracked(() => import("@/components/scenes/RulesScreen")),
  PowerCollectionScreen: tracked(() => import("@/components/scenes/PowerCollectionScreen")),
  PlayHubScreen: tracked(() => import("@/components/scenes/PlayHubScreen")),
  ShopScreen: tracked(() => import("@/components/scenes/ShopScreen")),
  EventsScreen: tracked(() => import("@/components/scenes/EventsScreen")),
  SeasonScreen: tracked(() => import("@/components/scenes/SeasonScreen")),
  EventDetailScreen: tracked(() => import("@/components/scenes/EventDetailScreen")),
  EventMatchmakingOverlay: tracked(() => import("@/components/scenes/EventMatchmakingOverlay")),
  WalletScreen: tracked(() => import("@/components/scenes/WalletScreen")),
  MiniGamesScreen: tracked(() => import("@/components/minigames/MiniGamesScreen")),
};

/** Particules (tsparticles) : même règle, un seul site d'import pour tous les consommateurs. */
export const loadPowerParticles = tracked(() => import("@/components/power/PowerParticles"));

type SceneLoader = () => Promise<unknown>;

/** Map partielle scène → import(). N'inclut que les scènes atteignables depuis la nav. */
const SCENE_LOADERS: Record<string, SceneLoader> = {
  play: SCENE_IMPORTS.PlayHubScreen,
  bot_setup: SCENE_IMPORTS.BotSetupScreen,
  online_setup: SCENE_IMPORTS.OnlineSetupScreen,
  friends_invite: SCENE_IMPORTS.FriendsSetupScreen,
  wallet: SCENE_IMPORTS.WalletScreen,
  minigames: SCENE_IMPORTS.MiniGamesScreen,
  events: SCENE_IMPORTS.EventsScreen,
  event_detail: SCENE_IMPORTS.EventDetailScreen,
  leaderboard: SCENE_IMPORTS.LeaderboardScreen,
  history: SCENE_IMPORTS.HistoryScreen,
  rules: SCENE_IMPORTS.RulesScreen,
  profile: SCENE_IMPORTS.ProfileScreen,
  shop: SCENE_IMPORTS.ShopScreen,
  power_shop: SCENE_IMPORTS.ShopScreen,
  power_collection: SCENE_IMPORTS.PowerCollectionScreen,
  season: SCENE_IMPORTS.SeasonScreen,
  friends: SCENE_IMPORTS.FriendsScreen,
  players: SCENE_IMPORTS.PlayersScreen,
  friend_requests: SCENE_IMPORTS.FriendRequestsScreen,
  notifications: SCENE_IMPORTS.NotificationsScreen,
  messages: SCENE_IMPORTS.MessagesScreen,
  options: SCENE_IMPORTS.OptionsScreen,
};

/** Scènes préchargées au repos (les plus visitées depuis le home). */
export const IDLE_PREFETCH_SCENES = [
  "play",
  "shop",
  "power_collection",
  "events",
  "minigames",
  "wallet",
  "profile",
  "leaderboard",
  "history",
  "rules",
] as const;

const started = new Set<string>();

/** Précharge le chunk d'une scène (idempotent). Silencieux en cas d'échec. */
export function preloadScene(scene: string): void {
  if (started.has(scene)) return;
  // Préchargement d'approche : assets indispensables de l'écran (au repos).
  if (typeof window !== "undefined") prefetchAssets(sceneManifest(scene).critical);
  const loader = SCENE_LOADERS[scene];
  if (!loader) return;
  started.add(scene);
  void loader().catch(() => {
    // Réseau/chunk indisponible : on laisse le dynamic() réessayer au clic.
    started.delete(scene);
  });
}
