import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { authorizeTarget, parentCheckFor, type AuthInfo } from "../server/src/realtime/authz";

/* ═══════════════ 1. Règles d'autorisation temps réel (serveur) ═══════════════ */

describe("realtime authz — mode lecture publique vs authentifié", () => {
  const pub: AuthInfo = { uid: null, admin: false };
  const player: AuthInfo = { uid: "player-1", admin: false };
  const admin: AuthInfo = { uid: "admin-1", admin: true };

  it("autorise runtime_config/* sans authentification (packs, sons, gameplay, cosmétiques par défaut)", () => {
    for (const docId of ["asset_pack", "power_packs", "audio_catalog", "gameplay", "cosmetics_defaults"]) {
      expect(authorizeTarget(pub, { kind: "doc", path: `runtime_config/${docId}` })).toEqual({ kind: "allow" });
    }
    expect(authorizeTarget(pub, { kind: "doc", path: "runtime_config/nested/secret/doc" })).toEqual({ kind: "deny" });
  });

  it("autorise les collections publiques filtrées sur published === true sans authentification", () => {
    for (const path of ["power_catalog/current", "anim_catalog/current", "offers", "events", "cosmetics", "seasons"]) {
      const kind = path.includes("/") ? "doc" : "query";
      const decision = authorizeTarget(pub, { kind, path });
      expect(decision.kind).toBe("filter");
      if (decision.kind === "filter") {
        expect(decision.predicate({ published: true })).toBe(true);
        expect(decision.predicate({ published: false })).toBe(false);
        expect(decision.predicate({})).toBe(false);
      }
    }
  });

  it("refuse toutes les collections privées, joueurs, salles et admin sans authentification", () => {
    const denied = [
      { kind: "doc" as const, path: "users/player-1" },
      { kind: "doc" as const, path: "players/player-1" },
      { kind: "doc" as const, path: "players_presence/player-1" },
      { kind: "doc" as const, path: "economies/player-1" },
      { kind: "doc" as const, path: "inventories/player-1" },
      { kind: "doc" as const, path: "rooms/room-1" },
      { kind: "query" as const, path: "rooms" },
      { kind: "doc" as const, path: "matches/match-1" },
      { kind: "doc" as const, path: "event_runs/run-1" },
      { kind: "doc" as const, path: "daily_rotations/2026-11-27/players/player-1" },
      { kind: "doc" as const, path: "admin_audit/a1" },
      { kind: "doc" as const, path: "power_cards/vent_nord" },
      { kind: "doc" as const, path: "sealed_packs/pack-1" },
      { kind: "doc" as const, path: "orders/ord-1" },
    ];
    for (const target of denied) {
      expect(authorizeTarget(pub, target), target.path).toEqual({ kind: "deny" });
    }
    expect(parentCheckFor(pub, { kind: "query", path: "rooms/room-1/game" })).toBeNull();
  });

  it("conserve l'isolation joueur / admin une fois connecté", () => {
    expect(authorizeTarget(player, { kind: "doc", path: "users/player-1" })).toEqual({ kind: "allow" });
    expect(authorizeTarget(player, { kind: "doc", path: "users/player-2" })).toEqual({ kind: "deny" });
    expect(authorizeTarget(player, { kind: "doc", path: "admin_audit/a1" })).toEqual({ kind: "deny" });
    expect(authorizeTarget(player, { kind: "doc", path: "rooms/room-1" })).toEqual({ kind: "allow" });
    expect(authorizeTarget(admin, { kind: "doc", path: "users/player-2" })).toEqual({ kind: "allow" });
    expect(authorizeTarget(admin, { kind: "doc", path: "admin_audit/a1" })).toEqual({ kind: "allow" });
  });
});

/* ═══════════════ 2. Client WebSocket temps réel (public, login, 4401) ═══════════════ */

type MockAuthUser = { uid: string; getIdToken: (forceRefresh?: boolean) => Promise<string> };
type AuthListener = (user: MockAuthUser | null) => void;

const authState = {
  currentUser: null as MockAuthUser | null,
  listeners: new Set<AuthListener>(),
};

function setMockAuthUser(user: MockAuthUser | null) {
  authState.currentUser = user;
  for (const listener of authState.listeners) listener(user);
}

