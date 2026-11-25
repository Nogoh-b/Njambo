"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { AvatarIllustration, NjamboIcon } from "@/components/ui/Art";
import { NKAP } from "@/data/mock";
import type { MotionProfile } from "@/lib/motion";
import type { GameMode, Player, RoomDoc } from "@/types/game";
import styles from "./RematchView.module.css";
import { sysAsset } from "@/lib/assetPack";

const NKAP_COIN_SRC = "/assets/njambo/economy/nkap-64.webp";

export interface RematchViewProps {
  room: RoomDoc | null;
  currentUid?: string;
  gameMode?: GameMode;
  mise: number;
  previousPlayers?: Player[];
  motionProfile: MotionProfile;
  onShowResult: () => void;
  onLeave: () => void;
}

export function RematchView({
  room,
  currentUid,
  gameMode,
  mise,
  previousPlayers,
  motionProfile,
  onShowResult,
  onLeave,
}: RematchViewProps) {
  const [elapsed, setElapsed] = useState(0);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const start = Date.now();
    const id = window.setInterval(() => {
      setElapsed(Math.floor((Date.now() - start) / 1000));
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  const roomPlayers = room?.players ?? [];
  const hostId = room?.hostId ?? "";
  const isHost = Boolean(currentUid && hostId === currentUid);
  const guestPlayers = roomPlayers.filter((p) => p.uid !== hostId);
  const readyGuests = guestPlayers.filter((p) => p.ready).length;
  const allGuestsReady = guestPlayers.length > 0 && readyGuests === guestPlayers.length;
  const tableEmpty = !room || roomPlayers.length < 2;
  const animate = motionProfile.enabled && !motionProfile.reduced;
  const allowLoops = motionProfile.enabled && motionProfile.allowDecorativeLoop;

  // Joueurs de la manche précédente qui ont déjà quitté la salle
  const presentNames = new Set(roomPlayers.map((p) => p.name));
  const departedPlayers = (previousPlayers ?? []).filter(
    (p) => !p.isYou && !presentNames.has(p.name),
  );

  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;
  const clock = `${mins}:${secs.toString().padStart(2, "0")}`;

  const progressPct = tableEmpty
    ? 0
    : guestPlayers.length > 0
      ? Math.round(((readyGuests + (isHost ? 1 : 0)) / Math.max(1, roomPlayers.length)) * 100)
      : 100;

  const handleCopy = () => {
    if (!room?.code) return;
    navigator.clipboard?.writeText(room.code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  const headline = tableEmpty
    ? "Table dissoute"
    : allGuestsReady && isHost
      ? "Tous prêts · Lancement…"
      : allGuestsReady
        ? "En attente de l'hôte…"
        : "Revanche demandée";

  const subline = tableEmpty
    ? "Les autres joueurs ont quitté la table. Retourne au salon pour lancer une nouvelle partie."
    : isHost
      ? allGuestsReady
        ? "La nouvelle manche démarre dans un instant !"
        : `En attente de confirmation (${readyGuests}/${guestPlayers.length} invité${guestPlayers.length > 1 ? "s" : ""} prêt${readyGuests > 1 ? "s" : ""}).`
      : allGuestsReady
        ? "Tous les invités sont prêts. La manche reprend dès que l'hôte valide."
        : "Ta revanche est validée. En attente des autres joueurs à la table.";

  return (
    <motion.div
      className={styles.wrap}
      initial={animate ? { opacity: 0, y: 12, scale: 0.98 } : false}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={animate ? { opacity: 0, y: -10, scale: 0.98 } : undefined}
      transition={{ duration: 0.24, ease: "easeOut" }}
    >
      {/* ── En-tête Revanche ── */}
      <div className={styles.topRow}>
        <button
          data-nj-skin="none"
          type="button"
          className={styles.peekBtn}
          onClick={onShowResult}
          aria-label="Revenir au résumé de la manche"
        >
          <span aria-hidden="true">←</span>
          <span>Résultat</span>
        </button>

        <span className={styles.modeTag}>
          {gameMode === "friends" ? "Entre amis" : "En ligne · Classé"}
        </span>

        <span className={styles.clockPill} aria-label={`Temps d'attente ${clock}`}>
          <i className={`${styles.clockDot}${!tableEmpty && allowLoops ? ` ${styles.clockDotPulse}` : ""}`} aria-hidden="true" />
          <span>{clock}</span>
        </span>
      </div>

      {/* ── Blason Radar Revanche ── */}
      <div className={styles.hero}>
        <div className={`${styles.radar}${tableEmpty ? ` ${styles.radarEnded}` : allGuestsReady ? ` ${styles.radarReady}` : ""}`} aria-hidden="true">
          {!tableEmpty && allowLoops && (
            <>
              <span className={styles.radarRing} />
              <span className={`${styles.radarRing} ${styles.radarRingDelay}`} />
            </>
          )}
          <span className={styles.radarCore}>
            <NjamboIcon name={tableEmpty ? "home" : allGuestsReady ? "check" : "cards"} tone="gold" size={26} />
          </span>
        </div>

        <h1 className={styles.title}>{headline}</h1>
        <p className={styles.sub}>{subline}</p>
      </div>

      {/* ── Bandeau Mise & Code de salle ── */}
      {room && !tableEmpty && (
        <div className={styles.metaStrip}>
          <span className={styles.stakeChip}>
            <img src={sysAsset(NKAP_COIN_SRC)} alt="" className={styles.coinImg} draggable={false} />
            <span>{mise > 0 ? NKAP(mise) : "Amicale"}</span>
          </span>

          {room.code && (
            <button
              data-nj-skin="none"
              type="button"
              className={styles.codeChip}
              onClick={handleCopy}
              aria-label={`Copier le code ${room.code}`}
            >
              <span className={styles.codeLabel}>Code</span>
              <strong>{room.code}</strong>
              <span className={styles.copyTag}>{copied ? "✓ Copié" : "Copier"}</span>
            </button>
          )}
        </div>
      )}

      {/* ── Barre de progression du consensus ── */}
      {!tableEmpty && (
        <div className={styles.progressWrap} aria-label={`Progression : ${progressPct}%`}>
          <div className={styles.progressTrack}>
            <span className={styles.progressFill} style={{ width: `${Math.max(12, progressPct)}%` }} />
          </div>
        </div>
      )}

      {/* ── Liste en direct des joueurs de la table ── */}
      <div className={styles.roster} role="list" aria-label="Joueurs pour la revanche">
        <AnimatePresence mode="popLayout">
          {roomPlayers.map((player, idx) => {
            const isSelf = player.uid === currentUid;
            const isRoomHost = player.uid === hostId;
            // Honnêteté stricte : côté invité, l'hôte a toujours `ready:true` en DB
            // après resetRoomAfterMatch, donc on n'affiche « Prêt ✓ » pour l'hôte
            // que si c'est nous-même qui venons de demander la revanche.
            const confirmed = isSelf || (!isRoomHost && player.ready);
            const hostPresent = isRoomHost && !isSelf;

            return (
              <motion.div
                key={player.uid}
                layout={animate}
                role="listitem"
                initial={animate ? { opacity: 0, y: 10, scale: 0.97 } : false}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={animate ? { opacity: 0, x: -16, scale: 0.94 } : undefined}
                transition={{
                  type: "spring",
                  stiffness: 430,
                  damping: 30,
                  delay: animate ? idx * 0.05 : 0,
                }}
                className={`${styles.playerRow}${confirmed ? ` ${styles.playerReady}` : hostPresent ? ` ${styles.playerHostWait}` : ""}`}
              >
                <span className={styles.avatarWrap}>
                  {confirmed && allowLoops && <span className={styles.avatarGlow} aria-hidden="true" />}
                  <AvatarIllustration seed={player.emoji} size={40} active={confirmed} />
                </span>

                <span className={styles.playerInfo}>
                  <span className={styles.playerNameRow}>
                    <strong>{player.name}</strong>
                    {isSelf && <span className={styles.youTag}>Toi</span>}
                    {isRoomHost && <span className={styles.hostTag}>Hôte</span>}
                  </span>
                  <span className={styles.playerSub}>
                    {confirmed
                      ? "A validé la revanche"
                      : hostPresent
                        ? "Présent à la table"
                        : "En cours de décision…"}
                  </span>
                </span>

                <span
                  className={`${styles.stateBadge} ${
                    confirmed
                      ? styles.stateReady
                      : hostPresent
                        ? styles.stateHost
                        : styles.statePending
                  }`}
                >
                  {confirmed ? "✓ Prêt" : hostPresent ? "À table" : "En attente"}
                </span>
              </motion.div>
            );
          })}

          {departedPlayers.map((player) => (
            <motion.div
              key={`left-${player.name}`}
              role="listitem"
              initial={animate ? { opacity: 0 } : false}
              animate={{ opacity: 0.56 }}
              className={`${styles.playerRow} ${styles.playerLeft}`}
            >
              <span className={styles.avatarWrap}>
                <AvatarIllustration seed={player.emoji} size={40} />
              </span>
              <span className={styles.playerInfo}>
                <span className={styles.playerNameRow}>
                  <strong>{player.name}</strong>
                </span>
                <span className={styles.playerSub}>A quitté la salle</span>
              </span>
              <span className={`${styles.stateBadge} ${styles.stateLeft}`}>Parti</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* ── Actions pied de page ── */}
      <footer className={styles.footer}>
        {tableEmpty ? (
          <button
            data-nj-skin="none"
            type="button"
            className={styles.ctaGold}
            onClick={onLeave}
          >
            <span aria-hidden="true">⌂</span>
            <span>Retour au salon</span>
          </button>
        ) : (
          <>
            <button
              data-nj-skin="none"
              type="button"
              className={styles.ctaSecondary}
              onClick={onShowResult}
            >
              <span aria-hidden="true">←</span>
              <span>Résultat</span>
            </button>
            <button
              data-nj-skin="none"
              type="button"
              className={styles.ctaDanger}
              onClick={onLeave}
            >
              <span aria-hidden="true">⌂</span>
              <span>Quitter</span>
            </button>
          </>
        )}
      </footer>
    </motion.div>
  );
}
