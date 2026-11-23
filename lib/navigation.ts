/* ═══════════════ Système de navigation Njambo (Web + Capacitor-ready) ═══════════════
   Architecture pensée pour fonctionner aussi bien sur navigateur / PWA que
   dans un futur build mobile Capacitor (static export sous capacitor://localhost
   ou https://localhost) :
   - Routage par hash canonique (#/scene?param=val) → jamais besoin de rewrite serveur
     et survit à toute actualisation de page ou rechargement de WebView.
   - Pile de navigation persistée dans sessionStorage → conserve la page active,
     ses paramètres (eventDetailId, socialTarget, collectionTab, roomId) ET tout
     l'historique de retour après actualisation (F5 / WebView reload).
   - Pont matériel Capacitor (@capacitor/app `backButton`) + Cordova (`backbutton`)
     détecté à l'exécution sans dépendance npm requise aujourd'hui.
   - Pile globale de modales (GameModal) : Retour ferme toujours la modale active
     avant de reculer d'un écran. */

import type { BotDifficulty, GameMode, SceneName, SocialTarget } from "@/types/game";

/* ── Types ── */

export interface NavEntry {
  key: string;
  scene: SceneName;
  eventDetailId?: string | null;
  socialTarget?: SocialTarget;
  collectionTab?: "powers" | "items";
  roomId?: string | null;
}

export interface NavStackSnapshot {
  entries: NavEntry[];
  index: number;
  updatedAt: number;
}

export interface NjamboHistoryState {
  __njambo: true;
  key: string;
  /** Profondeur réelle poussée dans window.history (0 = point d'entrée de l'onglet). */
  historyDepth: number;
  /** Index dans la pile logique de navigation. */
  stackIndex: number;
  entry: NavEntry;
}

export interface ActiveGameSession {
  mode: GameMode;
  mise: number;
  botCount: number;
  difficulty: BotDifficulty;
  roomId?: string | null;
  matchId?: string | null;
  eventRunId?: string | null;
  eventId?: string | null;
  eventMatchmaking?: boolean;
  eventStageLabel?: string;
  eventRequiredPlayers?: number;
  savedAt: number;
}

/* ── Constantes & métadonnées de scènes ── */

export const ALL_SCENES: ReadonlySet<SceneName> = new Set<SceneName>([
  "menu",
  "setup",
  "table",
  "result",
  "bot_setup",
  "online_setup",
  "friends_invite",
  "lobby",
  "profile",
  "leaderboard",
  "friends",
  "options",
  "history",
  "players",
  "friend_requests",
  "notifications",
  "messages",
  "chat",
  "public_profile",
  "power_shop",
  "power_collection",
  "play",
  "events",
  "event_detail",
  "season",
  "shop",
  "wallet",
  "rules",
  "minigames",
]);

/** Parent canonique utilisé quand la pile est vide (ex. accès direct par lien profond). */
export const PARENT_SCENE: Partial<Record<SceneName, SceneName>> = {
  bot_setup: "play",
  online_setup: "play",
  friends_invite: "play",
  lobby: "online_setup",
  event_detail: "events",
  season: "events",
  chat: "messages",
  friend_requests: "friends",
  public_profile: "players",
  table: "menu",
  result: "menu",
};

export const SCENE_LABELS: Record<SceneName, string> = {
  menu: "Salon",
  setup: "Partie",
  table: "Table",
  result: "Résultat",
  bot_setup: "Solo IA",
  online_setup: "En ligne",
  friends_invite: "Entre amis",
  lobby: "Salle",
  profile: "Profil",
  leaderboard: "Classement",
  friends: "Amis",
  options: "Options",
  history: "Historique",
  players: "Joueurs",
  friend_requests: "Demandes",
  notifications: "Alertes",
  messages: "Messages",
  chat: "Discussion",
  public_profile: "Joueur",
  power_shop: "Boutique",
  power_collection: "Collection",
  play: "Jouer",
  events: "Événements",
  event_detail: "Événement",
  season: "Saison",
  shop: "Boutique",
  wallet: "Portefeuille",
  minigames: "Mini-jeux",
  admin: "Admin",
  rules: "Règles",
};

