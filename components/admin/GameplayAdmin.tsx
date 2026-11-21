"use client";

import { useState } from "react";
import { GAMEPLAY_MODES, PLAYER_COUNTS, type GameplayConfig, validateGameplayConfig } from "@/domain/gameplayConfig";
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
          <label className={styles.field}><span>Secondes par tour</span><input type="number" min={5} max={120} value={value.turnSeconds} onChange={(e) => setDraft({ ...value, turnSeconds: Number(e.target.value) })} /></label>
          <label className={styles.field}><span>Cartes pouvoir sélectionnables par partie</span><input type="number" min={0} max={8} value={value.maxEquippedPowers} onChange={(e) => setDraft({ ...value, maxEquippedPowers: Number(e.target.value) })} /><small>0 désactive les pouvoirs. Jusqu’à 8 cartes équipées.</small></label>
        </div>
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
