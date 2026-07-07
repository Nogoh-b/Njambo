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
  const { user, updateUserProfile } = useAuth();
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(profile.name);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const saveProfile = async (next: typeof profile) => {
    /* Toujours sauvegarder en local (localStorage via GameContext) */
    setProfile(next);
    setSaving(true);
    setError("");

    /* Sauvegarder dans Firebase si connecté */
    if (user) {
      try {
        await updateUserProfile({ name: next.name, emoji: next.emoji });
      } catch (err: unknown) {
        const msg = (err as Error)?.message ?? "Erreur";
        setError(`Sauvegarde en ligne échouée : ${msg}`);
      }
    }
    setSaving(false);
  };

  const save = () => {
    const trimmed = draftName.trim();
    if (!trimmed) {
      setError("Le pseudo ne peut pas être vide.");
      return;
    }
    void saveProfile({ ...profile, name: trimmed });
    setEditing(false);
  };

  return (
    <Shell>
      <div className="nj-safe">
        <div className="nj-phone">
          <ScreenHeader title="Mon profil" kicker="Identité joueur" icon="profile" tone="gold" onBack={() => navigateTo("menu")} backLabel="Retour" />

          <div className="nj-stack">
            {/* Indicateur connexion */}
            {user && (
              <div style={{
                fontSize: 12,
                textAlign: "center",
                padding: "6px 12px",
                borderRadius: 10,
                background: `${T.good}15`,
                color: T.good,
                fontWeight: 700,
              }}>
                ✦ Connecté{user.email ? ` · ${user.email}` : " (anonyme)"}
              </div>
            )}

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
                  <input value={draftName} onChange={(e) => { setDraftName(e.target.value); setError(""); }} className="nj-input" maxLength={22} />
                  <Btn variant="gold" onClick={save} disabled={saving}>
                    {saving ? "…" : "OK"}
                  </Btn>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => { setDraftName(profile.name); setEditing(true); setError(""); }}
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

            {/* Erreur */}
            {error && (
              <div style={{
                color: T.bad,
                fontSize: 13,
                textAlign: "center",
                padding: "8px 12px",
                borderRadius: 10,
                background: `${T.bad}12`,
              }}>
                {error}
              </div>
            )}

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