export const NAV_STACK_STORAGE_KEY = "njambo:nav-stack:v1";
export const ACTIVE_GAME_STORAGE_KEY = "njambo:active-game:v1";
const MAX_STACK_LENGTH = 40;
const ACTIVE_GAME_TTL_MS = 2 * 60 * 60 * 1000; // 2 h

let keyCounter = 0;

export function createNavKey(): string {
  keyCounter += 1;
  return `nav_${Date.now().toString(36)}_${keyCounter.toString(36)}`;
}

export function parentSceneOf(scene: SceneName): SceneName {
  return PARENT_SCENE[scene] ?? "menu";
}

export function sceneLabelOf(scene: SceneName): string {
  return SCENE_LABELS[scene] ?? "Salon";
}

export function isValidScene(value: unknown): value is SceneName {
  return typeof value === "string" && ALL_SCENES.has(value as SceneName);
}

export function isNjamboHistoryState(value: unknown): value is NjamboHistoryState {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<NjamboHistoryState>;
  return candidate.__njambo === true && Boolean(candidate.entry && isValidScene(candidate.entry.scene));
}

export function sameSocialTarget(a?: SocialTarget, b?: SocialTarget): boolean {
  return (
    (a?.peerUid ?? "") === (b?.peerUid ?? "") &&
    (a?.playerUid ?? "") === (b?.playerUid ?? "") &&
    (a?.conversationId ?? "") === (b?.conversationId ?? "")
  );
}

export function sameNavEntry(a: NavEntry, b: NavEntry): boolean {
  if (a.scene !== b.scene) return false;
  if (a.scene === "event_detail" && (a.eventDetailId ?? null) !== (b.eventDetailId ?? null)) return false;
  if ((a.scene === "chat" || a.scene === "public_profile") && !sameSocialTarget(a.socialTarget, b.socialTarget)) return false;
  if (a.scene === "power_collection" && (a.collectionTab ?? "powers") !== (b.collectionTab ?? "powers")) return false;
  if (a.scene === "lobby" && (a.roomId ?? null) !== (b.roomId ?? null)) return false;
  return true;
}

/* ── Sérialisation & parsing d'URL par hash (#/scene?params) ── */

export function formatRouteHash(entry: Pick<NavEntry, "scene" | "eventDetailId" | "socialTarget" | "collectionTab" | "roomId">): string {
  if (entry.scene === "menu") return "";
  const params = new URLSearchParams();
  if (entry.scene === "event_detail" && entry.eventDetailId) {
    params.set("event", entry.eventDetailId);
  } else if (entry.scene === "chat") {
    if (entry.socialTarget?.peerUid) params.set("peer", entry.socialTarget.peerUid);
    if (entry.socialTarget?.conversationId) params.set("conv", entry.socialTarget.conversationId);
  } else if (entry.scene === "public_profile") {
    const uid = entry.socialTarget?.playerUid ?? entry.socialTarget?.peerUid;
    if (uid) params.set("player", uid);
  } else if (entry.scene === "power_collection" && entry.collectionTab && entry.collectionTab !== "powers") {
    params.set("tab", entry.collectionTab);
  } else if (entry.scene === "lobby" && entry.roomId) {
    params.set("room", entry.roomId);
  }
  const query = params.toString();
  return query ? `#/${entry.scene}?${query}` : `#/${entry.scene}`;
}

export function urlForNavEntry(entry: Pick<NavEntry, "scene" | "eventDetailId" | "socialTarget" | "collectionTab" | "roomId">): string {
  if (typeof window === "undefined") return formatRouteHash(entry);
  const base = `${window.location.pathname}${window.location.search}`;
  const hash = formatRouteHash(entry);
  return hash ? `${base}${hash}` : base;
}

export interface ParsedHashRoute {
  scene: SceneName;
  eventDetailId?: string | null;
  socialTarget?: SocialTarget;
  collectionTab?: "powers" | "items";
  roomId?: string | null;
}

