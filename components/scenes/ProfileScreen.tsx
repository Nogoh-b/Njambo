"use client";

import { useState } from "react";
import { T } from "@/config/theme";
import { useGame } from "@/contexts/GameContext";
import { useAuth } from "@/hooks/useAuth";
import { FCFA } from "@/data/mock";
import { AvatarIllustration } from "@/components/ui/Art";
import { Btn } from "@/components/ui/Btn";
import { ScreenHeader, Shell, Surface, displayFont } from "@/components/ui/Shell";

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

export function ProfileScreen() {
  const { profile, setProfile, navigateTo } = useGame();
  const { updateUserProfile } = useAuth();
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(profile.name);

  const saveProfile = async (next: typeof profile) => {
    setProfile(next);
    try {
      await updateUserProfile({ name: next.name, emoji: next.emoji });
    } catch {
      // Local profile still updates; online screens will require auth to persist.
    }
  };

  const save = () => {
    const next = { ...profile, name: draftName.trim() || profile.name };
    void saveProfile(next);
    setEditing(false);
  };

  return (
    <Shell>
      <div className="nj-safe">
        <div className="nj-phone">
          <ScreenHeader title="Mon profil" kicker="Identité joueur" icon="profile" tone="gold" onBack={() => navigateTo("menu")} backLabel="Retour" />

          <div className="nj-stack">
            <Surface style={{ textAlign: "center" }}>
              <AvatarIllustration seed={profile.emoji} size={128} active />
              <div style={{ marginTop: 18, display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 9 }}>
                {AVATARS.map((a) => (
                  <button
                    type="button"
                    key={a}
                    onClick={() => { void saveProfile({ ...profile, emoji: a }); }}
                    className="nj-choice"
                    aria-label={`Choisir avatar ${a}`}
                    style={{
                      height: 54,
                      borderRadius: 18,
                      border: profile.emoji === a ? `2px solid ${T.gold}` : "1px solid rgba(255,248,232,.12)",
                      background: profile.emoji === a ? `${T.gold}18` : "rgba(255,248,232,.05)",
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
                  <input value={draftName} onChange={(e) => setDraftName(e.target.value)} className="nj-input" maxLength={22} />
                  <Btn variant="gold" onClick={save}>
                    OK
                  </Btn>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setEditing(true)}
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
                  <span style={{ fontWeight: 900 }}>{profile.name}</span>
                  <span className="nj-subtle">Modifier</span>
                </button>
              )}
            </Surface>

            <Surface>
              <div style={{ fontWeight: 900, marginBottom: 14 }}>Statistiques</div>
              <div className="nj-grid-2">
                {[
                  { label: "Solde", value: FCFA(profile.balance), color: T.gold },
                  { label: "Parties jouées", value: "0", color: T.chalk },
                  { label: "Victoires", value: "0", color: T.good },
                  { label: "Meilleur gain", value: FCFA(0), color: T.copper },
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
