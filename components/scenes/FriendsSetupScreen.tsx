"use client";

import { useState } from "react";
import { T } from "@/config/theme";
import { useGame } from "@/contexts/GameContext";
import { useLobby } from "@/contexts/LobbyContext";
import { useOnlinePlayers } from "@/hooks/useOnlinePlayers";
import { getEntranceAnimationStyle, useMotionProfile } from "@/lib/motion";
import { NKAP } from "@/data/mock";
import { AvatarIllustration, NjamboIcon } from "@/components/ui/Art";
import { Btn } from "@/components/ui/Btn";
import { Chip } from "@/components/ui/Chip";
import { ScreenHeader, Shell, Surface, displayFont } from "@/components/ui/Shell";
import { AuthGate } from "@/components/ui/AuthGate";

export function FriendsSetupScreen() {
  const { navigateTo, profile, cfg } = useGame();
  const motion = useMotionProfile();
  const { createRoom, joinRoomByCode, roomError, clearError } = useLobby();
  const { players, loading } = useOnlinePlayers();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [joinCode, setJoinCode] = useState("");
  const [mise, setMise] = useState(cfg.stakes[1]);
  const [seats, setSeats] = useState(2);
  const [busy, setBusy] = useState(false);

  // Le nombre de places est la source de vérité pour la taille de la table.
  // Réduire les places retire les invités en trop (hôte inclus).
  const changeSeats = (n: number) => {
    setSeats(n);
    setSelected((prev) => (prev.size <= n - 1 ? prev : new Set(Array.from(prev).slice(0, n - 1))));
  };

  const toggleFriend = (uid: string, online: boolean) => {
    if (!online) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else if (next.size < seats - 1) next.add(uid);
      return next;
    });
  };

  const canCreate = !busy && profile.balance >= mise;

  const handleCreate = async () => {
    if (!canCreate) return;
    try {
      setBusy(true);
      clearError();
      await createRoom(mise, seats, "friends");
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

          <AuthGate>
            <div className="nj-fit-col">
              <div className="nj-fit-scroll">
              <Surface className="nj-panel-pad-sm" style={{ overflow: "visible" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 12 }}>
                  <div>
                    <div style={{ fontWeight: 900 }}>Joueurs disponibles</div>
                    <div className="nj-subtle">Optionnel : invite jusqu&apos;a {seats - 1} joueur{seats - 1 > 1 ? "s" : ""} en ligne, ou partage le code.</div>
                  </div>
                  <Chip tone="pink">{selected.size}/{seats - 1}</Chip>
                </div>
                <div style={{ display: "grid", gap: 9 }}>
                  {loading && <div className="nj-subtle" style={{ textAlign: "center", padding: 14 }}>Chargement des joueurs...</div>}
                  {!loading && players.length === 0 && (
                    <div className="nj-subtle" style={{ textAlign: "center", padding: 14 }}>
                      Aucun autre joueur inscrit pour le moment.
                    </div>
                  )}
                  {players.map((f, i) => {
                    const isSelected = selected.has(f.uid);
                    return (
                      <button data-nj-skin="dark"
                        type="button"
                        key={f.uid}
                        onClick={() => toggleFriend(f.uid, f.online)}
                        disabled={!f.online}
                        className={`nj-list-card${isSelected ? " nj-list-card--pink is-active" : ""}`}
                        style={{
                          cursor: f.online ? "pointer" : "not-allowed",
                          opacity: f.online ? 1 : 0.55,
                          ...getEntranceAnimationStyle(motion, i, { step: 0.05 }),
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
              </div>

              <div className="nj-fit-fixed">
              <Surface className="nj-panel-pad-sm">
                {/* Ligne 1 : Mise en ligne compacte */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 10 }}>
                  <span className="nj-subtle" style={{ fontSize: 12 }}>Mise</span>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
                    {cfg.stakes.map((m) => (
                      <Btn key={m} variant={mise === m ? "gold" : "ghost"} ariaPressed={mise === m} onClick={() => setMise(m)} style={{ width: "100%", minHeight: 34, fontSize: 13 }}>
                        {NKAP(m)}
                      </Btn>
                    ))}
                  </div>
                  <Chip strong={canCreate} style={{ flexShrink: 0 }}>
                    {canCreate ? "Prêt" : "Solde bas"}
                  </Chip>
                </div>

                {/* Ligne 1bis : Nombre de places */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 10 }}>
                  <span className="nj-subtle" style={{ fontSize: 12 }}>Joueurs</span>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
                    {[2, 3, 4].map((n) => (
                      <Btn key={`seat-${n}`} variant={seats === n ? "gold" : "ghost"} ariaPressed={seats === n} onClick={() => changeSeats(n)} style={{ width: "100%", minHeight: 34, fontSize: 13 }}>
                        {n}
                      </Btn>
                    ))}
                  </div>
                  <span style={{ width: 54, flexShrink: 0 }} />
                </div>

                {/* Ligne 2 : Rejoindre par code */}
                <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
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
                      minHeight: 40,
                    }}
                  />
                  <Btn variant="pink" onClick={handleJoin} disabled={busy || joinCode.length < 4} style={{ flexShrink: 0 }}>
                    {busy ? "…" : "Rejoindre"}
                  </Btn>
                </div>

                {/* Ligne 3 : Bouton Créer + Pot */}
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <Btn
                    variant="gold"
                    onClick={handleCreate}
                    disabled={!canCreate}
                    style={{ flex: 1 }}
                    icon={<NjamboIcon name="home" tone="gold" size={18} />}
                  >
                    {busy ? "Création…" : "Créer salle"}
                  </Btn>
                  <span style={{ flexShrink: 0, textAlign: "center", lineHeight: 1.2 }}>
                    <span className="nj-subtle" style={{ fontSize: 11, display: "block" }}>{seats} joueurs</span>
                    <span style={{ ...displayFont, color: T.gold, fontWeight: 900, fontSize: "clamp(16px, 5vw, 20px)", whiteSpace: "nowrap" }}>
                      {NKAP(mise * seats)}
                    </span>
                  </span>
                </div>

                {roomError && (
                  <div style={{ color: T.bad, fontSize: 13, textAlign: "center", marginTop: 8 }}>{roomError}</div>
                )}
              </Surface>
              </div>
            </div>
          </AuthGate>
        </div>
      </div>
    </Shell>
  );
}