/** Parse `#/scene?k=v` et reste compatible avec l'ancien format `#scene`. */
export function parseRouteHash(rawHash: string): ParsedHashRoute | null {
  const cleaned = rawHash.replace(/^#\/?/, "").trim();
  if (!cleaned) return null;
  const qIndex = cleaned.indexOf("?");
  const sceneRaw = (qIndex === -1 ? cleaned : cleaned.slice(0, qIndex)).replace(/\/+$/, "");
  if (!isValidScene(sceneRaw)) return null;

  const params = qIndex === -1 ? new URLSearchParams() : new URLSearchParams(cleaned.slice(qIndex + 1));
  const parsed: ParsedHashRoute = { scene: sceneRaw };

  if (sceneRaw === "event_detail") {
    const event = params.get("event");
    if (event) parsed.eventDetailId = event;
  } else if (sceneRaw === "chat") {
    const peerUid = params.get("peer") ?? undefined;
    const conversationId = params.get("conv") ?? undefined;
    if (peerUid || conversationId) parsed.socialTarget = { peerUid, conversationId };
  } else if (sceneRaw === "public_profile") {
    const playerUid = params.get("player") ?? undefined;
    if (playerUid) parsed.socialTarget = { playerUid };
  } else if (sceneRaw === "power_collection") {
    const tab = params.get("tab");
    if (tab === "items" || tab === "powers") parsed.collectionTab = tab;
  } else if (sceneRaw === "lobby") {
    const room = params.get("room");
    if (room) parsed.roomId = room;
  }

  return parsed;
}

/* ── Persistance sessionStorage (pile de navigation & partie en cours) ── */

function sanitizeEntry(raw: unknown): NavEntry | null {
  if (!raw || typeof raw !== "object") return null;
  const candidate = raw as Partial<NavEntry>;
  if (!isValidScene(candidate.scene)) return null;
  return {
    key: typeof candidate.key === "string" && candidate.key ? candidate.key : createNavKey(),
    scene: candidate.scene,
    eventDetailId: typeof candidate.eventDetailId === "string" ? candidate.eventDetailId : null,
    socialTarget: candidate.socialTarget && typeof candidate.socialTarget === "object" ? candidate.socialTarget : undefined,
    collectionTab: candidate.collectionTab === "items" ? "items" : candidate.collectionTab === "powers" ? "powers" : undefined,
    roomId: typeof candidate.roomId === "string" ? candidate.roomId : null,
  };
}

export function loadNavStack(): NavStackSnapshot | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(NAV_STACK_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<NavStackSnapshot>;
    if (!Array.isArray(parsed.entries) || parsed.entries.length === 0) return null;
    const entries = parsed.entries.map(sanitizeEntry).filter((item): item is NavEntry => item !== null);
    if (entries.length === 0) return null;
    const index = typeof parsed.index === "number"
      ? Math.max(0, Math.min(entries.length - 1, Math.trunc(parsed.index)))
      : entries.length - 1;
    return {
      entries: entries.slice(-MAX_STACK_LENGTH),
      index: Math.min(index, Math.min(entries.length, MAX_STACK_LENGTH) - 1),
      updatedAt: typeof parsed.updatedAt === "number" ? parsed.updatedAt : Date.now(),
    };
  } catch {
    return null;
  }
}