vi.mock("@/lib/authClient", () => ({
  auth: {
    get currentUser() {
      return authState.currentUser;
    },
  },
  onAuthStateChanged: (_auth: unknown, listener: AuthListener) => {
    authState.listeners.add(listener);
    queueMicrotask(() => {
      if (authState.listeners.has(listener)) listener(authState.currentUser);
    });
    return () => {
      authState.listeners.delete(listener);
    };
  },
}));

class FakeWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  static instances: FakeWebSocket[] = [];

  readyState = FakeWebSocket.CONNECTING;
  sent: Array<Record<string, unknown>> = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: ((event: { code: number; reason?: string }) => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(readonly url: string) {
    FakeWebSocket.instances.push(this);
  }

  send(raw: string) {
    this.sent.push(JSON.parse(raw) as Record<string, unknown>);
  }

  open() {
    this.readyState = FakeWebSocket.OPEN;
    this.onopen?.();
  }

  receive(payload: Record<string, unknown>) {
    this.onmessage?.({ data: JSON.stringify(payload) });
  }

  close(code = 1000, reason = "") {
    if (this.readyState === FakeWebSocket.CLOSED) return;
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.({ code, reason });
  }
}

async function flushMicrotasks(rounds = 6) {
  for (let i = 0; i < rounds; i += 1) {
    await Promise.resolve();
  }
}

