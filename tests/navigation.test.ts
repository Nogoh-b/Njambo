import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetModalBackStack,
  ACTIVE_GAME_STORAGE_KEY,
  clearActiveGameSession,
  closeTopModal,
  createNavKey,
  formatRouteHash,
  isCapacitorNative,
  loadActiveGameSession,
  loadNavStack,
  minimizeOrExitCapacitorApp,
  NAV_STACK_STORAGE_KEY,
  parentSceneOf,
  parseRouteHash,
  registerModalBackHandler,
  resolveInitialNavigation,
  saveActiveGameSession,
  saveNavStack,
  subscribeHardwareBackButton,
  updateActiveGameMatchId,
} from "../lib/navigation";

function createMemoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() { return map.size; },
    clear: () => map.clear(),
    getItem: (key: string) => map.get(key) ?? null,
    key: (index: number) => Array.from(map.keys())[index] ?? null,
    removeItem: (key: string) => { map.delete(key); },
    setItem: (key: string, value: string) => { map.set(key, String(value)); },
  };
}

function stubBrowser(options: { hash?: string; historyState?: unknown; capacitor?: unknown } = {}) {
  const sessionStorage = createMemoryStorage();
  const listeners = new Map<string, Set<(event: Event) => void>>();
  const fakeWindow = {
    location: { pathname: "/", search: "", hash: options.hash ?? "" },
    history: { state: options.historyState ?? null },
    sessionStorage,
    Capacitor: options.capacitor,
  };
  const fakeDocument = {
    addEventListener: (name: string, fn: (event: Event) => void) => {
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name)!.add(fn);
    },
    removeEventListener: (name: string, fn: (event: Event) => void) => {
      listeners.get(name)?.delete(fn);
    },
    dispatch: (name: string) => {
      const evt = { preventDefault: vi.fn() } as unknown as Event;
      listeners.get(name)?.forEach((fn) => fn(evt));
      return evt;
    },
  };
  vi.stubGlobal("window", fakeWindow);
  vi.stubGlobal("document", fakeDocument);
  return { fakeWindow, fakeDocument, sessionStorage };
}

