"use client";

import { useCallback, useEffect, useState } from "react";
import { useLobby } from "@/contexts/LobbyContext";
import { useAuth } from "@/hooks/useAuth";
import { NKAP } from "@/data/mock";
import { NjamboIcon } from "@/components/ui/Art";
import { Btn } from "@/components/ui/Btn";
import { Chip } from "@/components/ui/Chip";
import { HubReveal } from "@/components/ui/HubReveal";
import {
  PreGameFooter,
  PreGameLayout,
  PreGameWorkspace,
} from "@/components/ui/PreGameLayout";
import { Surface } from "@/components/ui/Shell";
import { SocialActions } from "@/components/social/SocialActions";
import styles from "./PreGameScreens.module.css";

interface LobbyScreenProps {
  onGameStart: () => void;
  onBack: () => void;
}

export function LobbyScreen({ onGameStart, onBack }: LobbyScreenProps) {
  const { user } = useAuth();
  const { currentRoom, roomError, leaveRoom, setReady, startGame, clearError } = useLobby();
  const [copied, setCopied] = useState(false);

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
    setTimeout(() => setCopied(false), 2000);
  }, [currentRoom]);

  const handleLeave = useCallback(async () => {
    await leaveRoom();
    clearError();
    onBack();
  }, [leaveRoom, clearError, onBack]);

  const handleToggleReady = useCallback(async () => {
    const myReady = currentRoom?.players.find((player) => player.uid === user?.uid)?.ready;
    await setReady(!myReady);
  }, [currentRoom, user, setReady]);

  const handleStart = useCallback(async () => {
    await startGame();
  }, [startGame]);

  const players = currentRoom?.players ?? [];
  const guestPlayers = players.filter((player) => player.uid !== currentRoom?.hostId);
  const readyGuestCount = guestPlayers.filter((player) => player.ready).length;
  const guestsReady = guestPlayers.length > 0 && readyGuestCount === guestPlayers.length;
  const canStart = players.length >= 2 && guestsReady;
  const myReady = players.find((player) => player.uid === user?.uid)?.ready ?? false;
  const hostWaitLabel = guestPlayers.length === 0
    ? "En attente d'un joueur"
    : `En attente (${readyGuestCount}/${guestPlayers.length} prêts)`;

  const roomSummary = (
    <div className={styles.railStack}>
      <Surface className={`nj-panel-pad-sm ${styles.panel}`}>
        <div className={styles.panelHeading}>
          <h2>Code de la salle</h2>
          <p>Partage ce code avec tes amis.</p>
        </div>
        <div className={styles.roomCodeRow} style={{ marginTop: 12 }}>
          <code className={styles.roomCode}>{currentRoom?.code ?? "------"}</code>
          <Btn
            variant="ghost"
            onClick={handleCopyCode}
            ariaLabel="Copier le code de la salle"
            icon={<NjamboIcon name="copy" tone="gold" size={20} />}
          >
            <span aria-live="polite">{copied ? "Copié" : "Copier"}</span>
          </Btn>
        </div>
      </Surface>

      <Surface className={`nj-panel-pad-sm ${styles.panel}`}>
        <div className={styles.summaryRow}>
          <span className={styles.summaryLabel}>
            <strong>Mise par manche</strong>
            <span>La mise est verrouillée pour cette salle.</span>
          </span>
          <span className={styles.potValue}>{NKAP(currentRoom?.stake ?? 0)}</span>
        </div>
        <div style={{ marginTop: 12 }}>
          <Chip strong>
            {players.length} joueur{players.length > 1 ? "s" : ""} / {currentRoom?.maxPlayers ?? 4}
          </Chip>
        </div>
      </Surface>
    </div>
  );

  return (
    <PreGameLayout
      title="Salle d'attente"
      kicker="Préparez-vous"
      subtitle="Partage le code, vérifie les présences puis lance la partie quand tout le monde est prêt."
      icon="online"
      tone="teal"
      onBack={() => { void handleLeave(); }}
      backLabel="Quitter"
      backAriaLabel="Quitter la salle"
    >
      <PreGameWorkspace
        rail={roomSummary}
        railLabel="Informations de la salle"
      >
        <Surface className={`nj-panel-pad-sm ${styles.listPanel}`}>
          <div className={styles.panelHeader}>
            <div className={styles.panelHeading}>
              <h2>Joueurs</h2>
              <p>{isHost ? "Les invités doivent confirmer leur présence." : "Signale à l'hôte quand tu es prêt."}</p>
            </div>
            <Chip tone="teal">{readyGuestCount}/{guestPlayers.length} prêts</Chip>
          </div>

          <div className={styles.listBody} aria-live="polite">
            {players.map((player, index) => {
              const isRoomHost = player.uid === currentRoom?.hostId;
              const isReady = isRoomHost || player.ready;
              return (
                <HubReveal key={player.uid} className={styles.listReveal} order={index}>
                  <div className={`nj-list-card${isReady ? " nj-list-card--teal is-active" : ""} ${styles.playerCard}`}>
                    <span style={{ fontSize: 28 }} aria-hidden="true">{player.emoji}</span>
                    <span className={styles.playerIdentity}>
                      <span className={styles.playerName}>
                        {player.name}
                        {isRoomHost && <span className={styles.hostBadge}>HÔTE</span>}
                      </span>
                      <span className={styles.playerState}>{isRoomHost ? "Hôte" : isReady ? "Prêt" : "En attente…"}</span>
                    </span>
                    <span
                      className={`${styles.readyDot}${isReady ? ` ${styles.readyDotActive}` : ""}`}
                      aria-label={isReady ? "Prêt" : "En attente"}
                      role="img"
                    />
                    {player.uid !== user?.uid && (
                      <span className={styles.socialActions}>
                        <SocialActions player={player} compact />
                      </span>
                    )}
                  </div>
                </HubReveal>
              );
            })}
          </div>
        </Surface>
      </PreGameWorkspace>

      <PreGameFooter status={roomError ? <div className={styles.error} role="alert">{roomError}</div> : undefined}>
        <div className={styles.actions}>
          {isHost ? (
            <Btn
              variant="pink"
              onClick={() => { void handleStart(); }}
              disabled={!canStart}
              icon={<NjamboIcon name="play" tone="light" size={20} />}
            >
              {canStart ? "Lancer la partie" : hostWaitLabel}
            </Btn>
          ) : (
            <Btn
              variant="pink"
              onClick={() => { void handleToggleReady(); }}
              icon={<NjamboIcon name={myReady ? "check" : "play"} tone="light" size={20} />}
              ariaPressed={myReady}
            >
              {myReady ? "Prêt ✓" : "Je suis prêt"}
            </Btn>
          )}
        </div>
      </PreGameFooter>
    </PreGameLayout>
  );
}