export function saveNavStack(entries: NavEntry[], index: number): void {
  if (typeof window === "undefined") return;
  try {
    const trimmed = entries.length > MAX_STACK_LENGTH
      ? entries.slice(entries.length - MAX_STACK_LENGTH)
      : entries;
    const shift = entries.length - trimmed.length;
    const safeIndex = Math.max(0, Math.min(trimmed.length - 1, index - shift));
    const snapshot: NavStackSnapshot = {
      entries: trimmed,
      index: safeIndex,
      updatedAt: Date.now(),
    };
    window.sessionStorage.setItem(NAV_STACK_STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    // sessionStorage indisponible / quota plein : silencieux
  }
}

export function saveActiveGameSession(session: Omit<ActiveGameSession, "savedAt">): void {
  if (typeof window === "undefined") return;
  try {
    const payload: ActiveGameSession = { ...session, savedAt: Date.now() };
    window.sessionStorage.setItem(ACTIVE_GAME_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // ignore
  }
}

export function loadActiveGameSession(): ActiveGameSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(ACTIVE_GAME_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ActiveGameSession>;
    if (!parsed || typeof parsed.mode !== "string") return null;
    if (!["bot", "online", "friends", "event"].includes(parsed.mode)) return null;
    if (typeof parsed.savedAt === "number" && Date.now() - parsed.savedAt > ACTIVE_GAME_TTL_MS) {
      window.sessionStorage.removeItem(ACTIVE_GAME_STORAGE_KEY);
      return null;
    }
    return {
      mode: parsed.mode as GameMode,
      mise: typeof parsed.mise === "number" ? parsed.mise : 0,
      botCount: typeof parsed.botCount === "number" ? parsed.botCount : 2,
      difficulty: parsed.difficulty === "easy" || parsed.difficulty === "hard" ? parsed.difficulty : "normal",
      roomId: typeof parsed.roomId === "string" ? parsed.roomId : null,
      matchId: typeof parsed.matchId === "string" ? parsed.matchId : null,
      eventRunId: typeof parsed.eventRunId === "string" ? parsed.eventRunId : null,
      eventId: typeof parsed.eventId === "string" ? parsed.eventId : null,
      eventMatchmaking: Boolean(parsed.eventMatchmaking),
      eventStageLabel: typeof parsed.eventStageLabel === "string" ? parsed.eventStageLabel : "",
      eventRequiredPlayers: typeof parsed.eventRequiredPlayers === "number" ? parsed.eventRequiredPlayers : 4,
      savedAt: typeof parsed.savedAt === "number" ? parsed.savedAt : Date.now(),
    };
  } catch {
    return null;
  }
}

export function updateActiveGameMatchId(matchId: string | null): void {
  const current = loadActiveGameSession();
  if (!current) return;
  saveActiveGameSession({ ...current, matchId });
}

export function clearActiveGameSession(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(ACTIVE_GAME_STORAGE_KEY);
  } catch {
    // ignore
  }
}

/* ── Résolution initiale au montage (actualisation F5 / WebView reload) ── */

export interface InitialNavResolution {
  entries: NavEntry[];
  index: number;
  historyDepth: number;
}

function mergeParsedWithStored(parsed: ParsedHashRoute, stored?: NavEntry | null): NavEntry {
  const base = stored && stored.scene === parsed.scene ? stored : null;
  const socialTarget: SocialTarget | undefined =
    parsed.socialTarget || base?.socialTarget
      ? {
          ...base?.socialTarget,
          ...parsed.socialTarget,
        }
      : undefined;
  return {
    key: base?.key ?? createNavKey(),
    scene: parsed.scene,
    eventDetailId: parsed.eventDetailId ?? base?.eventDetailId ?? null,
    socialTarget,
    collectionTab: parsed.collectionTab ?? base?.collectionTab,
    roomId: parsed.roomId ?? base?.roomId ?? null,
  };
}

function isEntryViable(entry: NavEntry, activeGame: ActiveGameSession | null): boolean {
  if (entry.scene === "result") return false;
  if (entry.scene === "table") return Boolean(activeGame);
  if (entry.scene === "lobby") return Boolean(entry.roomId);
  if (entry.scene === "event_detail") return Boolean(entry.eventDetailId);
  if (entry.scene === "chat") return Boolean(entry.socialTarget?.peerUid || entry.socialTarget?.conversationId);
  if (entry.scene === "public_profile") return Boolean(entry.socialTarget?.playerUid || entry.socialTarget?.peerUid);
  return true;
}

function fallbackForUnviable(scene: SceneName): SceneName {
  if (scene === "event_detail") return "events";
  if (scene === "chat") return "messages";
  if (scene === "public_profile") return "players";
  if (scene === "lobby") return "online_setup";
  return "menu";
}