describe("lib/navigation — routage hash, persistance F5 et pont Capacitor", () => {
  beforeEach(() => {
    __resetModalBackStack();
  });

  afterEach(() => {
    __resetModalBackStack();
    vi.unstubAllGlobals();
  });

  it("sérialise et parse les routes hash canoniques avec leurs paramètres", () => {
    expect(formatRouteHash({ scene: "menu" })).toBe("");
    expect(formatRouteHash({ scene: "shop" })).toBe("#/shop");
    expect(formatRouteHash({ scene: "event_detail", eventDetailId: "defi_mboa" })).toBe("#/event_detail?event=defi_mboa");
    expect(formatRouteHash({ scene: "chat", socialTarget: { peerUid: "u2", conversationId: "c9" } })).toBe("#/chat?peer=u2&conv=c9");
    expect(formatRouteHash({ scene: "public_profile", socialTarget: { playerUid: "u7" } })).toBe("#/public_profile?player=u7");
    expect(formatRouteHash({ scene: "power_collection", collectionTab: "items" })).toBe("#/power_collection?tab=items");
    expect(formatRouteHash({ scene: "lobby", roomId: "room_42" })).toBe("#/lobby?room=room_42");

    expect(parseRouteHash("#/shop")).toEqual({ scene: "shop" });
    expect(parseRouteHash("#shop")).toEqual({ scene: "shop" });
    expect(parseRouteHash("#/event_detail?event=defi_mboa")).toEqual({ scene: "event_detail", eventDetailId: "defi_mboa" });
    expect(parseRouteHash("#/chat?peer=u2&conv=c9")).toEqual({
      scene: "chat",
      socialTarget: { peerUid: "u2", conversationId: "c9" },
    });
    expect(parseRouteHash("#/public_profile?player=u7")).toEqual({
      scene: "public_profile",
      socialTarget: { playerUid: "u7" },
    });
    expect(parseRouteHash("#/power_collection?tab=items")).toEqual({ scene: "power_collection", collectionTab: "items" });
    expect(parseRouteHash("#/lobby?room=room_42")).toEqual({ scene: "lobby", roomId: "room_42" });
    expect(parseRouteHash("#/scene_inconnue")).toBeNull();
  });

  it("conserve la page active et toute la pile de retour après actualisation (F5)", () => {
    stubBrowser({ hash: "#/shop" });
    const stack = [
      { key: createNavKey(), scene: "menu" as const },
      { key: createNavKey(), scene: "profile" as const },
      { key: createNavKey(), scene: "wallet" as const },
      { key: createNavKey(), scene: "shop" as const },
    ];
    saveNavStack(stack, 3);

    const restored = resolveInitialNavigation();
    expect(restored.index).toBe(3);
    expect(restored.entries.map((entry) => entry.scene)).toEqual(["menu", "profile", "wallet", "shop"]);
    expect(loadNavStack()?.entries).toHaveLength(4);
  });

  it("restaure la page active depuis sessionStorage même si la WebView recharge / sans hash", () => {
    stubBrowser({ hash: "" });
    const stack = [
      { key: createNavKey(), scene: "menu" as const },
      { key: createNavKey(), scene: "events" as const },
      { key: createNavKey(), scene: "event_detail" as const, eventDetailId: "tournoi_ter" },
    ];
    saveNavStack(stack, 2);

    const restored = resolveInitialNavigation();
    expect(restored.index).toBe(2);
    expect(restored.entries[2].scene).toBe("event_detail");
    expect(restored.entries[2].eventDetailId).toBe("tournoi_ter");
  });

  it("reconstruit un chemin parent propre sur un lien profond direct", () => {
    stubBrowser({ hash: "#/event_detail?event=defi_mboa" });
    const restored = resolveInitialNavigation();
    expect(restored.entries.map((e) => e.scene)).toEqual(["menu", "events", "event_detail"]);
    expect(restored.entries[2].eventDetailId).toBe("defi_mboa");
    expect(parentSceneOf("chat")).toBe("messages");
    expect(parentSceneOf("season")).toBe("events");
  });

  it("protège #/table contre les chargements morts mais restaure une partie active persistée", () => {
    const { fakeWindow } = stubBrowser({ hash: "#/table" });
    // Sans session active → retour propre au menu
    const withoutSession = resolveInitialNavigation();
    expect(withoutSession.entries[withoutSession.index].scene).toBe("menu");

    // Avec session active → reste sur #/table pour reconnecter la partie
    saveActiveGameSession({
      mode: "bot",
      mise: 250,
      botCount: 2,
      difficulty: "hard",
      matchId: null,
    });
    updateActiveGameMatchId("match_abc");
    expect(loadActiveGameSession()?.matchId).toBe("match_abc");

    const withSession = resolveInitialNavigation();
    expect(withSession.entries[withSession.index].scene).toBe("table");

    clearActiveGameSession();
    expect(fakeWindow.sessionStorage.getItem(ACTIVE_GAME_STORAGE_KEY)).toBeNull();
    expect(fakeWindow.sessionStorage.getItem(NAV_STACK_STORAGE_KEY)).toBeNull();
  });

  it("ferme les modales ouvertes en LIFO avant de reculer d'écran", () => {
    const closed: string[] = [];
    const unreg1 = registerModalBackHandler("m1", () => closed.push("m1"));
    const unreg2 = registerModalBackHandler("m2", () => closed.push("m2"));

    expect(closeTopModal()).toBe(true);
    expect(closed).toEqual(["m2"]);
    unreg2();

    expect(closeTopModal()).toBe(true);
    expect(closed).toEqual(["m2", "m1"]);
    unreg1();

    expect(closeTopModal()).toBe(false);
  });

  it("relie le bouton Retour matériel Capacitor App + backbutton legacy sans dépendance npm", async () => {
    const capListeners: Array<(data: { canGoBack?: boolean }) => void> = [];
    const remove = vi.fn();
    const minimizeApp = vi.fn();
    const { fakeDocument } = stubBrowser({
      capacitor: {
        isNativePlatform: () => true,
        Plugins: {
          App: {
            addListener: (_event: string, fn: (data: { canGoBack?: boolean }) => void) => {
              capListeners.push(fn);
              return Promise.resolve({ remove });
            },
            minimizeApp,
          },
        },
      },
    });

    expect(isCapacitorNative()).toBe(true);
    const onBack = vi.fn();
    const unsub = subscribeHardwareBackButton(onBack);
    await Promise.resolve();

    expect(capListeners).toHaveLength(1);
    capListeners[0]({ canGoBack: true });
    expect(onBack).toHaveBeenCalledTimes(1);

    fakeDocument.dispatch("backbutton");
    expect(onBack).toHaveBeenCalledTimes(2);

    expect(minimizeOrExitCapacitorApp()).toBe(true);
    expect(minimizeApp).toHaveBeenCalledTimes(1);

    unsub();
    expect(remove).toHaveBeenCalledTimes(1);
  });
});
