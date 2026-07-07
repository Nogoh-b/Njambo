"use client";

import { useEffect, useState } from "react";
import { T } from "@/config/theme";
import { useGame } from "@/contexts/GameContext";
import { useLobby } from "@/contexts/LobbyContext";
import { useAuth } from "@/hooks/useAuth";
import { listenDiscoverPlayers } from "@/lib/socialData";
import { FCFA } from "@/data/mock";
import { Btn } from "@/components/ui/Btn";
import { Chip } from "@/components/ui/Chip";
import { AvatarIllustration, NjamboIcon } from "@/components/ui/Art";
import { ScreenHeader, Shell, Surface } from "@/components/ui/Shell";
import { AuthGate } from "@/components/ui/AuthGate";
import { SocialActions } from "@/components/social/SocialActions";
import type { PublicPlayerProfile } from "@/types/game";

/* ═══════════════ OnlineSetupScreen — matchmaking en ligne ═══════════════ */

export function OnlineSetupScreen() {
  const { navigateTo, cfg } = useGame();
  const { user } = useAuth();
  const { createRoom, joinRoomByCode, joinRoomById, findAvailableRoom, publicRooms, roomError, clearError } = useLobby();
  const [joinCode, setJoinCode] = useState("");
  const [playerSearch, setPlayerSearch] = useState("");
  const [players, setPlayers] = useState<PublicPlayerProfile[]>([]);
  const [selectedStake, setSelectedStake] = useState(cfg.stakes[1]);
  const [maxPlayers, setMaxPlayers] = useState(2);
  const [busy, setBusy] = useState(false);

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

  /* ---- Rejoindre par code ---- */
  const handleJoinCode = async () => {
    if (joinCode.length < 4) return;
    try {
      setBusy(true);
      clearError();
      const foundId = await joinRoomByCode(joinCode);
      if (foundId) goToLobby();
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

          <div className="nj-stack">
            <AuthGate>
              {/* Créer / Rejoindre */}
              <Surface>
                <div style={{ fontWeight: 900, marginBottom: 12 }}>Créer ou rejoindre</div>
                <div className="nj-stack" style={{ gap: 10 }}>
                  <Btn
                    variant="gold"
                    onClick={handleCreate}
                    disabled={busy}
                    style={{ width: "100%" }}
                    icon={<NjamboIcon name="home" tone="gold" size={20} />}
                  >
                    {busy ? "Création…" : "Créer une salle"}
                  </Btn>
                  <Btn
                    variant="ghost"
                    disabled={busy}
                    style={{ width: "100%" }}
                    icon={<NjamboIcon name="play" tone="gold" size={20} />}
                    onClick={handleAutoMatch}
                  >
                    {busy ? "Recherche…" : "Trouver une table"}
                  </Btn>
                </div>
              </Surface>

              {/* Rejoindre par code */}
              <Surface>
                <div style={{ fontWeight: 900, marginBottom: 12 }}>Rejoindre avec un code</div>
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    value={joinCode}
                    onChange={(e) => { setJoinCode(e.target.value.toUpperCase()); clearError(); }}
                    placeholder="NJAM7K2"
                    maxLength={7}
                    className="nj-input"
                    style={{
                      flex: 1,
                      fontFamily: "monospace",
                      fontWeight: 900,
                      letterSpacing: ".1em",
                      textAlign: "center",
                      textTransform: "uppercase",
                    }}
                  />
                  <Btn variant="pink" onClick={handleJoinCode} disabled={busy || joinCode.length < 4}>
                    {busy ? "…" : "Rejoindre"}
                  </Btn>
                </div>
              </Surface>

              {/* Configuration */}
              <Surface>
                <div style={{ fontWeight: 900, marginBottom: 12 }}>Configuration</div>
                <div style={{ marginBottom: 12 }}>
                  <div className="nj-subtle" style={{ marginBottom: 7 }}>Mise par manche</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10 }}>
                    {cfg.stakes.map((m) => (
                      <Btn
                        key={m}
                        variant={selectedStake === m ? "gold" : "ghost"}
                        onClick={() => setSelectedStake(m)}
                        style={{ width: "100%" }}
                      >
                        {FCFA(m)}
                      </Btn>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="nj-subtle" style={{ marginBottom: 7 }}>Nombre de joueurs</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10 }}>
                    {[2, 3, 4].map((n) => (
                      <Btn
                        key={n}
                        variant={maxPlayers === n ? "gold" : "ghost"}
                        onClick={() => setMaxPlayers(n)}
                        style={{ width: "100%" }}
                      >
                        {n} joueurs
                      </Btn>
                    ))}
                  </div>
                </div>
              </Surface>

              <Surface>
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
                  style={{ width: "100%", marginBottom: 10 }}
                />
                <div className="nj-stack" style={{ gap: 8 }}>
                  {players.slice(0, 6).map((player, i) => (
                    <div
                      key={player.uid}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        padding: "10px",
                        borderRadius: 15,
                        background: "rgba(255,248,232,.052)",
                        border: player.online ? `1px solid ${T.teal}55` : "1px solid rgba(255,248,232,.1)",
                        animation: `riseIn .3s ${i * 0.04}s both`,
                      }}
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

              {/* Salles publiques */}
              <Surface>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <div style={{ fontWeight: 900 }}>Salles disponibles</div>
                  <Chip>{publicRooms.length} salle{publicRooms.length > 1 ? "s" : ""}</Chip>
                </div>
                {publicRooms.length === 0 ? (
                  <div style={{ textAlign: "center", opacity: 0.5, padding: 20 }}>
                    <div style={{ fontWeight: 700 }}>Aucune salle ouverte</div>
                    <div className="nj-subtle" style={{ marginTop: 4 }}>
                      Crée une salle ou reviens plus tard.
                    </div>
                  </div>
                ) : (
                  <div className="nj-stack" style={{ gap: 9 }}>
                    {publicRooms.slice(0, 5).map((room) => (
                      <button
                        key={room.id}
                        type="button"
                        disabled={busy}
                        onClick={() => handleJoinRoom(room.id)}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          padding: "12px",
                          borderRadius: 16,
                          background: "rgba(255,248,232,.055)",
                          border: "1px solid rgba(255,248,232,.11)",
                          color: T.text,
                          cursor: busy ? "not-allowed" : "pointer",
                          width: "100%",
                          textAlign: "left",
                          opacity: busy ? 0.5 : 1,
                        }}
                      >
                        <span>
                          <span style={{ fontFamily: "monospace", fontWeight: 900, color: T.gold, letterSpacing: ".1em", fontSize: 15 }}>
                            {room.code}
                          </span>
                          <span className="nj-subtle" style={{ marginLeft: 10, fontSize: 13 }}>
                            {FCFA(room.stake)} · {room.players.length}/{room.maxPlayers}
                          </span>
                        </span>
                        <NjamboIcon name="play" tone="teal" size={20} />
                      </button>
                    ))}
                  </div>
                )}
              </Surface>

              {/* Erreur */}
              {roomError && (
                <div style={{ color: T.bad, fontSize: 13, textAlign: "center" }}>{roomError}</div>
              )}
            </AuthGate>
          </div>
        </div>
      </div>
    </Shell>
  );
}