/**
 * Résout l'état initial de navigation au démarrage / après actualisation :
 * 1. Si l'URL porte un hash valide (`#/shop`, `#/event_detail?event=…`),
 *    on le réconcilie avec la pile persistée (si le sommet correspond, on
 *    conserve TOUT l'historique de retour ; sinon on garde `[menu, cible]`).
 * 2. Si le hash est absent (ex. WebView Capacitor rechargée à `/`) mais que
 *    `sessionStorage` contient la pile de la session courante, on la restaure.
 * 3. Les écrans dépendants d'une donnée manquante retombent proprement sur
 *    leur parent canonique sans jamais afficher un écran vide.
 */
export function resolveInitialNavigation(): InitialNavResolution {
  const defaultEntry: NavEntry = { key: createNavKey(), scene: "menu" };
  if (typeof window === "undefined") {
    return { entries: [defaultEntry], index: 0, historyDepth: 0 };
  }

  const stored = loadNavStack();
  const activeGame = loadActiveGameSession();
  const rawHistoryState = window.history.state;
  const historyState = isNjamboHistoryState(rawHistoryState) ? rawHistoryState : null;
  const parsedHash = parseRouteHash(window.location.hash);

  // Cas 1 : l'URL contient un hash explicite.
  if (parsedHash) {
    // Le sommet de la pile persistée correspond au hash → restaurer toute la pile !
    if (stored) {
      const top = stored.entries[stored.index];
      if (top && top.scene === parsedHash.scene) {
        const merged = mergeParsedWithStored(parsedHash, top);
        if (isEntryViable(merged, activeGame)) {
          const entries = [...stored.entries];
          entries[stored.index] = merged;
          return {
            entries,
            index: stored.index,
            historyDepth: historyState?.historyDepth ?? 0,
          };
        }
      }
    }

    // Sinon : vérifier le state History API (survit au F5 même si sessionStorage a été vidé).
    const mergedFromHistory = mergeParsedWithStored(parsedHash, historyState?.entry);
    if (isEntryViable(mergedFromHistory, activeGame)) {
      if (mergedFromHistory.scene === "menu") {
        return { entries: [mergedFromHistory], index: 0, historyDepth: historyState?.historyDepth ?? 0 };
      }
      const rootEntry: NavEntry = { key: createNavKey(), scene: "menu" };
      const parent = parentSceneOf(mergedFromHistory.scene);
      const entries: NavEntry[] = parent !== "menu" && parent !== mergedFromHistory.scene
        ? [rootEntry, { key: createNavKey(), scene: parent }, mergedFromHistory]
        : [rootEntry, mergedFromHistory];
      return {
        entries,
        index: entries.length - 1,
        historyDepth: historyState?.historyDepth ?? 0,
      };
    }

    // Hash non viable (ex. #/table sans partie active) → retomber sur son parent.
    const fb = fallbackForUnviable(parsedHash.scene);
    const fbEntry: NavEntry = { key: createNavKey(), scene: fb };
    return {
      entries: fb === "menu" ? [fbEntry] : [defaultEntry, fbEntry],
      index: fb === "menu" ? 0 : 1,
      historyDepth: historyState?.historyDepth ?? 0,
    };
  }

  // Cas 2 : pas de hash dans l'URL, mais une pile active existe dans sessionStorage
  // (ex. WebView mobile qui recharge `/` en conservant sessionStorage).
  if (stored) {
    const active = stored.entries[stored.index];
    if (active && isEntryViable(active, activeGame)) {
      return {
        entries: stored.entries,
        index: stored.index,
        historyDepth: historyState?.historyDepth ?? 0,
      };
    }
  }

  // Cas 3 : state History API seul (F5 sans hash).
  if (historyState && isEntryViable(historyState.entry, activeGame)) {
    const entry = historyState.entry;
    return {
      entries: entry.scene === "menu" ? [entry] : [defaultEntry, entry],
      index: entry.scene === "menu" ? 0 : 1,
      historyDepth: historyState.historyDepth ?? 0,
    };
  }

  return { entries: [defaultEntry], index: 0, historyDepth: 0 };
}

/* ── Pile de fermeture des modales (GameModal & overlays) ── */

interface ModalBackItem {
  id: string;
  close: () => void;
}

const modalBackStack: ModalBackItem[] = [];

