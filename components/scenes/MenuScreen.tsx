"use client";

import Image from "next/image";
import { useEffect, useState, type CSSProperties } from "react";
import { useGame } from "@/contexts/GameContext";
import { useAuth } from "@/hooks/useAuth";
import { getPlayerLevel } from "@/lib/playerLevel";
import { listenPlayer, listenSocialCounts } from "@/lib/socialData";
import { FCFA } from "@/data/mock";
import { AvatarIllustration, NjamboIcon, NjamboMark, type NjamboIconName } from "@/components/ui/Art";
import { displayFont, Shell } from "@/components/ui/Shell";
import type { PlayerStats, PublicPlayerProfile, SceneName } from "@/types/game";

type SocialCounts = { notifications: number; messages: number; requests: number };
type Tone = "gold" | "teal" | "pink" | "cobalt";
type BadgeKey = keyof SocialCounts;

interface MenuScreenProps {
  canResumeGame?: boolean;
  onResumeGame?: () => void;
}

interface HomeLink {
  scene: SceneName;
  icon: NjamboIconName;
  label: string;
  tone: Tone;
  badge?: BadgeKey;
}

const ZERO_STATS: PlayerStats = { played: 0, won: 0, bestWin: 0 };

const SIDE_LEFT: HomeLink[] = [
  { scene: "leaderboard", icon: "trophy", label: "Top", tone: "gold" },
  { scene: "history", icon: "history", label: "Matchs", tone: "pink" },
];

const SIDE_RIGHT: HomeLink[] = [
  { scene: "friends", icon: "friends", label: "Amis", tone: "teal", badge: "requests" },
  { scene: "options", icon: "settings", label: "Reglages", tone: "cobalt" },
];

const BOTTOM_LINKS: HomeLink[] = [
  { scene: "players", icon: "search", label: "Joueurs", tone: "teal" },
  { scene: "notifications", icon: "notification", label: "Notifs", tone: "pink", badge: "notifications" },
  { scene: "messages", icon: "message", label: "Messages", tone: "cobalt", badge: "messages" },
  { scene: "friends", icon: "friends", label: "Social", tone: "gold", badge: "requests" },
];

const MODE_LINKS: Array<HomeLink & { image: string; subtitle: string }> = [
  {
    scene: "online_setup",
    icon: "online",
    label: "Online",
    subtitle: "Table rapide",
    tone: "teal",
    image: "/assets/njambo/menu/mode-online.png",
  },
  {
    scene: "friends_invite",
    icon: "friends",
    label: "Amis",
    subtitle: "Invite",
    tone: "pink",
    image: "/assets/njambo/menu/mode-friends.png",
  },
  {
    scene: "bot_setup",
    icon: "bot",
    label: "IA",
    subtitle: "Solo",
    tone: "gold",
    image: "/assets/njambo/menu/mode-ai.png",
  },
];

function CountBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return <span className="nj-home-badge">{count > 99 ? "99+" : count}</span>;
}

