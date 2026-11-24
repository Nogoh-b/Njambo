"use client";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useLobby } from "@/contexts/LobbyContext";
import { useAuth } from "@/hooks/useAuth";
import { useMotionProfile } from "@/lib/motion";
import { NKAP } from "@/data/mock";
import { AvatarIllustration, NjamboIcon } from "@/components/ui/Art";
import { Btn } from "@/components/ui/Btn";
import { GameModal } from "@/components/ui/GameModal";
import { GameShell } from "@/components/ui/GameShell";
import { SocialActions } from "@/components/social/SocialActions";
import styles from "./LobbyScreen.module.css";
import { sysAsset } from "@/lib/assetPack";

const NKAP_COIN_SRC = sysAsset("/assets/njambo/economy/nkap-64.webp");

interface LobbyScreenProps {
  onGameStart: () => void;
  onBack: () => void;
  onBackRequestRef?: { current: (() => "stay" | "handled") | null };
}

export function LobbyScreen({ onGameStart, onBack, onBackRequestRef }: LobbyScreenProps) {
  const { user } = useAuth();
  const motionProfile = useMotionProfile();
  const { currentRoom, roomError, leaveRoom, setReady, startGame, clearError } = useLobby();
  const [copied, setCopied] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);

  useEffect(() => {
    if (currentRoom?.status === "playing") {
      onGameStart();
    }
  }, [currentRoom?.status, onGameStart]);

  const isHost = currentRoom?.hostId === user?.uid;

  const handleCopyCode = useCallback(() => {
    if (!currentRoom?.code) return;
    navigator.clipboard?.writeText(currentRoom.code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }, [currentRoom]);

  const handleLeave = useCallback(async () => {
    setConfirmLeave(false);
    await leaveRoom();
    clearError();
    onBack();
  }, [leaveRoom, clearError, onBack]);

  const handleRequestLeave = useCallback(() => {
    const othersPresent = (currentRoom?.players.length ?? 0) > 1;
    if (othersPresent) {
      setConfirmLeave(true);
    } else {
      void handleLeave();
    }
  }, [currentRoom?.players.length, handleLeave]);

  useEffect(() => {
    if (!onBackRequestRef) return;
    onBackRequestRef.current = () => {
      if (confirmLeave) {
        setConfirmLeave(false);
        return "stay";
      }
      if ((currentRoom?.players.length ?? 0) > 1) {
        setConfirmLeave(true);
        return "stay";
      }
      void handleLeave();
      return "handled";
    };
    return () => { onBackRequestRef.current = null; };
  }, [confirmLeave, currentRoom?.players.length, handleLeave, onBackRequestRef]);

  const handleToggleReady = useCallback(async () => {
    const myReady = currentRoom?.players.find((player) => player.uid === user?.uid)?.ready;
    await setReady(!myReady);
  }, [currentRoom, user, setReady]);

  const handleStart = useCallback(async () => {
    await startGame();
  }, [startGame]);

  const players = currentRoom?.players ?? [];
  const maxPlayers = currentRoom?.maxPlayers ?? 4;
  const guestPlayers = players.filter((player) => player.uid !== currentRoom?.hostId);
  const readyGuestCount = guestPlayers.filter((player) => player.ready).length;
  const guestsReady = guestPlayers.length > 0 && readyGuestCount === guestPlayers.length;
  const canStart = players.length >= 2 && guestsReady;
  const myReady = players.find((player) => player.uid === user?.uid)?.ready ?? false;
  const emptySlots = Math.max(0, maxPlayers - players.length);
  const stake = currentRoom?.stake ?? 0;
  const isFriendsRoom = currentRoom?.roomType === "friends";
  const animate = motionProfile.enabled && !motionProfile.reduced;
  const allowLoops = motionProfile.enabled && motionProfile.allowDecorativeLoop;

  const hostWaitLabel = guestPlayers.length === 0
    ? "En attente d'un joueur…"
    : `En attente (${readyGuestCount}/${guestPlayers.length} prêt${readyGuestCount > 1 ? "s" : ""})`;

  const progressPct = guestPlayers.length === 0
    ? 25
    : Math.round(((readyGuestCount + 1) / Math.max(2, players.length)) * 100);

  return (
    <GameShell dock={false} scroll={false} contentClassName={styles.shell}>
      <div className={styles.spotlight} aria-hidden="true" />

      {/* ═══ TOP HUD SALON ROYAL ═══ */}
      <header className={styles.hud}>
        <button
          data-nj-skin="none"
          type="button"
          className={styles.backBtn}
          onClick={handleRequestLeave}
          aria-label="Quitter la salle"
        >
          <span aria-hidden="true">←</span>
          <span>Quitter</span>
        </button>

        <div className={styles.hudCenter}>
          <span className={styles.hudKicker}>
            {isFriendsRoom ? "TABLE PRIVÉE" : "SALLE EN LIGNE"}
          </span>
          <h1 className={styles.hudTitle}>Salle d&apos;attente</h1>
        </div>

        <div className={styles.seatsPill} aria-label={`${players.length} joueurs sur ${maxPlayers}`}>
          <span className={styles.seatsDot} aria-hidden="true" />
          <span>{players.length} / {maxPlayers}</span>
        </div>
      </header>

      {/* ═══ TICKET VIP CODE + MISE NKAP ═══ */}
      <div className={styles.ticketRow}>
        <div className={styles.codeTicket}>
          <span className={styles.cardKicker}>Code d&apos;invitation</span>
          <div className={styles.codeBar}>
            <code className={styles.roomCode}>{currentRoom?.code ?? "------"}</code>
            <button
              data-nj-skin="none"
              type="button"
              className={`${styles.copyBtn}${copied ? ` ${styles.copyBtnDone}` : ""}`}
              onClick={handleCopyCode}
              aria-label="Copier le code de la salle"
            >
              <NjamboIcon name={copied ? "check" : "copy"} tone="gold" size={16} />
              <span aria-live="polite">{copied ? "Copié !" : "Copier"}</span>
            </button>
          </div>
        </div>

        <div className={styles.stakeCard}>
          <span className={styles.cardKicker}>Mise par manche</span>
          <div className={styles.stakeValueRow}>
            <img src={NKAP_COIN_SRC} alt="" className={styles.stakeCoin} draggable={false} />
            <span className={styles.stakeValue}>
              {stake > 0 ? NKAP(stake) : "Amicale"}
            </span>
          </div>
          <span className={styles.stakeHint}>
            {stake > 0 ? "Verrouillée pour la salle" : "Sans mise · entre amis"}
          </span>
        </div>
      </div>

      {/* ═══ TABLE DES JOUEURS ═══ */}
      <section className={styles.board} aria-label="Joueurs dans la salle">
        <div className={styles.boardHead}>
          <div>
            <h2>Joueurs à table</h2>
            <p>
              {isHost
                ? "Les invités doivent confirmer avant le lancement."
                : "Signale à l'hôte dès que tu es prêt."}
            </p>
          </div>
          <span className={styles.readyCounter}>
            {readyGuestCount}/{guestPlayers.length} prêt{readyGuestCount > 1 ? "s" : ""}
          </span>
        </div>

        <div className={styles.progressTrack} aria-hidden="true">
          <span className={styles.progressFill} style={{ width: `${progressPct}%` }} />
        </div>

        <div className={styles.listScroll} aria-live="polite">
          <AnimatePresence mode="popLayout">
            {players.map((player, index) => {
              const isRoomHost = player.uid === currentRoom?.hostId;
              const isSelf = player.uid === user?.uid;
              const isReady = isRoomHost || player.ready;

              return (
                <motion.div
                  key={player.uid}
                  layout={animate}
                  initial={animate ? { opacity: 0, y: 12, scale: 0.97 } : false}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={animate ? { opacity: 0, x: -20, scale: 0.94 } : undefined}
                  transition={{
                    type: "spring",
                    stiffness: 420,
                    damping: 32,
                    delay: animate ? index * 0.05 : 0,
                  }}
                  className={`${styles.seatCard}${isReady ? ` ${styles.seatReady}` : ""}`}
                >
                  <div className={styles.seatLeft}>
                    <span className={styles.avatarBox}>
                      {isReady && allowLoops && <span className={styles.avatarRing} aria-hidden="true" />}
                      <AvatarIllustration seed={player.emoji} size={44} active={isReady} />
                    </span>

                    <div className={styles.seatInfo}>
                      <span className={styles.seatNameRow}>
                        <strong>{player.name}</strong>
                        {isSelf && <span className={styles.youTag}>Toi</span>}
                        {isRoomHost && <span className={styles.hostTag}>Hôte</span>}
                      </span>
                      <span className={`${styles.seatStatus}${isReady ? ` ${styles.seatStatusReady}` : ""}`}>
                        {isRoomHost ? "Chef de table" : isReady ? "Prêt à jouer" : "En attente…"}
                      </span>
                    </div>
                  </div>

                  <div className={styles.seatRight}>
                    <span className={`${styles.readyPill} ${isReady ? styles.readyPillYes : styles.readyPillWait}`}>
                      {isReady ? "✓ Prêt" : "Attente"}
                    </span>
                    {!isSelf && <SocialActions player={player} compact showInvite={false} />}
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>

          {Array.from({ length: emptySlots }, (_, idx) => (
            <div key={`empty-${idx}`} className={styles.emptySeat} aria-hidden="true">
              <span className={styles.emptySeatCircle}>+</span>
              <span>Place libre · Partage le code pour inviter un joueur</span>
            </div>
          ))}
        </div>
      </section>

      {/* ═══ FOOTER ACTION 3D ═══ */}
      <footer className={styles.footer}>
        {roomError && (
          <div className={styles.errorBox} role="alert">{roomError}</div>
        )}

        {isHost ? (
          <button
            data-nj-skin="none"
            type="button"
            className={`${styles.ctaBtn} ${styles.ctaGold}`}
            onClick={() => { void handleStart(); }}
            disabled={!canStart}
          >
            <NjamboIcon name="play" tone="gold" size={20} />
            <span>{canStart ? "Lancer la partie" : hostWaitLabel}</span>
          </button>
        ) : (
          <button
            data-nj-skin="none"
            type="button"
            className={`${styles.ctaBtn} ${myReady ? styles.ctaEmerald : styles.ctaGold}`}
            onClick={() => { void handleToggleReady(); }}
            aria-pressed={myReady}
          >
            <NjamboIcon name={myReady ? "check" : "play"} tone="gold" size={20} />
            <span>{myReady ? "Prêt ✓ (appuyer pour annuler)" : "Je suis prêt"}</span>
          </button>
        )}
      </footer>

      <GameModal
        open={confirmLeave}
        onClose={() => setConfirmLeave(false)}
        title="Quitter la salle ?"
        kicker="Salle d'attente"
        tone="pink"
        size="sm"
        footer={(
          <div style={{ display: "flex", gap: 10, width: "100%" }}>
            <Btn tone="teal" fill="soft" size="md" onClick={() => setConfirmLeave(false)} style={{ flex: 1 }}>
              Rester
            </Btn>
            <Btn tone="red" fill="solid" size="md" onClick={() => { void handleLeave(); }} style={{ flex: 1 }}>
              Quitter
            </Btn>
          </div>
        )}
      >
        <p style={{ margin: 0, lineHeight: 1.45 }}>
          {isHost
            ? "D'autres joueurs t'attendent dans cette salle. Es-tu sûr de vouloir la quitter ?"
            : "Tu vas libérer ta place dans la salle d'attente."}
        </p>
      </GameModal>
    </GameShell>
  );
}
