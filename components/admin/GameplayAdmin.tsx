"use client";

import { useState } from "react";
import {
  CARD_SCALE_LIMITS,
  DEAL_TIMING_LIMITS,
  DEFAULT_GAMEPLAY_CONFIG,
  GAMEPLAY_MODES,
  PLAYER_COUNTS,
  type GameplayConfig,
  dealDurationMs,
  validateGameplayConfig,
} from "@/domain/gameplayConfig";
import { GAME_CONFIG } from "@/config/gameConfig";
import { DEFAULT_CARD_BACK_ASSET } from "@/lib/assets/manifests";
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
      setMessage("Réglages enregistrés. Ils s’appliqueront immédiatement sur la table et aux prochaines parties.");
      setDraft(null);
    } catch (cause) { setMessage(adminErrorText(cause)); }
    finally { setBusy(false); }
  };

  const previewPlayerW = Math.round(44 * (value.playerCardScale / 100));
  const previewOppW = Math.round(previewPlayerW * (value.opponentCardScale / 100));

  return <div>
    <div className={styles.pageHead}><div><h1>Règles des parties</h1><p>Réglages des tables IA, Amis et Online.</p></div></div>
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
        <h2>Taille des cartes sur la table</h2>
        <p>Ajuste en temps réel l’échelle des cartes adverses et de ta main sur la table (les arches circulaires s’adaptent automatiquement).</p>
        <div className={styles.grid2}>
          <label className={styles.field}>
            <span>Cartes des adversaires ({value.opponentCardScale} % de la main du joueur)</span>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <input
                type="range"
                data-testid="opponent-card-scale-range"
                min={CARD_SCALE_LIMITS.opponentPct.min}
                max={CARD_SCALE_LIMITS.opponentPct.max}
                step={2}
                value={value.opponentCardScale}
                onChange={(e) => setDraft({ ...value, opponentCardScale: Number(e.target.value) })}
                style={{ flex: 1 }}
              />
              <input
                type="number"
                data-testid="opponent-card-scale"
                aria-label="Taille des cartes adverses (%)"
                min={CARD_SCALE_LIMITS.opponentPct.min}
                max={CARD_SCALE_LIMITS.opponentPct.max}
                step={1}
                value={value.opponentCardScale}
                onChange={(e) => setDraft({ ...value, opponentCardScale: Number(e.target.value) })}
                style={{ width: 76 }}
              />
            </div>
            <small>{CARD_SCALE_LIMITS.opponentPct.min} à {CARD_SCALE_LIMITS.opponentPct.max} % (défaut : {DEFAULT_GAMEPLAY_CONFIG.opponentCardScale} %).</small>
          </label>

          <label className={styles.field}>
            <span>Cartes du joueur ({value.playerCardScale} %)</span>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <input
                type="range"
                data-testid="player-card-scale-range"
                min={CARD_SCALE_LIMITS.playerPct.min}
                max={CARD_SCALE_LIMITS.playerPct.max}
                step={2}
                value={value.playerCardScale}
                onChange={(e) => setDraft({ ...value, playerCardScale: Number(e.target.value) })}
                style={{ flex: 1 }}
              />
              <input
                type="number"
                data-testid="player-card-scale"
                aria-label="Taille des cartes du joueur (%)"
                min={CARD_SCALE_LIMITS.playerPct.min}
                max={CARD_SCALE_LIMITS.playerPct.max}
                step={1}
                value={value.playerCardScale}
                onChange={(e) => setDraft({ ...value, playerCardScale: Number(e.target.value) })}
                style={{ width: 76 }}
              />
            </div>
            <small>{CARD_SCALE_LIMITS.playerPct.min} à {CARD_SCALE_LIMITS.playerPct.max} % (défaut : {DEFAULT_GAMEPLAY_CONFIG.playerCardScale} %).</small>
          </label>
        </div>

        {/* Aperçu comparatif en direct des proportions */}
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, marginTop: 12, padding: "12px 14px", borderRadius: 10, background: "#0b2b20", border: "1px solid rgba(255,212,92,0.28)" }}>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 22 }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5 }}>
              <div style={{ width: previewPlayerW, height: Math.round(previewPlayerW * 1.45), borderRadius: 6, background: "linear-gradient(155deg,#fffdf6,#f3e2be)", color: "#c1292e", fontWeight: 900, fontSize: Math.max(10, Math.round(previewPlayerW * 0.28)), display: "grid", placeItems: "center", boxShadow: "0 6px 14px rgba(0,0,0,0.45)", transition: "width 160ms ease, height 160ms ease" }}>
                9♥
              </div>
              <small className={styles.hint}>Toi ({value.playerCardScale} %)</small>
            </div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={DEFAULT_CARD_BACK_ASSET}
                alt="Aperçu carte adverse"
                style={{ width: previewOppW, height: Math.round(previewOppW * 1.45), objectFit: "cover", borderRadius: 6, boxShadow: "0 6px 14px rgba(0,0,0,0.45), 0 0 10px rgba(255,207,64,0.35)", transition: "width 160ms ease, height 160ms ease" }}
              />
              <small className={styles.hint}>Adversaire ({value.opponentCardScale} %)</small>
            </div>
          </div>
          {(value.opponentCardScale !== DEFAULT_GAMEPLAY_CONFIG.opponentCardScale || value.playerCardScale !== DEFAULT_GAMEPLAY_CONFIG.playerCardScale) && (
            <button
              type="button"
              className={styles.btn}
              onClick={() => setDraft({
                ...value,
                opponentCardScale: DEFAULT_GAMEPLAY_CONFIG.opponentCardScale,
                playerCardScale: DEFAULT_GAMEPLAY_CONFIG.playerCardScale,
              })}
            >
              Réinitialiser ({DEFAULT_GAMEPLAY_CONFIG.opponentCardScale} % / {DEFAULT_GAMEPLAY_CONFIG.playerCardScale} %)
            </button>
          )}
        </div>
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
