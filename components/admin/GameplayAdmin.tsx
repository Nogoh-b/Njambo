"use client";

import { useState } from "react";
import { DEAL_TIMING_LIMITS, GAMEPLAY_MODES, PLAYER_COUNTS, type GameplayConfig, dealDurationMs, validateGameplayConfig } from "@/domain/gameplayConfig";
import { GAME_CONFIG } from "@/config/gameConfig";
import { useGameplayConfig } from "@/hooks/useGameplayConfig";
import { backendCallable } from "@/lib/backendCallable";
import { generateSecureId } from "@/lib/cryptoUtils";
import { adminErrorText } from "./adminApi";
import styles from "./AdminConsole.module.css";

const LABELS = { bot: "IA", friends: "Amis", online: "Online" };

export function GameplayAdmin() {
  const { config, loading, error } = useGameplayConfig();
  const [draft, setDraft] = useState<GameplayConfig | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const value = draft ?? config;
  const save = async () => {
    setBusy(true); setMessage("");
    try {
      const call = backendCallable("saveGameplayConfig");
      await call({ idempotencyKey: `gameplay_${generateSecureId(24)}`, config: value });
      setMessage("Réglages enregistrés. Ils s’appliqueront aux prochaines parties.");
      setDraft(null);
    } catch (cause) { setMessage(adminErrorText(cause)); }
    finally { setBusy(false); }
  };
  return <div>
    <div className={styles.pageHead}><div><h1>Règles des parties</h1><p>Réglages des nouvelles tables IA, Amis et Online.</p></div></div>
    {loading ? <p>Chargement…</p> : error ? <p role="alert">Impossible de charger les réglages. Réessaie après reconnexion.</p> : <>
      <section className={styles.panel}>
        <div className={styles.grid2}>
          <label className={styles.field}><span>Secondes par tour</span><input type="number" min={5} max={120} value={value.turnSeconds} onChange={(e) => setDraft({ ...value, turnSeconds: Number(e.target.value) })} /><small>{value.unlimitedTurnsBot ? "Tables Amis et Online (les tables contre l’IA sont sans limite)." : "Toutes les tables."}</small></label>
          <label className={styles.field}><span>Cartes pouvoir sélectionnables par partie</span><input type="number" min={0} max={8} value={value.maxEquippedPowers} onChange={(e) => setDraft({ ...value, maxEquippedPowers: Number(e.target.value) })} /><small>0 désactive les pouvoirs. Jusqu’à 8 cartes équipées.</small></label>
        </div>
        <label className={styles.check} style={{ marginTop: 10 }}>
          <input type="checkbox" data-testid="unlimited-bot" checked={value.unlimitedTurnsBot} onChange={(e) => setDraft({ ...value, unlimitedTurnsBot: e.target.checked })} />
          Temps illimité contre l’IA : aucun minuteur, aucune carte jouée automatiquement
        </label>
        <small className={styles.hint} style={{ display: "block" }}>Tables contre l’IA seulement : entre amis et en ligne, un joueur sans limite pourrait bloquer la table. Les événements gardent leur minuteur. Les pouvoirs qui jouent sur le temps (Sable du Temps, Cri du Chef, Tambour d’Appel) n’ont alors plus d’effet visible.</small>
      </section>
      <section className={styles.panel}>
        <h2>Rythme de la donne</h2>
        <p>Copié dans les règles de chaque nouvelle partie : le serveur et tous les joueurs distribuent au même rythme. Les parties en cours gardent le leur.</p>
        <div className={styles.grid2}>
          <label className={styles.field}><span>Délai entre deux cartes (ms)</span><input type="number" data-testid="deal-per-card" min={DEAL_TIMING_LIMITS.perCardMs.min} max={DEAL_TIMING_LIMITS.perCardMs.max} step={5} value={value.dealPerCardMs} onChange={(e) => setDraft({ ...value, dealPerCardMs: Number(e.target.value) })} /><small>{DEAL_TIMING_LIMITS.perCardMs.min} à {DEAL_TIMING_LIMITS.perCardMs.max} ms. Plus grand = distribution plus posée.</small></label>
          <label className={styles.field}><span>Durée du vol d’une carte (ms)</span><input type="number" data-testid="deal-flight" min={DEAL_TIMING_LIMITS.flightMs.min} max={DEAL_TIMING_LIMITS.flightMs.max} step={10} value={value.dealFlightMs} onChange={(e) => setDraft({ ...value, dealFlightMs: Number(e.target.value) })} /><small>{DEAL_TIMING_LIMITS.flightMs.min} à {DEAL_TIMING_LIMITS.flightMs.max} ms.</small></label>
        </div>
        <p className={styles.hint} data-testid="deal-total">
          Durée de la donne : {PLAYER_COUNTS.map((count) => `${count} joueurs ${(dealDurationMs({ perCardMs: value.dealPerCardMs, flightMs: value.dealFlightMs }, count, GAME_CONFIG.cardsPerPlayer) / 1000).toFixed(1).replace(".", ",")} s`).join(" · ")}.
        </p>
      </section>
      <section className={styles.panel}>
        <h2>Manches complètes par table</h2>
        <p>Chaque manche redistribue les cartes. Le plus de victoires remporte la table ; la victoire la plus récente départage les égalités. La mise est engagée une fois pour la série.</p>
        <table className={styles.table}><thead><tr><th>Mode</th>{PLAYER_COUNTS.map((count) => <th key={count}>{count} joueurs</th>)}</tr></thead><tbody>
          {GAMEPLAY_MODES.map((mode) => <tr key={mode}><th>{LABELS[mode]}</th>{PLAYER_COUNTS.map((count) => <td key={count}><input aria-label={`Manches ${LABELS[mode]}, ${count} joueurs`} type="number" min={1} max={20} value={value.matchesByMode[mode][count]} onChange={(e) => setDraft({ ...value, matchesByMode: { ...value.matchesByMode, [mode]: { ...value.matchesByMode[mode], [count]: Number(e.target.value) } } })} /></td>)}</tr>)}
        </tbody></table>
      </section>
      <button type="button" className={`${styles.btn} ${styles.primary}`} disabled={busy || !draft || !validateGameplayConfig(value)} onClick={() => void save()}>{busy ? "Enregistrement…" : "Enregistrer"}</button>
      {message && <p role="status">{message}</p>}
    </>}
  </div>;
}
