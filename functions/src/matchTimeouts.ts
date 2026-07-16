/* ═══════════════ FILE: functions/src/matchTimeouts.ts ═══════════════
   Worker d'auto-play au timeout : quand un joueur HUMAIN laisse expirer son
   tour (actionDeadlineAt + grâce), le serveur joue sa carte légale la plus
   faible — parité avec l'auto-play local (LocalGameSync.startTimer).

   Idempotence : la garde `turnId` rejouée EN transaction — chaque coup
   régénère turnId, donc un double tir du worker (ou une course avec un
   submitGameAction humain, sérialisée par le SELECT FOR UPDATE de la façade
   pg) est neutralisé sans verrou supplémentaire.

   Le forfait après 2 tours manqués (missedTurns) est un chantier séparé :
   le client ne gère pas encore le statut "forfeit" (AuthoritativeGameSync
   le mappe sur la phase "turns"). Les compteurs sont déjà incrémentés ici. */

import { db, stableId } from "./core";
import { performGameAction, type MatchDocument, type MatchParticipant } from "./matchCommands";

/** Grâce au-delà de la deadline serveur. Le budget d'animation du replay est
    DÉJÀ inclus dans actionDeadlineAt (PLAY_ANIM_MS/TRICK_PAUSE_MS et
    dealBudgetMs dans matchCommands.ts) : au moment où l'affichage atteint 0,
    le joueur a bien eu ses 15 s réelles. Le worker agit donc dès zéro ; sa
    boucle de 500 ms absorbe déjà la latence et l'écart d'horloge résiduel. */
const TIMEOUT_GRACE_MS = 0;

export async function autoPlayExpiredMatchesImpl(): Promise<void> {
  const cutoff = Date.now() - TIMEOUT_GRACE_MS;
  const expired = await db.collection("matches")
    .where("status", "==", "playing")
    .where("actionDeadlineAt", "<=", cutoff)
    .limit(20)
    .get();

  for (const snapshot of expired.docs) {
    const seenTurnId = String(snapshot.get("turnId") ?? "");
    try {
      await db.runTransaction(async (transaction) => {
        const matchRef = db.doc(`matches/${snapshot.id}`);
        const fresh = await transaction.get(matchRef);
        if (!fresh.exists) return;
        const match = fresh.data() as MatchDocument;
        // Gardes rejouées en transaction (le scan est hors verrou).
        if (match.status !== "playing") return;
        if (String(match.turnId) !== seenTurnId) return; // quelqu'un a joué entre-temps
        if (Number(match.actionDeadlineAt) > Date.now() - TIMEOUT_GRACE_MS) return;
        const actor = (match.participants as MatchParticipant[])[Number(match.turnIndex)];
        if (!actor || actor.bot) return; // les bots sont chaînés dans performGameAction
        const now = Date.now();
        await performGameAction(transaction, now, snapshot.id, match, {
          actorUid: actor.uid,
          requestedCardId: null,
          pick: "lowest",
          automatic: true,
          // Graine déterministe : un retry de transaction (40001) régénère
          // exactement les mêmes playIds → aucun doublon côté client.
          actionSeed: stableId(snapshot.id, "timeout", seenTurnId),
          missedTurnsDelta: { [actor.uid]: 1 },
        });
      });
    } catch (error) {
      console.error(`autoPlayExpiredMatches: échec pour ${snapshot.id}`, error);
    }
  }
}
