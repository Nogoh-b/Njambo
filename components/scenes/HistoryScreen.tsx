"use client";

import { useEffect, useState } from "react";
import { useGame } from "@/contexts/GameContext";
import { useAuth } from "@/hooks/useAuth";
import { getEntranceAnimationStyle, useMotionProfile } from "@/lib/motion";
import { listenMatchHistory } from "@/lib/playerData";
import { NKAP } from "@/data/mock";
import { NjamboIcon, NjamboMark } from "@/components/ui/Art";
import { GameShell } from "@/components/ui/GameShell";
import type { MatchHistoryEntry } from "@/types/game";
import styles from "./HistoryScreen.module.css";

type HistoryFilter = "all" | "won" | "lost";

function modeLabel(mode: MatchHistoryEntry["mode"]): string {
  if (mode === "bot") return "Contre l'IA";
  if (mode === "friends") return "Entre amis";
  return "En ligne";
}

function modeToneClass(mode: MatchHistoryEntry["mode"]): string {
  if (mode === "friends") return styles.modePink;
  if (mode === "bot") return styles.modeTeal;
  return styles.modeGold;
}

export function HistoryScreen() {
  const { navigateTo, goBack, backLabelFor } = useGame();
  const { user } = useAuth();
  const motion = useMotionProfile();
  const [matches, setMatches] = useState<MatchHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<HistoryFilter>("all");

  useEffect(() => {
    if (!user?.uid) {
      setMatches([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const unsub = listenMatchHistory(user.uid, (nextMatches) => {
      setMatches(nextMatches);
      setLoading(false);
    });
    return unsub;
  }, [user?.uid]);

  const winsCount = matches.filter((m) => m.won).length;
  const filteredMatches = matches.filter((m) => {
    if (filter === "won") return m.won;
    if (filter === "lost") return !m.won;
    return true;
  });

  return (
    <GameShell dock={false} scroll={false} contentClassName={styles.historyShell}>
      {/* ═══ TOP HUD ═══ */}
      <header className={styles.hud}>
        <button data-nj-skin="none" type="button" className="nj-sr-back" onClick={() => goBack("menu")}>
          <span className="nj-sr-back-arrow" aria-hidden="true">←</span>
          <span>{backLabelFor("menu")}</span>
        </button>

        <div className={styles.hudCenter}>
          <span className={styles.hudKicker}>CARNET DE TABLE</span>
          <h1 className={styles.hudTitle}>Historique</h1>
        </div>

        <div className={styles.scorePill}>
          <NjamboIcon name="trophy" tone="gold" size={16} />
          <strong>{winsCount}</strong>
          <span>/ {matches.length}</span>
        </div>
      </header>

      {/* ═══ FILTRES (si au moins 1 manche) ═══ */}
      {matches.length > 0 && (
        <div className={styles.filterBar} role="tablist" aria-label="Filtrer l'historique">
          {(
            [
              ["all", `Toutes (${matches.length})`],
              ["won", `Victoires (${winsCount})`],
              ["lost", `Défaites (${matches.length - winsCount})`],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              data-nj-skin="none"
              type="button"
              role="tab"
              aria-selected={filter === id}
              className={`${styles.filterPill}${filter === id ? ` ${styles.filterActive}` : ""}`}
              onClick={() => setFilter(id)}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {/* ═══ CORPS (seule la liste défile) ═══ */}
      <section className={styles.board} aria-label="Journal des manches">
        {loading ? (
          <div className={styles.emptyCard}>
            <span className={styles.emptyEmblem}>
              <NjamboIcon name="history" tone="pink" size={38} />
            </span>
            <p>Chargement du carnet de table…</p>
          </div>
        ) : matches.length === 0 ? (
          <div className={styles.emptyCard}>
            <div className={styles.emptyMarkWrap}>
              <NjamboMark size={98} compact />
              <span className={styles.emptyTrophyPin}>
                <NjamboIcon name="trophy" tone="gold" size={24} />
              </span>
            </div>
            <h2>Aucune manche enregistrée</h2>
            <p>
              Prends place à une table ! Chaque victoire, chaque Ngata ×2 et chaque pot remporté viendra enrichir ton palmarès.
            </p>
            <button
              data-nj-skin="none"
              type="button"
              className={styles.playCta}
              onClick={() => navigateTo("play")}
            >
              <NjamboIcon name="play" tone="gold" size={18} />
              <span>Lancer une manche</span>
            </button>
          </div>
        ) : filteredMatches.length === 0 ? (
          <div className={styles.emptyCard}>
            <h2>Aucune manche dans ce filtre</h2>
            <p>Essaie un autre filtre pour revoir l&apos;ensemble de tes manches.</p>
          </div>
        ) : (
          <div className={styles.ticketList}>
            {filteredMatches.map((match, i) => (
              <article
                key={match.id}
                className={`${styles.ticket} ${match.won ? styles.ticketWin : styles.ticketLoss}`}
                style={getEntranceAnimationStyle(motion, i, { duration: 0.3, step: 0.04 })}
              >
                <span className={styles.ticketBadge}>
                  <NjamboIcon
                    name={match.won ? "trophy" : "history"}
                    tone={match.won ? "gold" : "pink"}
                    size={24}
                  />
                </span>

                <div className={styles.ticketBody}>
                  <div className={styles.ticketTop}>
                    <strong className={styles.ticketOutcome}>
                      {match.won ? "Victoire" : "Défaite"}
                    </strong>
                    <span className={`${styles.modeBadge} ${modeToneClass(match.mode)}`}>
                      {modeLabel(match.mode)}
                    </span>
                    {match.doubles && (
                      <span className={styles.ngataStamp}>NGATA ×2</span>
                    )}
                  </div>
                  <div className={styles.ticketMeta}>
                    <span>Gagnant : <b>{match.winnerName}</b></span>
                    <span>·</span>
                    <span>{new Date(match.createdAt).toLocaleDateString("fr-FR")}</span>
                  </div>
                </div>

                <div className={`${styles.ticketDelta} ${match.gain >= 0 ? styles.deltaPos : styles.deltaNeg}`}>
                  {match.gain >= 0 ? "+" : ""}
                  {NKAP(match.gain)}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </GameShell>
  );
}
