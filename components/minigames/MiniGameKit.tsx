"use client";

/* Briques communes à tous les mini-jeux : mise en page (titre + « Lots &
   chances », zone de jeu, bouton), bouton de lancement (coût ou « Gratuit »),
   fenêtre de gain et fenêtre des probabilités. */

import Image from "@/components/ui/GameImage";
import type { ReactNode } from "react";
import { GameModal } from "@/components/ui/GameModal";
import { miniGameOdds, type MiniGameDef, type Reward } from "@/domain";
import { rewardIconSrc, rewardLabel } from "@/lib/shopVisuals";
import { costIcon, costLabel } from "./useMiniGames";
import styles from "./MiniGames.module.css";

export function GameStage({
  game, onOdds, children, footer, hint,
}: { game: MiniGameDef; onOdds: () => void; children: ReactNode; footer: ReactNode; hint?: ReactNode }) {
  return (
    <section className={`${styles.stage} ${styles[`tone_${game.tone}`]}`} aria-label={game.title}>
      <div className={styles.stageHead}>
        <div>
          <h2>{game.title}</h2>
          <p>{game.tagline}</p>
        </div>
        <button data-nj-skin="none" type="button" className={styles.oddsLink} onClick={onOdds}>
          Lots &amp; chances
        </button>
      </div>
      <div className={styles.stageBody}>{children}</div>
      {hint && <p className={styles.stageHint} role="status" aria-live="polite">{hint}</p>}
      <div className={styles.stageFoot}>{footer}</div>
    </section>
  );
}

export function PlayButton({
  game, free, guest, busy, disabled, label, onClick,
}: { game: MiniGameDef; free: number; guest: boolean; busy?: boolean; disabled?: boolean; label: string; onClick: () => void }) {
  const icon = costIcon(game.cost);
  return (
    <button
      data-nj-skin="none"
      type="button"
      className={`${styles.playBtn} ${styles[`btn_${game.tone}`]}`}
      disabled={disabled || busy}
      onClick={onClick}
    >
      <strong>{guest ? "SE CONNECTER" : busy ? "…" : label}</strong>
      {!guest && (
        <small className={styles.costTag}>
          {free > 0 ? (
            <>Gratuit{free > 1 ? ` · ${free} restants` : ""}</>
          ) : (
            <>
              {icon && <Image src={icon} alt="" width={16} height={16} />}
              {costLabel(game.cost)}
            </>
          )}
        </small>
      )}
    </button>
  );
}

export function RewardModal({ reward, game, onClose }: { reward: Reward | null; game: MiniGameDef; onClose: () => void }) {
  const stored = reward && reward.type !== "nkap" && reward.type !== "cauris";
  return (
    <GameModal
      open={reward !== null}
      onClose={onClose}
      size="sm"
      kicker={game.title}
      title="Gagné !"
      tone={game.tone === "cobalt" ? "teal" : game.tone}
      footer={
        <button data-nj-skin="none" type="button" className={`${styles.playBtn} ${styles.btn_gold}`} onClick={onClose}>
          <strong>Super, merci !</strong>
        </button>
      }
    >
      {reward && (
        <div className={styles.rewardBox}>
          <span className={styles.rewardOrb}>
            <Image src={rewardIconSrc(reward)} alt="" width={88} height={88} />
          </span>
          <strong>{rewardLabel(reward)}</strong>
          <p>{stored ? "Ajouté à Ma collection." : "Ajouté à ton portefeuille."}</p>
        </div>
      )}
    </GameModal>
  );
}

export function OddsModal({ game, open, onClose }: { game: MiniGameDef; open: boolean; onClose: () => void }) {
  const rows = miniGameOdds(game.id);
  const total = rows.reduce((sum, row) => sum + row.weight, 0);
  return (
    <GameModal open={open} onClose={onClose} size="sm" kicker="Lots & chances" title={game.title} tone="gold">
      <ul className={styles.oddsList}>
        {rows.map((row) => (
          <li key={row.label}>
            <span>{row.label}</span>
            {total > 0 && row.weight > 0 && <b>{((row.weight / total) * 100).toFixed(row.weight / total < 0.1 ? 1 : 0)} %</b>}
          </li>
        ))}
      </ul>
      <p className={styles.oddsNote}>
        {game.freePerDay > 0 ? `${game.freePerDay} partie${game.freePerDay > 1 ? "s" : ""} gratuite${game.freePerDay > 1 ? "s" : ""} par jour` : "Pas de partie gratuite"}
        {game.cost.type !== "free" ? `, puis ${costLabel(game.cost)} la partie.` : "."} Le résultat est tiré par le serveur.
      </p>
    </GameModal>
  );
}