export function MenuScreen({ canResumeGame = false, onResumeGame }: MenuScreenProps) {
  const { profile, navigateTo } = useGame();
  const { user, logout } = useAuth();
  const [socialCounts, setSocialCounts] = useState<SocialCounts>({ notifications: 0, messages: 0, requests: 0 });
  const [onlineProfile, setOnlineProfile] = useState<PublicPlayerProfile | null>(null);

  useEffect(() => {
    if (!user?.uid) {
      setSocialCounts({ notifications: 0, messages: 0, requests: 0 });
      return;
    }
    const unsub = listenSocialCounts(user.uid, setSocialCounts);
    return unsub;
  }, [user?.uid]);

  useEffect(() => {
    if (!user?.uid) {
      setOnlineProfile(null);
      return;
    }
    const unsub = listenPlayer(user.uid, setOnlineProfile);
    return unsub;
  }, [user?.uid]);

  const displayProfile = {
    name: onlineProfile?.name ?? user?.name ?? profile.name,
    emoji: onlineProfile?.emoji ?? user?.emoji ?? profile.emoji,
    balance: onlineProfile?.balance ?? profile.balance,
    stats: onlineProfile?.stats ?? ZERO_STATS,
  };
  const level = getPlayerLevel(displayProfile.stats, displayProfile.balance);
  const mainPlayLabel = canResumeGame ? "REPRENDRE" : "JOUER";
  const mainPlay = canResumeGame && onResumeGame ? onResumeGame : () => navigateTo("online_setup");

  const openLink = (scene: SceneName) => {
    navigateTo(scene);
  };

  return (
    <Shell>
      <div className="nj-safe nj-game-home-safe">
        <div className="nj-game-home-pattern" aria-hidden="true" />

        <header className="nj-game-hud">
          <button type="button" className="nj-player-hud" onClick={() => openLink("profile")} aria-label="Ouvrir le profil">
            <span className="nj-player-avatar-wrap">
              <AvatarIllustration seed={displayProfile.emoji} size={58} online={!!user} />
              <span className="nj-player-level-medal">{level.level}</span>
            </span>
            <span className="nj-player-hud-body">
              <span className="nj-player-name">{displayProfile.name}</span>
              <span className="nj-player-title">{level.title}</span>
              <span className="nj-level-track" aria-hidden="true">
                <span className="nj-level-fill" style={{ width: `${Math.round(level.progress * 100)}%` }} />
              </span>
            </span>
          </button>

          <div className="nj-hud-cluster" aria-label="Ressources joueur">
            <button type="button" className="nj-hud-resource" onClick={() => openLink("leaderboard")}>
              <NjamboIcon name="coin" tone="gold" size={19} />
              <span>{FCFA(displayProfile.balance)}</span>
            </button>
            <button type="button" className="nj-hud-resource nj-hud-resource-short" onClick={() => openLink("leaderboard")}>
              <NjamboIcon name="trophy" tone="teal" size={19} />
              <span>{displayProfile.stats.won}</span>
            </button>
            <button type="button" className="nj-hud-icon-btn" onClick={() => openLink("messages")} aria-label="Messages">
              <NjamboIcon name="message" tone="cobalt" size={22} />
              <CountBadge count={socialCounts.messages} />
            </button>
            <button type="button" className="nj-hud-icon-btn" onClick={() => openLink("notifications")} aria-label="Notifications">
              <NjamboIcon name="notification" tone="pink" size={22} />
              <CountBadge count={socialCounts.notifications + socialCounts.requests} />
            </button>
            <button type="button" className="nj-hud-icon-btn" onClick={() => openLink("options")} aria-label="Options">
              <NjamboIcon name="settings" tone="gold" size={22} />
            </button>
          </div>
        </header>

        <main className="nj-game-home-stage">
          <section className="nj-home-logo-scene" aria-label="Njambo">
            <div className="nj-home-table-art" aria-hidden="true">
              <Image src="/assets/njambo/table-oval.webp" alt="" width={330} height={214} priority className="nj-home-table-img" />
            </div>
            <div className="nj-home-brand-lockup">
              <NjamboMark size={76} compact />
              <span className="nj-home-brand-kicker">KMER TABLE</span>
              <h1 style={displayFont}>NJAMBO</h1>
            </div>

            <div className="nj-home-side-rail nj-home-side-left" aria-label="Raccourcis gauche">
              {SIDE_LEFT.map((link) => (
                <button type="button" key={link.scene} className={`nj-home-side-btn nj-side-${link.tone}`} onClick={() => openLink(link.scene)} aria-label={link.label} title={link.label}>
                  <NjamboIcon name={link.icon} tone={link.tone} size={22} />
                </button>
              ))}
            </div>

            <div className="nj-home-side-rail nj-home-side-right" aria-label="Raccourcis droite">
              {SIDE_RIGHT.map((link) => (
                <button type="button" key={link.scene} className={`nj-home-side-btn nj-side-${link.tone}`} onClick={() => openLink(link.scene)} aria-label={link.label} title={link.label}>
                  <NjamboIcon name={link.icon} tone={link.tone} size={22} />
                  {link.badge && <CountBadge count={socialCounts[link.badge]} />}
                </button>
              ))}
            </div>
          </section>

          <section className="nj-home-mode-rail" aria-label="Modes de jeu">
            {MODE_LINKS.map((mode, index) => (
              <button
                type="button"
                key={mode.scene}
                className={`nj-mode-plank nj-mode-${mode.tone}`}
                onClick={() => openLink(mode.scene)}
                style={{
                  "--plank-image": `url("${mode.image}")`,
                  "--plank-delay": `${0.08 + index * 0.07}s`,
                } as CSSProperties}
              >
                <span className="nj-mode-plank-media" aria-hidden="true" />
                <span className="nj-mode-plank-scrim" aria-hidden="true" />
                <span className="nj-mode-plank-shine" aria-hidden="true" />
                <span className="nj-mode-plank-glyph">
                  <NjamboIcon name={mode.icon} tone={mode.tone} size={24} />
                </span>
                <span className="nj-mode-plank-body">
                  <span className="nj-mode-plank-label" style={displayFont}>{mode.label}</span>
                  <span className="nj-mode-plank-sub">{mode.subtitle}</span>
                </span>
                <span className="nj-mode-plank-go" aria-hidden="true">
                  <NjamboIcon name="play" tone="light" size={16} />
                </span>
              </button>
            ))}
          </section>

          <button type="button" className="nj-home-play-button" onClick={mainPlay}>
            <span style={displayFont}>{mainPlayLabel}</span>
          </button>

          {user && (
            <button type="button" className="nj-home-logout" onClick={() => { void logout(); }}>
              Deconnexion
            </button>
          )}
        </main>

        <nav className="nj-home-bottom-nav" aria-label="Menu principal">
          <button type="button" className="nj-home-nav-btn nj-home-nav-btn-active" aria-current="page">
            <NjamboIcon name="home" tone="gold" size={27} />
            <span>Accueil</span>
          </button>
          {BOTTOM_LINKS.map((link) => (
            <button type="button" key={link.scene} className="nj-home-nav-btn" onClick={() => openLink(link.scene)}>
              <NjamboIcon name={link.icon} tone={link.tone} size={25} />
              <span>{link.label}</span>
              {link.badge && <CountBadge count={socialCounts[link.badge]} />}
            </button>
          ))}
        </nav>
      </div>
    </Shell>
  );
}