describe("lib/realtime — synchronisation publique, login et renouvellement 4401", () => {
  const originalWindow = globalThis.window;
  const originalWebSocket = globalThis.WebSocket;
  let windowListeners: Map<string, Set<() => void>>;

  beforeEach(() => {
    vi.useFakeTimers();
    FakeWebSocket.instances = [];
    authState.currentUser = null;
    authState.listeners.clear();
    windowListeners = new Map();

    // Environnement minimal de navigateur pour Node/Vitest
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        location: { hostname: "localhost" },
        addEventListener: (name: string, fn: () => void) => {
          let set = windowListeners.get(name);
          if (!set) { set = new Set(); windowListeners.set(name, set); }
          set.add(fn);
        },
        removeEventListener: (name: string, fn: () => void) => {
          windowListeners.get(name)?.delete(fn);
        },
      },
    });
    Object.defineProperty(globalThis, "WebSocket", {
      configurable: true,
      value: FakeWebSocket,
    });
  });

  afterEach(async () => {
    const realtime = await import("../lib/realtime");
    realtime.__resetRealtimeForTest();
    vi.useRealTimers();
    Object.defineProperty(globalThis, "window", { configurable: true, value: originalWindow });
    Object.defineProperty(globalThis, "WebSocket", { configurable: true, value: originalWebSocket });
  });

  it("ouvre le WebSocket en mode public (token: null) sans compte connecté et livre les packs et sons", async () => {
    const { subscribe } = await import("../lib/realtime");
    const receivedPacks: unknown[] = [];
    const receivedAudio: unknown[] = [];

    const stopPacks = subscribe(
      { kind: "doc", path: "runtime_config/asset_pack" },
      { onDoc: (doc) => receivedPacks.push(doc.data) },
    );
    const stopAudio = subscribe(
      { kind: "doc", path: "runtime_config/audio_catalog" },
      { onDoc: (doc) => receivedAudio.push(doc.data) },
    );

    await flushMicrotasks();
    expect(FakeWebSocket.instances).toHaveLength(1);
    const ws = FakeWebSocket.instances[0];
    ws.open();
    expect(ws.sent[0]).toEqual({ type: "auth", token: null });

    ws.receive({ type: "ready", uid: null });
    expect(ws.sent.slice(1)).toEqual([
      { type: "subscribe", id: 1, target: { kind: "doc", path: "runtime_config/asset_pack" } },
      { type: "subscribe", id: 2, target: { kind: "doc", path: "runtime_config/audio_catalog" } },
    ]);

    ws.receive({ type: "doc", id: 1, doc: { id: "asset_pack", path: "runtime_config/asset_pack", data: { pack: "wax", uiPack: "soleil" } } });
    ws.receive({ type: "doc", id: 2, doc: { id: "audio_catalog", path: "runtime_config/audio_catalog", data: { slots: { ui_button: { url: "/uploads/audio/a.mp3" } } } } });

    expect(receivedPacks).toEqual([{ pack: "wax", uiPack: "soleil" }]);
    expect(receivedAudio).toEqual([{ slots: { ui_button: { url: "/uploads/audio/a.mp3" } } }]);

    stopPacks();
    stopAudio();
  });

  it("bascule automatiquement vers une socket authentifiée au login, puis revient en mode public au logout", async () => {
    const { subscribe } = await import("../lib/realtime");
    const stop = subscribe({ kind: "doc", path: "runtime_config/asset_pack" }, {});

    await flushMicrotasks();
    expect(FakeWebSocket.instances).toHaveLength(1);
    const publicWs = FakeWebSocket.instances[0];
    publicWs.open();
    publicWs.receive({ type: "ready", uid: null });
    expect(publicWs.sent[0]).toEqual({ type: "auth", token: null });

    // Connexion d'un joueur après le chargement de la page
    const getIdToken = vi.fn(async () => "jwt-user-1");
    setMockAuthUser({ uid: "user-1", getIdToken });
    await flushMicrotasks();

    expect(publicWs.readyState).toBe(FakeWebSocket.CLOSED);
    expect(FakeWebSocket.instances).toHaveLength(2);
    const authedWs = FakeWebSocket.instances[1];
    authedWs.open();
    expect(authedWs.sent[0]).toEqual({ type: "auth", token: "jwt-user-1" });
    authedWs.receive({ type: "ready", uid: "user-1" });
    expect(authedWs.sent[1]).toEqual({ type: "subscribe", id: 1, target: { kind: "doc", path: "runtime_config/asset_pack" } });

    // Déconnexion : repasse en mode public pour continuer de recevoir runtime_config
    setMockAuthUser(null);
    await flushMicrotasks();

    expect(authedWs.readyState).toBe(FakeWebSocket.CLOSED);
    expect(FakeWebSocket.instances).toHaveLength(3);
    const publicAgainWs = FakeWebSocket.instances[2];
    publicAgainWs.open();
    expect(publicAgainWs.sent[0]).toEqual({ type: "auth", token: null });

    stop();
  });

  it("force le renouvellement du JWT (getIdToken(true)) quand le serveur ferme sur 4401 INVALID_TOKEN", async () => {
    const getIdToken = vi.fn(async (forceRefresh?: boolean) => (forceRefresh ? "jwt-fresh" : "jwt-stale"));
    authState.currentUser = { uid: "user-2", getIdToken };

    const { subscribe } = await import("../lib/realtime");
    const stop = subscribe({ kind: "doc", path: "runtime_config/audio_catalog" }, {});

    await flushMicrotasks();
    expect(FakeWebSocket.instances).toHaveLength(1);
    const firstWs = FakeWebSocket.instances[0];
    firstWs.open();
    expect(firstWs.sent[0]).toEqual({ type: "auth", token: "jwt-stale" });
    expect(getIdToken).toHaveBeenCalledWith(false);

    // Le serveur rejette le jeton périmé/invalidé
    firstWs.close(4401, "INVALID_TOKEN");

    // Retentative rapide avec forceRefresh = true
    await vi.advanceTimersByTimeAsync(60);
    await flushMicrotasks();
    expect(getIdToken).toHaveBeenLastCalledWith(true);
    expect(FakeWebSocket.instances).toHaveLength(2);
    const refreshedWs = FakeWebSocket.instances[1];
    refreshedWs.open();
    expect(refreshedWs.sent[0]).toEqual({ type: "auth", token: "jwt-fresh" });

    stop();
  });

  it("planifie une reconnexion si getIdToken échoue temporairement (panne réseau)", async () => {
    let attempt = 0;
    const getIdToken = vi.fn(async () => {
      attempt += 1;
      if (attempt === 1) throw new Error("auth/network-request-failed");
      return "jwt-recovered";
    });
    authState.currentUser = { uid: "user-3", getIdToken };

    const { subscribe } = await import("../lib/realtime");
    const stop = subscribe({ kind: "doc", path: "runtime_config/asset_pack" }, {});

    await flushMicrotasks();
    expect(FakeWebSocket.instances).toHaveLength(0);

    // Backoff initial = 1 000 ms
    await vi.advanceTimersByTimeAsync(1_050);
    await flushMicrotasks();
    expect(FakeWebSocket.instances).toHaveLength(1);
    const ws = FakeWebSocket.instances[0];
    ws.open();
    expect(ws.sent[0]).toEqual({ type: "auth", token: "jwt-recovered" });

    stop();
  });
});
