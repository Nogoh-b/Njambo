"use client";

import { useEffect, useState } from "react";
import { T } from "@/config/theme";
import { useGame } from "@/contexts/GameContext";
import { useAuth } from "@/hooks/useAuth";
import { useEconomy } from "@/contexts/EconomyContext";
import { getPlayerLevel } from "@/lib/playerLevel";
import { listenPlayer } from "@/lib/socialData";
import { NKAP } from "@/data/mock";
import { AvatarIllustration } from "@/components/ui/Art";
import { BottomNavScene } from "@/components/ui/BottomNavScene";
import { Btn } from "@/components/ui/Btn";
import { ScreenHeader, Surface } from "@/components/ui/Shell";
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
  const { user, updateUserProfile, updateAgeBand } = useAuth();
  const { economy, rank } = useEconomy();
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
  const shownBalance = economy?.nkap ?? profile.balance;
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
    <BottomNavScene narrow>
        <div className="nj-phone">
          <ScreenHeader title="Mon profil" kicker="Identite joueur" icon="profile" tone="gold" onBack={() => navigateTo("menu")} backLabel="Retour" />

          <div className="nj-stack" style={{ gap: 10 }}>
            {user && (
              <div className="nj-profile-status">
                Connecté{user.email ? ` · ${user.email}` : user.phoneNumber ? ` · ${user.phoneNumber}` : user.isAnonymous ? " (invité)" : ""}
              </div>
            )}

            {/* Identité compacte (avatar + pseudo + niveau) */}
            <Surface className="nj-panel-pad-sm" style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <AvatarIllustration seed={shownEmoji} size={78} active />
              <div style={{ flex: 1, minWidth: 0 }}>
                {editing ? (
                  <div style={{ display: "flex", gap: 8 }}>
                    <input value={draftName} onChange={(e) => { setDraftName(e.target.value); setError(""); }} className="nj-input" maxLength={22} style={{ minHeight: 42 }} />
                    <Btn variant="gold" onClick={save} disabled={saving}>{saving ? "..." : "OK"}</Btn>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => { setDraftName(shownName); setEditing(true); setError(""); }}
                    className="nj-profile-name-btn"
                  >
                    <span>{shownName}</span>
                    <span className="nj-subtle">Modifier ✎</span>
                  </button>
                )}
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
                  <span className="nj-profile-level-pill">Niv. {level.level}</span>
                  <span className="nj-subtle" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{level.title}</span>
                </div>
                <div className="nj-level-track" style={{ marginTop: 6 }} aria-hidden="true">
                  <span className="nj-level-fill" style={{ width: `${Math.round(level.progress * 100)}%` }} />
                </div>
              </div>
            </Surface>

            {/* Sélecteur d'avatar */}
            <Surface className="nj-panel-pad-sm">
              <div className="nj-subtle" style={{ marginBottom: 8, fontSize: 12 }}>Choisis ton avatar</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 7 }}>
                {AVATARS.map((a) => (
                  <button
                    type="button"
                    key={a}
                    onClick={() => { void saveProfile({ ...profile, name: shownName, emoji: a, balance: shownBalance }); }}
                    className={`nj-avatar-choice${shownEmoji === a ? " is-selected" : ""}`}
                    aria-label={`Choisir avatar ${a}`}
                  >
                    <AvatarIllustration seed={a} size={38} />
                  </button>
                ))}
              </div>
            </Surface>

            {user && !user.isAnonymous && (
              <Surface className="nj-panel-pad-sm">
                <div style={{ fontWeight: 900, marginBottom: 4 }}>Tranche d’âge</div>
                <div className="nj-subtle" style={{ marginBottom: 10, fontSize: 12 }}>Les achats XAF restent bloqués tant que le compte n’est pas déclaré 18+.</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <button className={`nj-choice${user.ageBand === "13_17" ? " is-active" : ""}`} type="button" onClick={() => void updateAgeBand("13_17")}>13–17 ans</button>
                  <button className={`nj-choice${user.ageBand === "18_plus" ? " is-active" : ""}`} type="button" onClick={() => void updateAgeBand("18_plus")}>18 ans ou plus</button>
                </div>
              </Surface>
            )}

            {error && (
              <div style={{ color: T.bad, fontSize: 13, textAlign: "center", padding: "6px 12px", borderRadius: 10, background: `${T.bad}12` }}>
                {error}
              </div>
            )}

            {/* Statistiques */}
            <div className="nj-grid-2" style={{ gap: 8 }}>
              {[
                { label: "Nkap", value: NKAP(shownBalance), color: T.gold },
                { label: "Cauris", value: String(economy?.cauris ?? 0), color: T.copper },
                { label: "Énergie", value: economy?.energy.unlimited ? "∞" : `${economy?.energy.available ?? 0}/100`, color: T.good },
                { label: "Couronnes", value: String(rank.crowns), color: T.gold },
                { label: "Parties", value: String(stats.played), color: T.chalk },
                { label: "Victoires", value: String(stats.won), color: T.good },
                { label: "Badge", value: rank.badge.label, color: T.copper },
              ].map((s) => (
                <div key={s.label} className="nj-stat-card">
                  <div className="nj-stat-card__label">{s.label}</div>
                  <div className="nj-stat-card__value" style={{ color: s.color }}>{s.value}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
    </BottomNavScene>
  );
}
