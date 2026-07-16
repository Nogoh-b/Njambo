"use client";

import { useEffect, useState } from "react";
import { T } from "@/config/theme";
import { useGame } from "@/contexts/GameContext";
import { useLobby } from "@/contexts/LobbyContext";
import { useAuth } from "@/hooks/useAuth";
import { useEconomy } from "@/contexts/EconomyContext";
import { getEntranceAnimationStyle, useMotionProfile } from "@/lib/motion";
import { listenDiscoverPlayers } from "@/lib/socialData";
import { NKAP } from "@/data/mock";
import { Btn } from "@/components/ui/Btn";
import { Chip } from "@/components/ui/Chip";
import { AvatarIllustration, NjamboIcon } from "@/components/ui/Art";
import { ScreenHeader, Shell, Surface } from "@/components/ui/Shell";
import { AuthGate } from "@/components/ui/AuthGate";
import { SocialActions } from "@/components/social/SocialActions";
import { EquippedPowersBar } from "@/components/power/EquippedPowersBar";
import type { PublicPlayerProfile } from "@/types/game";

/* ═══════════════ OnlineSetupScreen — matchmaking en ligne ═══════════════ */

export function OnlineSetupScreen() {
  const { navigateTo, cfg } = useGame();
  const { user } = useAuth();
  const { economy } = useEconomy();
  const motion = useMotionProfile();
  const { createRoom, joinRoomById, findAvailableRoom, publicRooms, searchRooms, roomError, clearError } = useLobby();
  const [playerSearch, setPlayerSearch] = useState("");
  const [players, setPlayers] = useState<PublicPlayerProfile[]>([]);
  const [selectedStake, setSelectedStake] = useState(cfg.stakes[1]);
  const [maxPlayers, setMaxPlayers] = useState(2);
  const [busy, setBusy] = useState(false);
  const canPayEnergy = economy?.energy.unlimited || (economy?.energy.available ?? 0) >= 10;
  const canPayStake = (economy?.nkap ?? 0) >= selectedStake;

  useEffect(() => searchRooms(), [searchRooms]);
  const canStart = Boolean(user && !user.isAnonymous && canPayEnergy && canPayStake);

  useEffect(() => {
    const unsub = listenDiscoverPlayers(user?.uid, playerSearch, setPlayers);
    return unsub;
  }, [playerSearch, user?.uid]);

  /* ---- Navigation helpers ---- */
  const goBack = () => navigateTo("menu");
  const goToLobby = () => navigateTo("lobby");

  /* ---- Créer une salle ---- */
  const handleCreate = async () => {
    try {
      setBusy(true);
      clearError();
      await createRoom(selectedStake, maxPlayers);
      goToLobby();
    } catch {
      // Error handled by useLobby
    } finally {
      setBusy(false);
    }
  };

  /* ---- Rejoindre une salle publique ---- */
  const handleJoinRoom = async (roomId: string) => {
    setBusy(true);
    try {
      clearError();
      const joined = await joinRoomById(roomId);
      if (joined) goToLobby();
    } catch {
      // Error handled by useLobby
    } finally {
      setBusy(false);
    }
  };

  /* ---- Auto-match ---- */
  const handleAutoMatch = async () => {
    try {
      setBusy(true);
      clearError();

      const available = await findAvailableRoom({ stake: selectedStake });
      if (available) {
        const joined = await joinRoomById(available.id);
        if (joined) goToLobby();
      }
    } catch {
      // Error handled by useLobby
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell>
      <div className="nj-safe">
        <div className="nj-phone">
          <ScreenHeader
            title="En ligne"
            kicker="Quartiers connectés"
            icon="online"
            tone="teal"
            onBack={goBack}
          />

          <AuthGate>
            <div className="nj-stack">
              {/* Barre fixe : config + actions */}
              <Surface style={{ flex: "0 0 auto", padding: "clamp(14px, 4vw, 18px)" }}>
                {!canPayEnergy && <div className="nj-liveops-notice" style={{ marginBottom: 8 }}>Il faut 10 énergie pour une manche classée.</div>}
                {!canPayStake && <div className="nj-liveops-notice" style={{ marginBottom: 8 }}>Nkap insuffisants pour cette mise.</div>}
                <div className="nj-subtle" style={{ fontSize: 12, marginBottom: 8 }}>Mise par manche</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6, marginBottom: 14 }}>
                  {cfg.stakes.map((m) => (
                    <Btn
                      key={m}
                      variant={selectedStake === m ? "gold" : "ghost"}
                      onClick={() => setSelectedStake(m)}
                      style={{ width: "100%", minHeight: 34, fontSize: 13 }}
                    >
                      {NKAP(m)}
                    </Btn>
                  ))}
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, marginBottom: 8 }}>
                  <span className="nj-subtle" style={{ fontSize: 12 }}>Nombre de joueurs</span>
                  <span className="nj-subtle" style={{ fontSize: 12 }}>Pot {NKAP(selectedStake * maxPlayers)}</span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6, marginBottom: 14 }}>
                  {[2, 3, 4].map((n) => (
                    <Btn
                      key={`n${n}`}
                      variant={maxPlayers === n ? "gold" : "ghost"}
                      onClick={() => setMaxPlayers(n)}
                      style={{ width: "100%", minHeight: 34, fontSize: 13 }}
                    >
                      {n}
                    </Btn>
                  ))}
                </div>
                <div style={{ marginBottom: 12 }}>
                  <EquippedPowersBar />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <Btn
                    variant="gold"
                    onClick={handleCreate}
                    disabled={busy || !canStart}
                    style={{ width: "100%" }}
                    icon={<NjamboIcon name="home" tone="gold" size={18} />}
                  >
                    {busy ? "…" : "Créer"}
                  </Btn>
                  <Btn
                    variant="ghost"
                    disabled={busy || !canStart}
                    style={{ width: "100%" }}
                    icon={<NjamboIcon name="play" tone="gold" size={18} />}
                    onClick={handleAutoMatch}
                  >
                    {busy ? "…" : "Trouver"}
                  </Btn>
                </div>
              </Surface>

              {/* Joueurs en ligne — scrollable */}
              <Surface className="nj-panel-pad-sm" style={{ flex: "1 1 200px", minHeight: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: 12 }}>
                  <div>
                    <div style={{ fontWeight: 900 }}>Joueurs</div>
                    <div className="nj-subtle">Ajoute, invite ou envoie un message.</div>
                  </div>
                  <Chip tone="teal">{players.length}</Chip>
                </div>
                <input
                  value={playerSearch}
                  onChange={(e) => setPlayerSearch(e.target.value)}
                  placeholder="Rechercher un joueur"
                  className="nj-input"
                  style={{ width: "100%", marginBottom: 10, flex: "0 0 auto" }}
                />
                <div style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "grid", gap: 8, alignContent: "start", paddingRight: 2 }}>
                  {players.map((player, i) => (
                    <div
                      key={player.uid}
                      className={`nj-list-card${player.online ? " nj-list-card--teal is-active" : ""}`}
                      style={getEntranceAnimationStyle(motion, i)}
                    >
                      <AvatarIllustration seed={player.emoji} size={42} online={player.online} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 900, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{player.name}</div>
                        <div className="nj-subtle">{player.online ? "En ligne" : "Hors ligne"}</div>
                      </div>
                      <SocialActions player={player} compact />
                    </div>
                  ))}
                </div>
              </Surface>

              {/* Salles publiques — scrollable séparément */}
              {publicRooms.length > 0 && (
                <Surface className="nj-panel-pad-sm" style={{ flex: "1 1 160px", minHeight: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flex: "0 0 auto" }}>
                    <div style={{ fontWeight: 900 }}>Salles disponibles</div>
                    <Chip>{publicRooms.length} salle{publicRooms.length > 1 ? "s" : ""}</Chip>
                  </div>
                  <div style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "grid", gap: 9, alignContent: "start", paddingRight: 2 }}>
                    {publicRooms.map((room) => (
                      <button data-nj-skin="dark"
                        key={room.id}
                        type="button"
                        disabled={busy || !canStart || room.stake > (economy?.nkap ?? 0)}
                        onClick={() => handleJoinRoom(room.id)}
                        className="nj-list-card nj-list-card--teal"
                        style={{
                          justifyContent: "space-between",
                          cursor: busy ? "not-allowed" : "pointer",
                          opacity: busy ? 0.5 : 1,
                        }}
                      >
                        <span>
                          <span style={{ fontFamily: "monospace", fontWeight: 900, color: T.gold, letterSpacing: ".1em", fontSize: 15 }}>
                            {room.code}
                          </span>
                          <span className="nj-subtle" style={{ marginLeft: 10, fontSize: 13 }}>
                            {NKAP(room.stake)} · {room.players.length}/{room.maxPlayers}
                          </span>
                        </span>
                        <NjamboIcon name="play" tone="teal" size={20} />
                      </button>
                    ))}
                  </div>
                </Surface>
              )}

              {/* Erreur */}
              {roomError && (
                <div style={{ color: T.bad, fontSize: 13, textAlign: "center" }}>{roomError}</div>
              )}
            </div>
          </AuthGate>
        </div>
      </div>
    </Shell>
  );
}
