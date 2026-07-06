"use client";

import React, { useCallback, useEffect } from "react";
import { T } from "@/config/theme";
import { useLobby } from "@/contexts/LobbyContext";
import { useAuth } from "@/hooks/useAuth";
import { FCFA } from "@/data/mock";
import { NjamboIcon } from "@/components/ui/Art";
import { Btn } from "@/components/ui/Btn";
import { Chip } from "@/components/ui/Chip";
import { ScreenHeader, Shell, Surface, displayFont } from "@/components/ui/Shell";

/* ═══════════════ LobbyScreen — salle d&apos;attente ═══════════════
   Affichée entre le setup et le début de la partie.
   Les joueurs rejoignent, se mettent "Prêt", et l&apos;hôte lance.
   Tout l&apos;état vient du LobbyContext (currentRoom partagé). */

interface LobbyScreenProps {
  onGameStart: () => void;
  onBack: () => void;
}

export function LobbyScreen({
  onGameStart,
  onBack,
}: LobbyScreenProps) {
  const { user } = useAuth();
  const { currentRoom, roomError, leaveRoom, setReady, startGame, clearError } = useLobby();
  const [copied, setCopied] = React.useState(false);

  /* Détecter quand la partie démarre (status passe à "playing") */
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
    const myReady = currentRoom?.players.find((p) => p.uid === user?.uid)?.ready;
    await setReady(!myReady);
  }, [currentRoom, user, setReady]);

  const handleStart = useCallback(async () => {
    await startGame();
  }, [startGame]);

  const players = currentRoom?.players ?? [];
  const guestPlayers = players.filter((p) => p.uid !== currentRoom?.hostId);
  const readyGuestCount = guestPlayers.filter((p) => p.ready).length;
  const guestsReady = guestPlayers.length > 0 && readyGuestCount === guestPlayers.length;
  const canStart = players.length >= 2 && guestsReady;
  const hostWaitLabel = guestPlayers.length === 0
    ? "En attente d'un joueur"
    : `En attente (${readyGuestCount}/${guestPlayers.length} prêts)`;

  return (
    <Shell>
      <div className="nj-safe">
        <div className="nj-phone">
          <ScreenHeader
            title="Salle d&apos;attente"
            kicker="Préparez-vous"
            icon="online"
            tone="teal"
            onBack={handleLeave}
          />

          <div className="nj-stack">
            {/* Code de la salle */}
            <Surface
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
              }}
            >
              <div>
                <div style={{ fontWeight: 900 }}>Code de la salle</div>
                <div className="nj-subtle">Partage ce code avec tes amis</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div
                  className="nj-input"
                  style={{
                    fontFamily: "monospace",
                    fontWeight: 900,
                    fontSize: 22,
                    letterSpacing: ".16em",
                    color: T.gold,
                    padding: "8px 16px",
                  }}
                >
                  {currentRoom?.code ?? "------"}
                </div>
                <Btn variant="ghost" onClick={handleCopyCode} ariaLabel="Copier le code" icon={<NjamboIcon name="copy" tone="gold" size={20} />}>
                  {copied ? "Copié" : "Copier"}
                </Btn>
              </div>
            </Surface>

            {/* Mise + Pot */}
            <Surface
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 12,
              }}
            >
              <span>
                <span className="nj-subtle">Mise par manche</span>
                <span style={{ ...displayFont, display: "block", color: T.gold, fontWeight: 900, fontSize: "clamp(18px, 5vw, 22px)" }}>
                  {FCFA(currentRoom?.stake ?? 0)}
                </span>
              </span>
              <Chip strong>
                {currentRoom?.players.length ?? 0} joueur{((currentRoom?.players.length ?? 0) > 1) ? "s" : ""} / {currentRoom?.maxPlayers ?? 4}
              </Chip>
            </Surface>

            {/* Liste des joueurs */}
            <Surface>
              <div style={{ fontWeight: 900, marginBottom: 12 }}>Joueurs</div>
              <div className="nj-stack" style={{ gap: 9 }}>
                {players.map((p, i) => {
                  const isRoomHost = p.uid === currentRoom?.hostId;
                  const isReady = isRoomHost || p.ready;
                  return (
                    <div
                      key={p.uid}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        padding: "11px 12px",
                        borderRadius: 16,
                        background: isReady ? `${T.teal}1a` : "rgba(255,248,232,.055)",
                        border: isReady ? `1.5px solid ${T.teal}` : "1px solid rgba(255,248,232,.11)",
                        animation: `riseIn .3s ${i * 0.05}s both`,
                      }}
                    >
                      <span style={{ fontSize: 28 }}>{p.emoji}</span>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: "block", fontWeight: 900, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {p.name}
                          {p.uid === currentRoom?.hostId && (
                            <span style={{ marginLeft: 8, fontSize: 11, color: T.gold, fontWeight: 700 }}>HÔTE</span>
                          )}
                        </span>
                        <span className="nj-subtle">
                          {isRoomHost ? "Hôte" : isReady ? "Prêt" : "En attente…"}
                        </span>
                      </span>
                      <span
                        style={{
                          width: 10,
                          height: 10,
                          borderRadius: "50%",
                          background: isReady ? T.teal : "rgba(255,255,255,.25)",
                        }}
                      />
                    </div>
                  );
                })}
              </div>
            </Surface>

            {/* Erreur */}
            {roomError && (
              <div style={{ color: T.bad, fontSize: 13, textAlign: "center" }}>
                {roomError}
              </div>
            )}

            {/* Actions */}
            {isHost ? (
              <Btn
                variant="pink"
                onClick={handleStart}
                disabled={!canStart}
                style={{ width: "100%" }}
                icon={<NjamboIcon name="play" tone="light" size={20} />}
              >
                {canStart ? "Lancer la partie" : hostWaitLabel}
              </Btn>
            ) : (
              <Btn
                variant="pink"
                onClick={handleToggleReady}
                style={{ width: "100%" }}
                icon={<NjamboIcon name={currentRoom?.players.find((p) => p.uid === user?.uid && p.ready) ? "check" : "play"} tone="light" size={20} />}
              >
                {currentRoom?.players.find((p) => p.uid === user?.uid && p.ready) ? "Prêt ✓" : "Je suis prêt"}
              </Btn>
            )}
          </div>
        </div>
      </div>
    </Shell>
  );
}
