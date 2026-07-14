import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { collection, doc, getDoc, getDocs, query, setDoc, updateDoc, where } from "firebase/firestore";

const withEmulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const suite = withEmulator ? describe : describe.skip;

suite("Firestore security rules", () => {
  let env: RulesTestEnvironment;

  beforeAll(async () => {
    env = await initializeTestEnvironment({
      projectId: "njambo-rules-test",
      firestore: { rules: readFileSync(resolve(process.cwd(), "firestore.rules"), "utf8") },
    });
  });

  beforeEach(async () => env.clearFirestore());
  afterAll(async () => env?.cleanup());

  it("allows only validated private profile fields", async () => {
    const db = env.authenticatedContext("alice").firestore();
    await assertSucceeds(setDoc(doc(db, "users/alice"), {
      name: "Alice", emoji: "🎴", locale: "fr", ageBand: "18_plus", createdAt: 1, updatedAt: 1,
    }));
    await assertFails(updateDoc(doc(db, "users/alice"), { balance: 999_999 }));
  });

  it("denies every client wallet, inventory and ranking write", async () => {
    const db = env.authenticatedContext("alice").firestore();
    await assertFails(setDoc(doc(db, "economies/alice"), { nkap: 1_000_000, cauris: 99 }));
    await assertFails(setDoc(doc(db, "inventories/alice"), { cards: { all: true } }));
    await assertFails(setDoc(doc(db, "players/alice"), { crowns: 9_999 }));
    await assertFails(setDoc(doc(db, "economies/alice/ledger/fake"), { delta: { cauris: 99 } }));
  });

  it("keeps authoritative match writes server-only and hands private", async () => {
    await env.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "matches/m1"), { participantUids: ["alice", "bob"], status: "playing" });
      await setDoc(doc(context.firestore(), "matches/m1/private/alice"), { uid: "alice", hand: ["3coeur"] });
    });
    const alice = env.authenticatedContext("alice").firestore();
    const bob = env.authenticatedContext("bob").firestore();
    await assertSucceeds(getDoc(doc(alice, "matches/m1/private/alice")));
    await assertFails(getDoc(doc(bob, "matches/m1/private/alice")));
    await assertFails(updateDoc(doc(alice, "matches/m1"), { result: { winnerUid: "alice" } }));
  });

  it("allows public published catalog reads but no client publication", async () => {
    await env.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "offers/test"), { published: true, title: "Test" });
    });
    await assertSucceeds(getDoc(doc(env.unauthenticatedContext().firestore(), "offers/test")));
    await assertFails(setDoc(doc(env.authenticatedContext("alice").firestore(), "offers/evil"), { published: true }));
  });

  it("protects admin drafts with the admin custom claim", async () => {
    const normal = env.authenticatedContext("alice").firestore();
    const admin = env.authenticatedContext("root", { admin: true }).firestore();
    await assertFails(setDoc(doc(normal, "admin_drafts/d1"), { title: "Nope" }));
    await assertSucceeds(setDoc(doc(admin, "admin_drafts/d1"), {
      type: "event", contentId: "demo", revision: 1, payload: {}, status: "draft",
      createdBy: "root", createdAt: 1, updatedAt: 1,
    }));
  });

  it("rejects forged notification actors", async () => {
    const db = env.authenticatedContext("alice").firestore();
    const base = { type: "message", actorName: "Mallory", actorEmoji: "🎭", title: "Message", body: "Test", read: false, createdAt: 1 };
    await assertFails(setDoc(doc(db, "users/bob/notifications/n1"), { ...base, actorUid: "mallory" }));
    await assertSucceeds(setDoc(doc(db, "users/bob/notifications/n2"), { ...base, actorUid: "alice" }));
  });

  it("does not accept writes to the legacy client-host game", async () => {
    await env.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "rooms/r1"), { playerUids: ["alice"], players: [{ uid: "alice" }] });
    });
    const db = env.authenticatedContext("alice").firestore();
    await assertFails(setDoc(doc(db, "rooms/r1/game/current"), { result: { winner: "alice" } }));
  });

  it("allows a player to add only their own room membership", async () => {
    const hostPlayer = { uid: "alice", name: "Alice", emoji: "🎴", ready: true, balance: 0, joinedAt: 1 };
    await env.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "rooms/r2"), {
        code: "NJAM123", hostId: "alice", stake: 100, status: "waiting", roomType: "online", maxPlayers: 4,
        players: [hostPlayer], playerUids: ["alice"], createdAt: 1,
      });
    });
    const host = env.authenticatedContext("alice").firestore();
    const bob = env.authenticatedContext("bob").firestore();
    const bobPlayer = { uid: "bob", name: "Bob", emoji: "🥁", ready: false, balance: 0, joinedAt: 2 };
    await assertFails(updateDoc(doc(host, "rooms/r2"), { players: [hostPlayer, bobPlayer], playerUids: ["alice", "bob"] }));
    await assertFails(updateDoc(doc(bob, "rooms/r2"), { players: [hostPlayer, { ...bobPlayer, uid: "mallory" }], playerUids: ["alice", "mallory"] }));
    await assertSucceeds(updateDoc(doc(bob, "rooms/r2"), { players: [hostPlayer, bobPlayer], playerUids: ["alice", "bob"] }));
    await assertFails(setDoc(doc(bob, "room_consents/r2_bob"), { roomId: "r2", uid: "bob", ready: true }));
  });

  it("returns a readable economy only to its owner", async () => {
    await env.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "economies/alice"), { nkap: 5_000, cauris: 20 });
    });
    await assertSucceeds(getDoc(doc(env.authenticatedContext("alice").firestore(), "economies/alice")));
    await assertFails(getDoc(doc(env.authenticatedContext("bob").firestore(), "economies/alice")));
    expect(true).toBe(true);
  });

  it("keeps Ter progress owner-scoped and matchmaking server-only", async () => {
    await env.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "event_runs/run_alice"), { uid: "alice", status: "matchmaking" });
      await setDoc(doc(context.firestore(), "event_matchmaking/ter_v1_s0"), { entries: [{ uid: "alice", runId: "run_alice" }] });
    });
    const alice = env.authenticatedContext("alice").firestore();
    const bob = env.authenticatedContext("bob").firestore();
    await assertSucceeds(getDoc(doc(alice, "event_runs/run_alice")));
    await assertFails(getDoc(doc(bob, "event_runs/run_alice")));
    await assertFails(updateDoc(doc(alice, "event_runs/run_alice"), { losses: 0 }));
    await assertFails(getDoc(doc(alice, "event_matchmaking/ter_v1_s0")));
  });

  it("supports the published LiveOps and owner-scoped Ter queries used by the hubs", async () => {
    await env.withSecurityRulesDisabled(async (context) => {
      const seed = context.firestore();
      await setDoc(doc(seed, "offers/live"), { published: true, title: "Live" });
      await setDoc(doc(seed, "offers/draft"), { published: false, title: "Draft" });
      await setDoc(doc(seed, "event_runs/alice_run"), { uid: "alice", status: "active" });
      await setDoc(doc(seed, "event_runs/bob_run"), { uid: "bob", status: "active" });
    });

    const publicDb = env.unauthenticatedContext().firestore();
    const alice = env.authenticatedContext("alice").firestore();
    await assertSucceeds(getDocs(query(collection(publicDb, "offers"), where("published", "==", true))));
    await assertSucceeds(getDocs(query(collection(alice, "event_runs"), where("uid", "==", "alice"))));
    await assertFails(getDocs(query(collection(alice, "event_runs"), where("uid", "==", "bob"))));
  });
});
