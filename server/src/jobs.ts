import cron from "node-cron";
import { db } from "../../functions/src/core";
import { refundCancelledMatchImpl, refundExpiredEventQueuesImpl } from "../../functions/src/triggers";
import { notifyFullEnergyImpl } from "../../functions/src/notificationCommands";
import { autoPlayExpiredMatchesImpl } from "../../functions/src/matchTimeouts";

function watchCancelledMatches() {
  db.collection("matches")
    .where("status", "==", "cancelled")
    .onSnapshot((snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === "removed") return;
        const after = change.doc.data();
        if (!after || after.refundId) return;
        refundCancelledMatchImpl(change.doc.id, after).catch((error) => {
          console.error(`refundCancelledMatchImpl failed for match ${change.doc.id}`, error);
        });
      });
    }, (error) => {
      console.error("watchCancelledMatches listener error", error);
    });
}

export function startJobs() {
  watchCancelledMatches();
  // Auto-play au timeout : boucle courte (node-cron ne descend pas sous la
  // minute) avec verrou anti-réentrance.
  let autoPlayRunning = false;
  setInterval(() => {
    if (autoPlayRunning) return;
    autoPlayRunning = true;
    autoPlayExpiredMatchesImpl()
      .catch((error) => console.error("autoPlayExpiredMatchesImpl failed", error))
      .finally(() => { autoPlayRunning = false; });
  }, 500);
  cron.schedule("*/5 * * * *", () => {
    refundExpiredEventQueuesImpl().catch((error) => console.error("refundExpiredEventQueuesImpl failed", error));
  });
  cron.schedule("*/15 * * * *", () => {
    notifyFullEnergyImpl().catch((error) => console.error("notifyFullEnergyImpl failed", error));
  });
}