/** Enregistre une modale ouverte : Retour la ferme avant de quitter la scène. */
export function registerModalBackHandler(id: string, close: () => void): () => void {
  const existingIdx = modalBackStack.findIndex((item) => item.id === id);
  if (existingIdx !== -1) modalBackStack.splice(existingIdx, 1);
  modalBackStack.push({ id, close });
  return () => {
    const idx = modalBackStack.findIndex((item) => item.id === id);
    if (idx !== -1) modalBackStack.splice(idx, 1);
  };
}

/** Ferme la modale la plus haute si une modale est ouverte. */
export function closeTopModal(): boolean {
  const top = modalBackStack[modalBackStack.length - 1];
  if (!top) return false;
  top.close();
  return true;
}

export function hasOpenModal(): boolean {
  return modalBackStack.length > 0;
}

/** Tests uniquement. */
export function __resetModalBackStack(): void {
  modalBackStack.length = 0;
}

/* ── Pont matériel Capacitor / Android WebView (sans dépendance npm requise) ── */

interface CapacitorAppPluginLike {
  addListener?: (
    eventName: "backButton",
    listener: (data: { canGoBack?: boolean }) => void,
  ) => Promise<{ remove: () => Promise<void> | void }> | { remove: () => Promise<void> | void };
  exitApp?: () => Promise<void> | void;
  minimizeApp?: () => Promise<void> | void;
}

interface WindowWithCapacitor extends Window {
  Capacitor?: {
    isNativePlatform?: () => boolean;
    getPlatform?: () => string;
    Plugins?: {
      App?: CapacitorAppPluginLike;
    };
  };
}

function getCapacitorAppPlugin(): CapacitorAppPluginLike | null {
  if (typeof window === "undefined") return null;
  const cap = (window as WindowWithCapacitor).Capacitor;
  return cap?.Plugins?.App ?? null;
}

export function isCapacitorNative(): boolean {
  if (typeof window === "undefined") return false;
  const cap = (window as WindowWithCapacitor).Capacitor;
  if (!cap) return false;
  if (typeof cap.isNativePlatform === "function") return Boolean(cap.isNativePlatform());
  const platform = typeof cap.getPlatform === "function" ? cap.getPlatform() : "";
  return platform === "android" || platform === "ios";
}

/**
 * Écoute le bouton Retour matériel mobile :
 * - Capacitor `@capacitor/app` (`App.addListener("backButton", …)`)
 * - Événement legacy Cordova / Android WebView (`document` `"backbutton"`)
 */
export function subscribeHardwareBackButton(onBack: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const cleanups: Array<() => void> = [];

  const appPlugin = getCapacitorAppPlugin();
  if (appPlugin && typeof appPlugin.addListener === "function") {
    let removed = false;
    let handle: { remove: () => Promise<void> | void } | null = null;
    try {
      const maybePromise = appPlugin.addListener("backButton", () => {
        onBack();
      });
      void Promise.resolve(maybePromise)
        .then((resolved) => {
          if (removed) void resolved?.remove?.();
          else handle = resolved;
        })
        .catch(() => {});
    } catch {
      // Plugin indisponible dans cet environnement
    }
    cleanups.push(() => {
      removed = true;
      try {
        void handle?.remove?.();
      } catch {
        // ignore
      }
    });
  }

  if (typeof document !== "undefined") {
    const onLegacyBack = (event: Event) => {
      event.preventDefault();
      onBack();
    };
    document.addEventListener("backbutton", onLegacyBack, false);
    cleanups.push(() => document.removeEventListener("backbutton", onLegacyBack, false));
  }

  return () => {
    for (const cleanup of cleanups) cleanup();
  };
}

/** Réduit (Android 12+) ou ferme proprement l'app Capacitor à la racine. */
export function minimizeOrExitCapacitorApp(): boolean {
  const appPlugin = getCapacitorAppPlugin();
  if (!appPlugin) return false;
  try {
    if (typeof appPlugin.minimizeApp === "function") {
      void appPlugin.minimizeApp();
      return true;
    }
    if (typeof appPlugin.exitApp === "function") {
      void appPlugin.exitApp();
      return true;
    }
  } catch {
    // ignore
  }
  return false;
}
