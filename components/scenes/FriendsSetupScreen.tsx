"use client";

import { useState } from "react";
import { T } from "@/config/theme";
import { useGame } from "@/contexts/GameContext";
import { useLobby } from "@/contexts/LobbyContext";
import { useOnlinePlayers } from "@/hooks/useOnlinePlayers";
import { FCFA } from "@/data/mock";
import { AvatarIllustration, NjamboIcon } from "@/components/ui/Art";
import { Btn } from "@/components/ui/Btn";
import { Chip } from "@/components/ui/Chip";
import { ScreenHeader, Shell, Surface, displayFont } from "@/components/ui/Shell";
import { AuthGate } from "@/components/ui/AuthGate";

export function FriendsSetupScreen() {
  const { navigateTo, profile, cfg } = useGame();
  const { createRoom, joinRoomByCode, roomError, clearError } = useLobby();
  const { players, loading } = useOnlinePlayers();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [joinCode, setJoinCode] = useState("");
  const [mise, setMise] = useState(cfg.stakes[1]);
  const [busy, setBusy] = useState(false);

  const toggleFriend = (uid: string, online: boolean) => {
    if (!online) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else if (next.size < 3) next.add(uid);
      return next;
    });
  };

  const totalPlayers = selected.size + 1;
  const canCreate = !busy && profile.balance >= mise && totalPlayers >= 2;

  const handleCreate = async () => {
    if (!canCreate) return;
    try {
      setBusy(true);
      clearError();
      await createRoom(mise, totalPlayers, "friends");
      navigateTo("lobby");
    } catch {
      // Error handled by useLobby
    } finally {
      setBusy(false);
    }
  };

  const handleJoin = async () => {
    if (joinCode.length < 4) return;
    try {
      setBusy(true);
      clearError();
      const foundId = await joinRoomByCode(joinCode);
      if (foundId) navigateTo("lobby");
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
            title="Inviter des amis"
            kicker="Table privee"
            icon="friends"
            tone="pink"
            onBack={() => navigateTo("menu")}
          />

          <div className="nj-stack">
            <AuthGate>
              <Surface>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 12 }}>
                  <div>
                    <div style={{ fontWeight: 900 }}>Joueurs disponibles</div>
                    <div className="nj-subtle">Selectionne jusqu&apos;a 3 joueurs en ligne.</div>
                  </div>
                  <Chip tone="pink">{selected.size}/3</Chip>
                </div>
                <div className="nj-stack" style={{ gap: 9 }}>
                  {loading && <div className="nj-subtle" style={{ textAlign: "center", padding: 14 }}>Chargement des joueurs...</div>}
                  {!loading && players.length === 0 && (
                    <div className="nj-subtle" style={{ textAlign: "center", padding: 14 }}>
                      Aucun autre joueur inscrit pour le moment.
                    </div>
                  )}
                  {players.map((f, i) => {
                    const isSelected = selected.has(f.uid);
                    return (
                      <button
                        type="button"
                        key={f.uid}
                        onClick={() => toggleFriend(f.uid, f.online)}
                        disabled={!f.online}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 12,
                          width: "100%",
                          padding: "11px 12px",
                          borderRadius: 16,
                          background: isSelected ? `${T.pink}1f` : "rgba(255,248,232,.055)",
                          border: isSelected ? `1.5px solid ${T.pink}` : "1px solid rgba(255,248,232,.11)",
                          color: T.text,
                          cursor: f.online ? "pointer" : "not-allowed",
                          opacity: f.online ? 1 : 0.55,
                          textAlign: "left",
                          animation: `riseIn .3s ${i * 0.05}s both`,
                        }}
                      >
                        <span
                          style={{
                            width: 26,
                            height: 26,
                            borderRadius: 9,
                            border: `2px solid ${isSelected ? T.pink : "rgba(255,248,232,.22)"}`,
                            background: isSelected ? T.pink : "transparent",
                            display: "grid",
                            placeItems: "center",
                            flex: "0 0 auto",
                          }}
                        >
                          {isSelected && <NjamboIcon name="check" tone="light" size={18} />}
                        </span>
                        <AvatarIllustration seed={f.emoji} size={46} online={f.online} />
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ display: "block", fontWeight: 900, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {f.name}
                          </span>
                          <span className="nj-subtle">{f.online ? "En ligne" : "Hors ligne"}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </Surface>

              <Surface>
                <div style={{ fontWeight: 900, marginBottom: 12 }}>Code de table</div>
                <div className="nj-stack" style={{ gap: 12 }}>
                  <div>
                    <div className="nj-subtle" style={{ marginBottom: 7 }}>Cree une salle et partage le code.</div>
                    <Btn
                      variant="gold"
                      onClick={handleCreate}
                      disabled={!canCreate}
                      style={{ width: "100%" }}
                      icon={<NjamboIcon name="home" tone="gold" size={20} />}
                    >
                      {busy ? "Creation..." : "Creer une salle privee"}
                    </Btn>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", height: 1, background: "rgba(255,255,255,.08)" }} />
                  <div>
                    <div className="nj-subtle" style={{ marginBottom: 7 }}>Ou rejoins une table avec un code.</div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <input
                        value={joinCode}
                        onChange={(e) => { setJoinCode(e.target.value.toUpperCase()); clearError(); }}
                        placeholder="NJAM7K2"
                        maxLength={7}
                        className="nj-input"
                        style={{
                          fontFamily: "monospace",
                          fontWeight: 900,
                          letterSpacing: ".1em",
                          textAlign: "center",
                          textTransform: "uppercase",
                          flex: 1,
                        }}
                      />
                      <Btn variant="pink" onClick={handleJoin} disabled={busy || joinCode.length < 4}>
                        {busy ? "..." : "Rejoindre"}
                      </Btn>
                    </div>
                  </div>
                </div>
              </Surface>

              <Surface>
                <div style={{ fontWeight: 900, marginBottom: 12 }}>Mise par manche</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10 }}>
                  {cfg.stakes.map((m) => (
                    <Btn key={m} variant={mise === m ? "gold" : "ghost"} onClick={() => setMise(m)} style={{ width: "100%" }}>
                      {FCFA(m)}
                    </Btn>
                  ))}
                </div>
              </Surface>

              <Surface style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                <span>
                  <span className="nj-subtle">{totalPlayers} joueur{totalPlayers > 1 ? "s" : ""} a table</span>
                  <span style={{ ...displayFont, display: "block", color: T.gold, fontWeight: 900, fontSize: "clamp(20px, 6vw, 24px)", whiteSpace: "nowrap" }}>
                    Pot {FCFA(mise * totalPlayers)}
                  </span>
                </span>
                <Chip strong={canCreate}>
                  {canCreate ? "Pret" : totalPlayers < 2 ? "2 min." : "Solde bas"}
                </Chip>
              </Surface>

              {roomError && (
                <div style={{ color: T.bad, fontSize: 13, textAlign: "center" }}>{roomError}</div>
              )}

              <div className="nj-action-row">
                <Btn variant="ghost" onClick={() => navigateTo("menu")}>
                  Menu
                </Btn>
              </div>
            </AuthGate>
          </div>
        </div>
      </div>
    </Shell>
  );
}
