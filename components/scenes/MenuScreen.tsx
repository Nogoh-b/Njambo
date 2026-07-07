"use client";

import { useEffect, useState } from "react";
import { CEREMONIAL_STRIP, T } from "@/config/theme";
import { useGame } from "@/contexts/GameContext";
import { useAuth } from "@/hooks/useAuth";
import { listenSocialCounts } from "@/lib/socialData";
import { FCFA } from "@/data/mock";
import { AvatarIllustration, NjamboIcon, NjamboMark, type NjamboIconName } from "@/components/ui/Art";
import { ModeCard } from "@/components/ui/ModeCard";
import { Chip } from "@/components/ui/Chip";
import { displayFont, Shell } from "@/components/ui/Shell";
import type { SceneName } from "@/types/game";

const UTILITY_LINKS: { scene: SceneName; icon: NjamboIconName; label: string; tone: "gold" | "teal" | "pink" | "cobalt"; badge?: "notifications" | "messages" | "requests" }[] = [
  { scene: "leaderboard", icon: "trophy", label: "Classement", tone: "gold" },
  { scene: "friends", icon: "friends", label: "Amis", tone: "teal", badge: "requests" },
  { scene: "players", icon: "search", label: "Joueurs", tone: "teal" },
  { scene: "messages", icon: "message", label: "Messages", tone: "cobalt", badge: "messages" },
  { scene: "notifications", icon: "notification", label: "Notifs", tone: "pink", badge: "notifications" },
  { scene: "history", icon: "history", label: "Historique", tone: "pink" },
  { scene: "options", icon: "settings", label: "Options", tone: "cobalt" },
];

interface MenuScreenProps {
  canResumeGame?: boolean;
  onResumeGame?: () => void;
}

export function MenuScreen({ canResumeGame = false, onResumeGame }: MenuScreenProps) {
  const { profile, navigateTo } = useGame();
  const { user, logout } = useAuth();
  const [socialCounts, setSocialCounts] = useState({ notifications: 0, messages: 0, requests: 0 });
  const displayProfile = user
    ? { name: user.name, emoji: user.emoji, balance: profile.balance }
    : profile;

  useEffect(() => {
    if (!user?.uid) {
      setSocialCounts({ notifications: 0, messages: 0, requests: 0 });
      return;
    }
    const unsub = listenSocialCounts(user.uid, setSocialCounts);
    return unsub;
  }, [user?.uid]);

  return (
    <Shell>
      <div className="nj-safe nj-menu-safe" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div className="nj-menu-atmosphere" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <div
          className="nj-phone nj-surface nj-menu-profile"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: 10,
            marginTop: 0,
          }}
        >
          <button
            type="button"
            onClick={() => navigateTo("profile")}
            aria-label="Ouvrir le profil"
            style={{
              border: "none",
              background: "transparent",
              display: "grid",
              placeItems: "center",
              cursor: "pointer",
              flex: "0 0 auto",
            }}
          >
            <AvatarIllustration seed={displayProfile.emoji} size={58} online />
          </button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 900, fontSize: 17, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {displayProfile.name}
            </div>
            <div className="nj-subtle">Le gars du quartier</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div className="nj-kicker">Solde</div>
            <div style={{ ...displayFont, color: T.gold, fontSize: 22, fontWeight: 900 }}>{FCFA(displayProfile.balance)}</div>
            {user && (
              <button
                type="button"
                onClick={() => { void logout(); }}
                style={{
                  marginTop: 4,
                  border: "1px solid rgba(255,248,232,.14)",
                  background: "rgba(255,248,232,.06)",
                  color: T.muted,
                  borderRadius: 8,
                  padding: "4px 8px",
                  fontSize: 11,
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                Deconnexion
              </button>
            )}
          </div>
        </div>

        <section
          className="nj-phone nj-menu-hero"
          style={{
            textAlign: "center",
            paddingTop: "clamp(0px, 1svh, 14px)",
          }}
        >
          <div className="nj-menu-mark" style={{ display: "grid", placeItems: "center", marginBottom: 4 }}>
            <NjamboMark size={92} compact />
          </div>
          <div>
            <div className="nj-kicker" style={{ color: T.gold }}>
              LE JEU DU QUARTIER
            </div>
            <h1
              className="nj-menu-title"
              style={{
                ...displayFont,
                fontSize: "clamp(40px, 11vw, 62px)",
                lineHeight: 0.88,
                fontWeight: 900,
              }}
            >
              NJAMBO
            </h1>
            <div className="nj-subtle" style={{ marginTop: 6 }}>
              Choisis ta table, invite, joue.
            </div>
            <div className="nj-menu-stripe" style={{ height: 6, borderRadius: 999, background: CEREMONIAL_STRIP, width: "min(260px, 68vw)", margin: "10px auto 0" }} />
          </div>
        </section>

        <section
          className="nj-wide nj-menu-modes"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
            gap: 12,
          }}
        >
          {canResumeGame && (
            <ModeCard
              icon="play"
              title="Reprendre"
              subtitle="Retour a la table en cours"
              tone="gold"
              onClick={onResumeGame}
            />
          )}
          <ModeCard
            icon="online"
            title="En ligne"
            subtitle="Matchmaking et tables"
            tone="teal"
            onClick={() => navigateTo("online_setup")}
          />
          <ModeCard
            icon="friends"
            title="Amis"
            subtitle="Invite jusqu'à 3 joueurs"
            tone="pink"
            onClick={() => navigateTo("friends_invite")}
            delay={0.08}
          />
          <ModeCard
            icon="bot"
            title="Contre l'IA"
            subtitle="Bots avec leur façon de jouer"
            tone="gold"
            onClick={() => navigateTo("bot_setup")}
            delay={0.16}
          />
        </section>

        <section className="nj-phone nj-menu-utilities" style={{ marginTop: 0, display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
          {UTILITY_LINKS.map((link, i) => (
            <button
              type="button"
              key={link.scene}
              onClick={() => navigateTo(link.scene)}
              className="menu-btn nj-surface"
              style={{
                minHeight: 62,
                padding: 10,
                border: "1px solid rgba(255,248,232,.13)",
                color: T.text,
                display: "flex",
                alignItems: "center",
                gap: 12,
                cursor: "pointer",
                textAlign: "left",
                animation: `riseIn .35s ${0.25 + i * 0.06}s both`,
                position: "relative",
              }}
            >
              <span className="nj-title-icon" style={{ width: 42, height: 42, borderRadius: 14 }}>
                <NjamboIcon name={link.icon} tone={link.tone} size={25} />
              </span>
              <span style={{ fontWeight: 900 }}>{link.label}</span>
              {link.badge && socialCounts[link.badge] > 0 && (
                <span
                  style={{
                    position: "absolute",
                    top: 7,
                    right: 8,
                    minWidth: 20,
                    height: 20,
                    borderRadius: 999,
                    display: "grid",
                    placeItems: "center",
                    background: T.pink,
                    color: T.text,
                    fontSize: 11,
                    fontWeight: 900,
                  }}
                >
                  {socialCounts[link.badge]}
                </span>
              )}
            </button>
          ))}
        </section>

        <div className="nj-menu-footer" style={{ marginTop: "auto", textAlign: "center", paddingBottom: 8 }}>
          <Chip tone="teal">NJAMBO - KMER TABLE</Chip>
        </div>
      </div>
    </Shell>
  );
}
