"use client";

import { useEffect, useState } from "react";
import { T } from "@/config/theme";
import { useGame } from "@/contexts/GameContext";
import { useAuth } from "@/hooks/useAuth";
import { getPlayerLevel } from "@/lib/playerLevel";
import { listenPlayer } from "@/lib/socialData";
import { FCFA } from "@/data/mock";
import { AvatarIllustration } from "@/components/ui/Art";
import { Btn } from "@/components/ui/Btn";
import { ScreenHeader, Shell, Surface, displayFont } from "@/components/ui/Shell";
import type { PlayerStats, PublicPlayerProfile } from "@/types/game";

const AVATARS = [
  "you-nogoh",
  "avatar-douala",
  "avatar-bamoun",
  "avatar-beti",
  "avatar-bassa",
  "avatar-sawa",
  "avatar-bamilike",
  "avatar-mboa",
  "avatar-ndop",
  "avatar-rapha",
];

const ZERO_STATS: PlayerStats = { played: 0, won: 0, bestWin: 0 };

export function ProfileScreen() {
  const { profile, setProfile, navigateTo } = useGame();
  const { user, updateUserProfile } = useAuth();
  const [onlineProfile, setOnlineProfile] = useState<PublicPlayerProfile | null>(null);
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(user?.name ?? profile.name);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user?.uid) {
      setOnlineProfile(null);
      return;
    }
    const unsub = listenPlayer(user.uid, setOnlineProfile);
    return unsub;
  }, [user?.uid]);

  const shownName = onlineProfile?.name ?? user?.name ?? profile.name;
  const shownEmoji = onlineProfile?.emoji ?? user?.emoji ?? profile.emoji;
  const shownBalance = onlineProfile?.balance ?? profile.balance;
  const stats = onlineProfile?.stats ?? ZERO_STATS;
  const level = getPlayerLevel(stats, shownBalance);

  const saveProfile = async (next: typeof profile) => {
    setProfile(next);
    setSaving(true);
    setError("");

    try {
      if (user) {
        await updateUserProfile({ name: next.name, emoji: next.emoji });
      }
    } catch (err: unknown) {
      const msg = (err as Error)?.message ?? "Erreur";
      setError(`Sauvegarde en ligne echouee : ${msg}`);
    } finally {
      setSaving(false);
    }
  };

  const save = () => {
    const trimmed = draftName.trim();
    if (!trimmed) {
      setError("Le pseudo ne peut pas etre vide.");
      return;
    }
    void saveProfile({ ...profile, name: trimmed, emoji: shownEmoji, balance: shownBalance });
    setEditing(false);
  };

  return (
    <Shell>
      <div className="nj-safe">
        <div className="nj-phone">
          <ScreenHeader title="Mon profil" kicker="Identite joueur" icon="profile" tone="gold" onBack={() => navigateTo("menu")} backLabel="Retour" />

          <div className="nj-stack">
            {user && (
              <div
                style={{
                  fontSize: 12,
                  textAlign: "center",
                  padding: "6px 12px",
                  borderRadius: 10,
                  background: `${T.good}15`,
                  color: T.good,
                  fontWeight: 700,
                }}
              >
                Connecte{user.email ? ` - ${user.email}` : " (anonyme)"}
              </div>
            )}

            <Surface className="nj-profile-hero" style={{ textAlign: "center" }}>
              <AvatarIllustration seed={shownEmoji} size={118} active />

              <div className="nj-profile-level-card">
                <div className="nj-profile-level-top">
                  <span className="nj-profile-level-pill">Niveau {level.level}</span>
                  <span>{level.title}</span>
                </div>
                <div className="nj-level-track nj-profile-level-track" aria-hidden="true">
                  <span className="nj-level-fill" style={{ width: `${Math.round(level.progress * 100)}%` }} />
                </div>
                <div className="nj-profile-level-meta">
                  <span>{level.xp} XP</span>
                  <span>{level.xpToNext} XP avant niveau {level.level + 1}</span>
                </div>
              </div>

              <div style={{ marginTop: 18, display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 9 }}>
                {AVATARS.map((a) => (
                  <button
                    type="button"
                    key={a}
                    onClick={() => { void saveProfile({ ...profile, name: shownName, emoji: a, balance: shownBalance }); }}
                    className="nj-choice"
                    aria-label={`Choisir avatar ${a}`}
                    style={{
                      height: 54,
                      borderRadius: 18,
                      border: shownEmoji === a ? `2px solid ${T.gold}` : "1px solid rgba(255,248,232,.12)",
                      background: shownEmoji === a ? `${T.gold}18` : "rgba(255,248,232,.05)",
                      display: "grid",
                      placeItems: "center",
                      cursor: "pointer",
                    }}
                  >
                    <AvatarIllustration seed={a} size={42} />
                  </button>
                ))}
              </div>
            </Surface>

            <Surface>
              <div style={{ fontWeight: 900, marginBottom: 10 }}>Pseudo</div>
              {editing ? (
                <div style={{ display: "flex", gap: 8 }}>
                  <input value={draftName} onChange={(e) => { setDraftName(e.target.value); setError(""); }} className="nj-input" maxLength={22} />
                  <Btn variant="gold" onClick={save} disabled={saving}>
                    {saving ? "..." : "OK"}
                  </Btn>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => { setDraftName(shownName); setEditing(true); setError(""); }}
                  className="nj-choice"
                  style={{
                    width: "100%",
                    minHeight: 54,
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 12,
                    padding: "12px 14px",
                    borderRadius: 16,
                    border: "1px solid rgba(255,248,232,.12)",
                    background: "rgba(255,248,232,.055)",
                    color: T.text,
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  <span style={{ fontWeight: 900 }}>{shownName}</span>
                  <span className="nj-subtle">Modifier</span>
                </button>
              )}
            </Surface>

            {error && (
              <div
                style={{
                  color: T.bad,
                  fontSize: 13,
                  textAlign: "center",
                  padding: "8px 12px",
                  borderRadius: 10,
                  background: `${T.bad}12`,
                }}
              >
                {error}
              </div>
            )}

            <Surface>
              <div style={{ fontWeight: 900, marginBottom: 14 }}>Statistiques</div>
              <div className="nj-grid-2">
                {[
                  { label: "Solde", value: FCFA(shownBalance), color: T.gold },
                  { label: "Parties jouees", value: String(stats.played), color: T.chalk },
                  { label: "Victoires", value: String(stats.won), color: T.good },
                  { label: "Meilleur gain", value: FCFA(stats.bestWin), color: T.copper },
                ].map((s) => (
                  <div
                    key={s.label}
                    style={{
                      borderRadius: 16,
                      padding: "14px 12px",
                      background: "rgba(255,248,232,.055)",
                      border: "1px solid rgba(255,248,232,.09)",
                      textAlign: "center",
                    }}
                  >
                    <div className="nj-subtle" style={{ fontSize: 11 }}>{s.label}</div>
                    <div style={{ ...displayFont, color: s.color, fontWeight: 900, fontSize: 20 }}>{s.value}</div>
                  </div>
                ))}
              </div>
            </Surface>
          </div>
        </div>
      </div>
    </Shell>
  );
}
