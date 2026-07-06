"use client";

import { CEREMONIAL_STRIP, T } from "@/config/theme";
import { useGame } from "@/contexts/GameContext";
import { useAuth } from "@/hooks/useAuth";
import { FCFA } from "@/data/mock";
import { AvatarIllustration, NjamboIcon, NjamboMark, type NjamboIconName } from "@/components/ui/Art";
import { ModeCard, SoonBadge } from "@/components/ui/ModeCard";
import { Chip } from "@/components/ui/Chip";
import { displayFont, Shell } from "@/components/ui/Shell";
import type { SceneName } from "@/types/game";

const UTILITY_LINKS: { scene: SceneName; icon: NjamboIconName; label: string; tone: "gold" | "teal" | "pink" | "cobalt" }[] = [
  { scene: "leaderboard", icon: "trophy", label: "Classement", tone: "gold" },
  { scene: "friends", icon: "friends", label: "Amis", tone: "teal" },
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
  const displayProfile = user
    ? { name: user.name, emoji: user.emoji, balance: profile.balance }
    : profile;

  return (
    <Shell>
      <div className="nj-safe nj-menu-safe" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
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
            padding: 12,
            marginTop: 4,
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
            paddingTop: "clamp(4px, 3svh, 34px)",
          }}
        >
          <div className="nj-menu-mark" style={{ display: "grid", placeItems: "center", marginBottom: 8 }}>
            <NjamboMark size={124} />
          </div>
          <div>
            <div className="nj-kicker" style={{ color: T.gold }}>
              LE JEU DU QUARTIER
            </div>
            <h1
              className="nj-menu-title"
              style={{
                ...displayFont,
                fontSize: "clamp(52px, 14vw, 82px)",
                lineHeight: 0.88,
                fontWeight: 900,
              }}
            >
              NJAMBO
            </h1>
            <div className="nj-subtle" style={{ marginTop: 8 }}>
              Assieds-toi, choisis ta mise, montre ton jeu.
            </div>
            <div className="nj-menu-stripe" style={{ height: 7, borderRadius: 999, background: CEREMONIAL_STRIP, width: "min(280px, 72vw)", margin: "16px auto 0" }} />
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
            subtitle="Salles, codes et défis à venir"
            tone="teal"
            badge={<SoonBadge />}
            muted
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

        <section className="nj-phone nj-grid-2 nj-menu-utilities" style={{ marginTop: 2 }}>
          {UTILITY_LINKS.map((link, i) => (
            <button
              type="button"
              key={link.scene}
              onClick={() => navigateTo(link.scene)}
              className="menu-btn nj-surface"
              style={{
                minHeight: 82,
                padding: 14,
                border: "1px solid rgba(255,248,232,.13)",
                color: T.text,
                display: "flex",
                alignItems: "center",
                gap: 12,
                cursor: "pointer",
                textAlign: "left",
                animation: `riseIn .35s ${0.25 + i * 0.06}s both`,
              }}
            >
              <span className="nj-title-icon" style={{ width: 42, height: 42, borderRadius: 14 }}>
                <NjamboIcon name={link.icon} tone={link.tone} size={25} />
              </span>
              <span style={{ fontWeight: 900 }}>{link.label}</span>
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
