import assert from "node:assert/strict";
import { test } from "vitest";

import { PlaySyncTracker } from "../sync/PlaySyncTracker.ts";

test("anime une seule fois quand l'événement précède la confirmation", () => {
  const tracker = new PlaySyncTracker();
  tracker.predict("play-1", 100);

  assert.equal(tracker.animate("play-1", 110), true);
  assert.equal(tracker.animate("play-1", 120), false);
  assert.equal(tracker.confirm("play-1", 150).phase, "confirmed");
  assert.equal(tracker.get("play-1")?.animatedAt, 110);
});

test("tolère une confirmation reçue avant l'événement léger", () => {
  const tracker = new PlaySyncTracker();
  tracker.confirm("play-2", 200);

  assert.equal(tracker.animate("play-2", 210), true);
  assert.equal(tracker.get("play-2")?.phase, "confirmed");
  assert.equal(tracker.animate("play-2", 220), false);
});

test("déduplique les snapshots pending et lastPlay coalescés", () => {
  const tracker = new PlaySyncTracker();

  assert.equal(tracker.animate("play-3", 300), true);
  tracker.confirm("play-3", 310);
  tracker.confirm("play-3", 320);
  assert.equal(tracker.animate("play-3", 330), false);
  assert.equal(tracker.isConfirmed("play-3"), true);
});

test("ignore un événement hors ordre après rejet", () => {
  const tracker = new PlaySyncTracker();
  tracker.predict("play-4", 400);
  tracker.reject("play-4", 420);

  assert.equal(tracker.animate("play-4", 430), false);
  assert.equal(tracker.get("play-4")?.phase, "rejected");
});

test("un rejet réseau peut être suivi d'un nouveau coup indépendant", () => {
  const tracker = new PlaySyncTracker();
  tracker.reject("failed-write", 500);

  assert.equal(tracker.animate("failed-write", 510), false);
  assert.equal(tracker.animate("retry-write", 520), true);
  assert.equal(tracker.confirm("retry-write", 540).phase, "confirmed");
});

test("clear isole deux manches successives", () => {
  const tracker = new PlaySyncTracker();
  tracker.animate("same-id", 600);
  tracker.clear();

  assert.equal(tracker.animate("same-id", 700), true);
});
