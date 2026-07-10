"use client";

import Image from "next/image";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { T } from "@/config/theme";
import { useGsapTimeline } from "@/lib/motion";
import { useGame } from "@/contexts/GameContext";
import { useAuth } from "@/hooks/useAuth";
import { getPlayerLevel } from "@/lib/playerLevel";
import { listenPlayer, listenSocialCounts } from "@/lib/socialData";
import { claimDailyBonus, topUpIfBroke } from "@/lib/playerData";
import { FCFA } from "@/data/mock";
import { AvatarIllustration, NjamboIcon, NjamboMark, type NjamboIconName } from "@/components/ui/Art";
import { BottomNav } from "@/components/ui/BottomNav";
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

const MENU_SPARKS = [
  { left: "18%", top: "18%", size: 5, delay: "0s" },
  { left: "78%", top: "22%", size: 4, delay: ".8s" },
  { left: "24%", top: "72%", size: 4, delay: "1.4s" },
  { left: "72%", top: "68%", size: 6, delay: "2.1s" },
  { left: "50%", top: "10%", size: 3, delay: "1.1s" },
];

function CountBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return <span className="nj-home-badge">{count > 99 ? "99+" : count}</span>;
}

export function MenuScreen({ canResumeGame = false, onResumeGame }: MenuScreenProps) {
  const { profile, setProfile, navigateTo, animationsOn, cfg } = useGame();
  const { user, logout } = useAuth();
  const [socialCounts, setSocialCounts] = useState<SocialCounts>({ notifications: 0, messages: 0, requests: 0 });
  const [onlineProfile, setOnlineProfile] = useState<PublicPlayerProfile | null>(null);
  const [claiming, setClaiming] = useState(false);

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

  /* ----- Économie : bonus quotidien + anti-faillite ----- */
  const eco = cfg.economy;
  const cooldownMs = eco.bonusCooldownH * 3_600_000;
  const lastBonusAt = onlineProfile?.lastBonusAt ?? 0;
  const bonusReady = Date.now() - lastBonusAt >= cooldownMs;
  const bonusHoursLeft = Math.max(0, Math.ceil((lastBonusAt + cooldownMs - Date.now()) / 3_600_000));

  const handleClaimBonus = async () => {
    if (!user?.uid || claiming || !bonusReady) return;
    setClaiming(true);
    const res = await claimDailyBonus(user.uid, eco.dailyBonus, cooldownMs);
    setClaiming(false);
    if (res.granted) setProfile((p) => ({ ...p, balance: res.balance }));
  };

  // Anti-faillite : dès qu'on est sous le plancher, on remonte pour pouvoir rejouer.
  useEffect(() => {
    if (!user?.uid) return;
    if ((onlineProfile?.balance ?? profile.balance) < eco.brokeFloor) {
      void topUpIfBroke(user.uid, eco.brokeFloor);
    }
  }, [user?.uid, onlineProfile?.balance, profile.balance, eco.brokeFloor]);

  const mainPlayLabel = canResumeGame ? "REPRENDRE" : "JOUER";
  const mainPlay = canResumeGame && onResumeGame ? onResumeGame : () => navigateTo("online_setup");

  const openLink = (scene: SceneName) => {
    navigateTo(scene);
  };

  /* ----- Entrée du menu (GSAP) : séquence coordonnée — le plateau apparaît,
     la marque descend, les rails latéraux glissent, les planks de mode
     cascadent, puis le bouton JOUER surgit. On anime uniquement opacity/
     transform sur des éléments SANS boucle transform (le plateau ne reçoit
     qu'un fondu car il flotte déjà via menuMarkFloat). ----- */
  const stageRef = useRef<HTMLElement>(null);
  useGsapTimeline(animationsOn, stageRef, (gsap) => {
    const tl = gsap.timeline({ defaults: { ease: "power3.out" } });
    tl.fromTo(".nj-home-table-art", { opacity: 0 }, { opacity: 0.96, duration: 0.55 }, 0)
      .fromTo(".nj-home-brand-lockup", { opacity: 0, y: -18 }, { opacity: 1, y: 0, duration: 0.5 }, 0.08)
      .fromTo(".nj-home-side-rail",
        { opacity: 0, x: (_i, t) => ((t as HTMLElement).classList.contains("nj-home-side-left") ? -28 : 28) },
        { opacity: 1, x: 0, duration: 0.5, stagger: 0.06 }, 0.16)
      .fromTo(".nj-mode-plank",
        { opacity: 0, y: 22, scale: 0.96 },
        { opacity: 1, y: 0, scale: 1, duration: 0.5, stagger: 0.08 }, 0.22)
      .fromTo(".nj-home-play-button",
        { opacity: 0, y: 16, scale: 0.9 },
        { opacity: 1, y: 0, scale: 1, duration: 0.5, ease: "back.out(1.8)" }, 0.46);
  });

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
            <button type="button" className="nj-hud-resource nj-hud-resource-short" onClick={() => openLink("power_collection")} aria-label="Cartes pouvoir">
              <NjamboIcon name="spark" tone="pink" size={19} />
              <span>{profile.cauris ?? 0}</span>
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

        <main className="nj-game-home-stage" ref={stageRef}>
          <section className="nj-home-logo-scene" aria-label="Njambo">
            {animationsOn && (
              <div className="nj-menu-sparkles" aria-hidden="true">
                {MENU_SPARKS.map((spark, index) => (
                  <span
                    key={index}
                    style={{
                      left: spark.left,
                      top: spark.top,
                      width: spark.size,
                      height: spark.size,
                      animationDelay: spark.delay,
                    }}
                  />
                ))}
              </div>
            )}
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

          <button type="button" className={`nj-home-play-button${animationsOn ? " nj-special-play" : ""}`} onClick={mainPlay}>
            <span style={displayFont}>{mainPlayLabel}</span>
          </button>

          {user && (
            <button type="button" className="nj-home-logout" onClick={() => { void logout(); }}>
              Deconnexion
            </button>
          )}
        </main>

        {/* Bonus quotidien — pastille flottante (position fixe → n'affecte pas la grille) */}
        {user && (
          <button
            type="button"
            onClick={() => { void handleClaimBonus(); }}
            disabled={!bonusReady || claiming}
            aria-label="Bonus quotidien"
            style={{
              position: "fixed",
              right: 12,
              bottom: 78,
              zIndex: 60,
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "9px 14px",
              borderRadius: 999,
              border: `1.5px solid ${bonusReady ? T.gold : "var(--wood-edge)"}`,
              background: bonusReady
                ? "linear-gradient(160deg, rgba(242,187,69,.28), rgba(20,14,6,.9))"
                : "linear-gradient(160deg, rgba(52,32,18,.5), rgba(12,9,7,.86))",
              color: T.text,
              fontWeight: 900,
              fontSize: 12.5,
              cursor: bonusReady ? "pointer" : "default",
              opacity: bonusReady ? 1 : 0.75,
              boxShadow: bonusReady ? "0 8px 22px rgba(0,0,0,.45)" : "none",
            }}
          >
            <NjamboIcon name="coin" tone="gold" size={18} />
            {bonusReady ? (
              <span>Bonus <b style={{ color: T.gold }}>+{FCFA(eco.dailyBonus)}</b></span>
            ) : (
              <span className="nj-subtle">Bonus dans {bonusHoursLeft}h</span>
            )}
          </button>
        )}

        {/* Accès rapide aux règles */}
        <button
          type="button"
          onClick={() => openLink("rules")}
          aria-label="Comment jouer"
          style={{
            position: "fixed",
            left: 12,
            bottom: 78,
            zIndex: 60,
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "9px 13px",
            borderRadius: 999,
            border: "1.5px solid var(--wood-edge)",
            background: "linear-gradient(160deg, rgba(52,32,18,.5), rgba(12,9,7,.86))",
            color: T.text,
            fontWeight: 900,
            fontSize: 12.5,
            cursor: "pointer",
          }}
        >
          <NjamboIcon name="cards" tone="gold" size={16} />
          <span>Comment jouer</span>
        </button>

        <BottomNav active="menu" />
      </div>
    </Shell>
  );
}
