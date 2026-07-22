"use client";

import Image from "next/image";
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { GameShell } from "@/components/ui/GameShell";
import { StatusBanner } from "@/components/ui/GamePrimitives";
import { HubReveal } from "@/components/ui/HubReveal";
import { Btn } from "@/components/ui/Btn";
import { AvatarIllustration, NjamboFriendlyIcon, NjamboIcon, type NjamboIconName, type NjamboIconTone } from "@/components/ui/Art";
import { useGame } from "@/contexts/GameContext";
import { useEconomy } from "@/contexts/EconomyContext";
import { DEFAULT_EVENTS, doualaDayKey, type Reward } from "@/domain";
import { useAuth } from "@/hooks/useAuth";
import { useLiveOpsContent } from "@/hooks/useLiveOpsContent";
import {
  GAME_MODE_CATALOG,
  isGameModeLocked,
  resolveGameModeDestination,
  type GameModeCatalogEntry,
} from "@/lib/gameModeCatalog";
import {
  HOME_MOTION_FEATURES,
  getHomeResourceChange,
  resolveHomeMotionMode,
  type HomeMotionMode,
  type HomeResourceKind,
} from "@/lib/homeArcadeMotion";
import { t } from "@/lib/i18n";
import { useMotionProfile, usePageActive } from "@/lib/motion";
import { getPlayerLevel } from "@/lib/playerLevel";
import { preloadScene } from "@/lib/scenePreload";
import { listenPlayer, listenSocialCounts } from "@/lib/socialData";
import type { PlayerStats, PublicPlayerProfile, SceneName } from "@/types/game";
import styles from "./MenuScreen.module.css";

type SocialCounts = { notifications: number; messages: number; requests: number };

interface MenuScreenProps {
  /** Type de la partie en cours à reprendre (null = rien à reprendre). */
  resumeRoomType?: "online" | "friends" | null;
  onResumeGame?: () => void;
}

const ZERO_STATS: PlayerStats = { played: 0, won: 0, bestWin: 0 };

const RESUME_SCENE: Record<"online" | "friends", SceneName> = {
  online: "online_setup",
  friends: "friends_invite",
};

const QUICK_LINKS: Array<{ scene: SceneName; icon: NjamboIconName; tone: NjamboIconTone; label: string }> = [
  { scene: "leaderboard", icon: "trophy", tone: "gold", label: "Classement" },
  { scene: "history", icon: "history", tone: "teal", label: "Historique" },
  { scene: "rules", icon: "cards", tone: "pink", label: "Règles" },
];

const SPARKS = [
  { left: "15%", top: "12%", delay: "0s", duration: "3.8s", size: "4px" },
  { left: "83%", top: "22%", delay: ".9s", duration: "4.4s", size: "3px" },
  { left: "68%", top: "77%", delay: "1.6s", duration: "4.1s", size: "4px" },
  { left: "31%", top: "84%", delay: "2.2s", duration: "4.8s", size: "3px" },
  { left: "92%", top: "58%", delay: "2.8s", duration: "5.2s", size: "2px" },
  { left: "8%", top: "64%", delay: "1.3s", duration: "4.6s", size: "2px" },
];

/* Pluie de cartes de fond : positions/délais fixes (déterministes, pas de Math.random
   → aucun mismatch d'hydratation). Slicée par fallingCardCount + gardée par le profil motion. */
const FALLING_CARDS = [
  { left: "3%", delay: "-2.1s", duration: "10.8s", scale: "1.08", rot: "-18deg", drift: "34px", opacity: ".62" },
  { left: "11%", delay: "-8.4s", duration: "14.2s", scale: ".68", rot: "12deg", drift: "-22px", opacity: ".42" },
  { left: "19%", delay: "-5.6s", duration: "12.6s", scale: ".88", rot: "-9deg", drift: "28px", opacity: ".54" },
  { left: "27%", delay: "-11.8s", duration: "15.4s", scale: ".58", rot: "21deg", drift: "-18px", opacity: ".36" },
  { left: "35%", delay: "-1.2s", duration: "11.4s", scale: "1", rot: "-13deg", drift: "24px", opacity: ".58" },
  { left: "43%", delay: "-9.7s", duration: "13.8s", scale: ".72", rot: "16deg", drift: "-25px", opacity: ".43" },
  { left: "51%", delay: "-4.2s", duration: "10.4s", scale: "1.13", rot: "-16deg", drift: "36px", opacity: ".64" },
  { left: "59%", delay: "-12.2s", duration: "16s", scale: ".62", rot: "10deg", drift: "-20px", opacity: ".38" },
  { left: "67%", delay: "-6.5s", duration: "12s", scale: ".92", rot: "-20deg", drift: "30px", opacity: ".55" },
  { left: "75%", delay: "-2.8s", duration: "14.8s", scale: ".7", rot: "8deg", drift: "-28px", opacity: ".44" },
  { left: "82%", delay: "-10.6s", duration: "11.2s", scale: "1.04", rot: "17deg", drift: "22px", opacity: ".61" },
  { left: "88%", delay: "-7.3s", duration: "15.8s", scale: ".6", rot: "-11deg", drift: "-19px", opacity: ".37" },
  { left: "93%", delay: "-3.7s", duration: "12.9s", scale: ".84", rot: "20deg", drift: "26px", opacity: ".52" },
  { left: "97%", delay: "-13.1s", duration: "14.6s", scale: ".66", rot: "-15deg", drift: "-30px", opacity: ".4" },
];

const compactNumber = new Intl.NumberFormat("fr-FR", { notation: "compact", maximumFractionDigits: 1 });

function formatRibbonAmount(value: number): string {
  return value >= 1_000_000 ? compactNumber.format(value) : value.toLocaleString("fr-FR");
}

function formatInteger(value: number): string {
  return Math.round(value).toLocaleString("fr-FR");
}

const CountBadge = memo(function CountBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return <span key={count} className={styles.countBadge}>{count > 99 ? "99+" : count}</span>;
});

const AnimatedResourceValue = memo(function AnimatedResourceValue({
  value,
  fallback,
  format,
  enabled,
}: {
  value?: number;
  fallback: string;
  format: (value: number) => string;
  enabled: boolean;
}) {
  const valueRef = useRef<HTMLElement>(null);
  const previousRef = useRef<number | null>(null);
  const frameRef = useRef(0);

  useLayoutEffect(() => {
    cancelAnimationFrame(frameRef.current);
    const element = valueRef.current;
    if (!element || value === undefined) {
      if (element) element.textContent = fallback;
      previousRef.current = null;
      return;
    }

    const previous = previousRef.current;
    previousRef.current = value;
    if (!enabled) {
      element.textContent = format(value);
      return;
    }

    const initialOffset = Math.max(1, Math.round(Math.abs(value) * 0.08));
    const from = previous ?? Math.max(0, value - initialOffset);
    if (from === value) {
      element.textContent = format(value);
      return;
    }

    const duration = previous === null ? 460 : 580;
    const startedAt = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      element.textContent = format(Math.round(from + (value - from) * eased));
      if (progress < 1) frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameRef.current);
  }, [enabled, fallback, format, value]);

  return <strong ref={valueRef} className={styles.resourceValue}>{value === undefined ? fallback : format(value)}</strong>;
});

function rewardLabel(reward: Reward | undefined) {
  if (!reward) return "Récompense mystère";
  switch (reward.type) {
    case "nkap": return `${reward.amount.toLocaleString("fr-FR")} Nkap`;
    case "cauris": return `${reward.amount} cauris`;
    case "booster_book": return `Livre ${reward.boosterId}`;
    case "ticket": return `Ticket ${reward.tier}`;
    case "energy_pass": return `Énergie ${reward.durationMinutes / 60} h`;
    case "card": return "Carte permanente";
  }
}

function ResourceButton({
  kind,
  asset,
  label,
  value,
  numericValue,
  formatValue = formatInteger,
  fullValue,
  tone,
  onClick,
  progress,
  motionMode,
}: {
  kind: HomeResourceKind;
  asset: string;
  label: string;
  value: string;
  numericValue?: number;
  formatValue?: (value: number) => string;
  fullValue?: string;
  tone: "gold" | "teal" | "pink";
  onClick: () => void;
  progress?: number;
  motionMode: HomeMotionMode;
}) {
  const motionFeatures = HOME_MOTION_FEATURES[motionMode];
  const previousRef = useRef<number | null>(null);
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progressRef = useRef<HTMLSpanElement>(null);
  const previousProgressRef = useRef<number | null>(null);
  const progressFrameRef = useRef(0);
  const [feedback, setFeedback] = useState<{ direction: "gain" | "spend"; delta: number; key: number } | null>(null);

  useEffect(() => {
    if (numericValue === undefined) {
      previousRef.current = null;
      return;
    }
    const previous = previousRef.current;
    previousRef.current = numericValue;
    const change = getHomeResourceChange(kind, previous, numericValue, motionMode);
    if (!change) return;
    if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
    setFeedback({
      direction: change.direction,
      delta: change.delta,
      key: Date.now(),
    });
    feedbackTimerRef.current = setTimeout(() => {
      setFeedback(null);
      feedbackTimerRef.current = null;
    }, 850);
  }, [kind, motionMode, numericValue]);

  useEffect(() => {
    if (motionFeatures.reactions) return;
    if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
    feedbackTimerRef.current = null;
    setFeedback(null);
  }, [motionFeatures.reactions]);

  useEffect(() => () => {
    if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
  }, []);

  useLayoutEffect(() => {
    cancelAnimationFrame(progressFrameRef.current);
    const element = progressRef.current;
    if (!element || progress === undefined) {
      previousProgressRef.current = null;
      return;
    }
    const target = Math.max(0, Math.min(100, progress)) / 100;
    const from = previousProgressRef.current ?? 0;
    previousProgressRef.current = target;
    if (!motionFeatures.reactions || from === target) {
      element.style.transform = `scaleX(${target})`;
      return;
    }
    const startedAt = performance.now();
    const tick = (now: number) => {
      const ratio = Math.min(1, (now - startedAt) / 540);
      const eased = 1 - Math.pow(1 - ratio, 3);
      element.style.transform = `scaleX(${from + (target - from) * eased})`;
      if (ratio < 1) progressFrameRef.current = requestAnimationFrame(tick);
    };
    progressFrameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(progressFrameRef.current);
  }, [motionFeatures.reactions, progress]);

  const feedbackClass = feedback?.direction === "gain"
    ? styles.resourceGain
    : feedback?.direction === "spend"
      ? styles.resourceSpend
      : "";

  return (
    <button data-nj-skin="none"
      type="button"
      className={`${styles.resource} ${styles[`tone${tone}`]}${feedbackClass ? ` ${feedbackClass}` : ""}`}
      data-resource={kind}
      data-motion-level={motionMode}
      onClick={onClick}
      aria-label={`${label} : ${fullValue ?? value}. Ouvrir le portefeuille`}
      title={fullValue && fullValue !== value ? fullValue : undefined}
    >
      <span className={styles.resourceIcon} aria-hidden="true">
        <Image src={asset} alt="" width={42} height={42} />
      </span>
      <span className={styles.resourceCopy}>
        <span className={styles.resourceGaugeHead}>
          <span className={styles.resourceLabel}>{label}</span>
          <span className={styles.resourceValueRow}>
            <AnimatedResourceValue value={numericValue} fallback={value} format={formatValue} enabled={motionFeatures.reactions} />
            {feedback && (
              <span key={feedback.key} className={styles.resourceDelta} aria-hidden="true">
                {feedback.delta > 0 ? "+" : "−"}{formatValue(Math.abs(feedback.delta))}
              </span>
            )}
          </span>
        </span>
        <span
          className={`${styles.resourceMeter}${typeof progress === "number"
            ? ""
            : kind === "energy"
              ? ` ${styles.resourceMeterUnknown}`
              : ` ${styles.resourceMeterDecorative}`}`}
          aria-hidden="true"
        >
          <span
            ref={typeof progress === "number" ? progressRef : undefined}
            style={typeof progress === "number"
              ? { transform: `scaleX(${Math.max(0, Math.min(100, progress)) / 100})` }
              : kind === "energy"
                ? { transform: "scaleX(0)" }
                : undefined}
          />
        </span>
      </span>
    </button>
  );
}

function QuickModeButton({
  mode,
  locked,
  onOpen,
  onPrefetch,
}: {
  mode: GameModeCatalogEntry;
  locked?: boolean;
  onOpen: () => void;
  onPrefetch?: () => void;
}) {
  return (
    <button
      data-nj-skin="none"
      type="button"
      className={`${styles.quickMode} ${styles[`quickMode${mode.tone}`]}${locked ? ` ${styles.quickModeLocked}` : ""}`}
      onClick={onOpen}
      onPointerEnter={onPrefetch}
      onFocus={onPrefetch}
      aria-label={`${locked ? "Créer un compte pour jouer à" : "Jouer à"} ${mode.title}`}
    >
      <Image className={styles.quickModeArt} src={mode.art} alt="" fill sizes="(max-width: 599px) 33vw, 220px" />
      <span className={styles.quickModeShade} aria-hidden="true" />
      <span className={styles.quickModeIcon} aria-hidden="true">
        <NjamboIcon name={mode.icon} tone={mode.tone} size={24} />
      </span>
      <span className={styles.quickModeCopy}>
        <small>{mode.homeKicker}</small>
        <strong>{mode.shortTitle}</strong>
      </span>
      <span className={styles.quickModeArrow} aria-hidden="true">→</span>
      {locked && (
        <span className={styles.quickModeLock} aria-hidden="true">
          <NjamboIcon name="profile" tone="light" size={13} />
        </span>
      )}
    </button>
  );
}

export function MenuScreen({ resumeRoomType = null, onResumeGame }: MenuScreenProps) {
  const { profile, navigateTo } = useGame();
  const motion = useMotionProfile();
  const pageActive = usePageActive();
  const motionMode = resolveHomeMotionMode(motion.enabled, motion.level);
  const motionFeatures = HOME_MOTION_FEATURES[motionMode];
  const { user } = useAuth();
  const { economy, inventory, rank, loading, error: economyError, refresh, command } = useEconomy();
  const { events } = useLiveOpsContent();
  const [socialCounts, setSocialCounts] = useState<SocialCounts>({ notifications: 0, messages: 0, requests: 0 });
  const [onlineProfile, setOnlineProfile] = useState<PublicPlayerProfile | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [bonusBurst, setBonusBurst] = useState(false);
  const bonusBurstTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!user?.uid) {
      setSocialCounts({ notifications: 0, messages: 0, requests: 0 });
      return;
    }
    return listenSocialCounts(user.uid, setSocialCounts);
  }, [user?.uid]);

  useEffect(() => {
    if (!user?.uid) {
      setOnlineProfile(null);
      return;
    }
    return listenPlayer(user.uid, setOnlineProfile);
  }, [user?.uid]);

  const displayProfile = useMemo(() => ({
    name: onlineProfile?.name ?? user?.name ?? profile.name,
    emoji: onlineProfile?.emoji ?? user?.emoji ?? profile.emoji,
    balance: economy?.nkap ?? profile.balance,
    cauris: economy?.cauris ?? profile.cauris ?? 0,
    stats: onlineProfile?.stats ?? ZERO_STATS,
  }), [economy?.cauris, economy?.nkap, onlineProfile?.emoji, onlineProfile?.name, onlineProfile?.stats, profile.balance, profile.cauris, profile.emoji, profile.name, user?.emoji, user?.name]);

  const level = getPlayerLevel(displayProfile.stats, displayProfile.balance);
  const bonusReady = !!economy && economy.daily.lastClaimDay !== doualaDayKey();
  const resumeScene = resumeRoomType ? RESUME_SCENE[resumeRoomType] : null;
  const canResume = Boolean(resumeScene && onResumeGame);
  const now = useMemo(() => Date.now(), []);
  const featuredEvent = events.find((event) => event.published && event.startsAt <= now && event.endsAt > now) ?? events[0] ?? DEFAULT_EVENTS[0];
  const featuredReward = featuredEvent.finalReward.map(rewardLabel).join(" + ");
  const bronzeTickets = Number(inventory.tickets?.bronze ?? 0);
  const loyaltyPoints = Math.min(7, Math.max(0, economy?.daily.loyaltyPoints ?? 0));
  const energyValue = economy?.energy.unlimited ? "Illimitée" : String(economy?.energy.available ?? 100);
  const energyProgress = economy?.energy.unlimited ? 100 : economy?.energy.available ?? 100;
  const economyPending = Boolean(user && !user.isAnonymous && loading && !economy);
  const isGuest = !user || user.isAnonymous === true;
  const rankAssetId = rank.badge.id.replaceAll("_", "-");

  const openLink = useCallback((scene: SceneName) => navigateTo(scene), [navigateTo]);

  const handlePrimaryPlay = () => {
    if (canResume) {
      onResumeGame?.();
      return;
    }
    openLink("play");
  };

  const handleClaimBonus = async () => {
    if (!user?.uid || user.isAnonymous || claiming || !bonusReady) return;
    setClaiming(true);
    try {
      await command("claimDailyReward");
      // Burst joué dès que les animations sont activées (plus seulement en niveau "full").
      if (motion.enabled) {
        if (bonusBurstTimerRef.current) clearTimeout(bonusBurstTimerRef.current);
        setBonusBurst(true);
        bonusBurstTimerRef.current = setTimeout(() => {
          setBonusBurst(false);
          bonusBurstTimerRef.current = null;
        }, 1100);
      }
    } finally {
      setClaiming(false);
    }
  };

  const handleBonusAction = () => {
    if (!user || user.isAnonymous) {
      openLink("profile");
      return;
    }
    void handleClaimBonus();
  };

  useEffect(() => () => {
    if (bonusBurstTimerRef.current) clearTimeout(bonusBurstTimerRef.current);
  }, []);

  const motionClass = {
    full: styles.motionFull,
    balanced: styles.motionBalanced,
    lite: styles.motionLite,
    off: styles.motionOff,
  }[motionMode];

  return (
    <GameShell
      active="menu"
      className={`${styles.homeScene} ${styles.homeFinal} nj-mboa-solar-home ${motionClass}${motion.enabled ? ` ${styles.motionOn}` : ""}${pageActive ? "" : ` ${styles.pagePaused}`}`}
      contentClassName={styles.scrollArea}
    >
      <div className={styles.ambient} aria-hidden="true">
        {SPARKS.slice(0, motion.allowParticles ? motionFeatures.ambientSparkCount : 0).map((spark, index) => (
          <span
            key={index}
            style={{
              left: spark.left,
              top: spark.top,
              width: spark.size,
              height: spark.size,
              animationDelay: spark.delay,
              animationDuration: spark.duration,
            } as CSSProperties}
          />
        ))}
      </div>

      <div className={styles.cardRain} aria-hidden="true">
        {FALLING_CARDS.slice(0, motion.allowDecorativeLoop ? motionFeatures.fallingCardCount : 0).map((card, index) => (
          <span
            key={index}
            style={{
              left: card.left,
              animationDelay: card.delay,
              animationDuration: card.duration,
              "--rain-scale": card.scale,
              "--rain-rot": card.rot,
              "--rain-drift": card.drift,
              "--rain-opacity": card.opacity,
            } as CSSProperties}
          />
        ))}
      </div>

      <div className={styles.homeBody}>
        <HubReveal className={styles.topHud} order={0} duration="navigation">
          <header className={styles.identityBar}>
            <button data-nj-skin="none"
              type="button"
              className={styles.playerIdentity}
              onClick={() => openLink("profile")}
              aria-label={`${displayProfile.name}, ${rank.badge.label}, ${rank.crowns.toLocaleString("fr-FR")} couronnes. Ouvrir le profil`}
            >
              <span className={styles.avatarWrap}>
                <AvatarIllustration seed={displayProfile.emoji} size={54} online={!!user} />
                <span className={styles.levelMedal}>{level.level}</span>
                <span className={styles.rankMark} aria-hidden="true">
                  <Image src={`/assets/njambo/ranks/rank-${rankAssetId}-64.webp`} alt="" width={32} height={32} />
                </span>
              </span>
              <span className={styles.identityCopy}>
                <span className={styles.playerName}>{displayProfile.name}</span>
                <span className={styles.rankLine}>
                  <span className={styles.rankLabel}>{rank.badge.label}</span>
                  <strong><NjamboIcon name="crown" tone="gold" size={14} />{rank.crowns.toLocaleString("fr-FR")}</strong>
                </span>
              </span>
            </button>

            <div className={styles.headerActions}>
              <button data-nj-skin="none" data-tone="pink" type="button" className={styles.iconButton} onClick={() => openLink("notifications")} aria-label={`Notifications : ${socialCounts.notifications + socialCounts.requests} non lues`}>
                <NjamboFriendlyIcon name="notification" size={27} />
                <CountBadge count={socialCounts.notifications + socialCounts.requests} />
              </button>
              <button data-nj-skin="none" data-tone="teal" type="button" className={styles.iconButton} onClick={() => openLink("options")} aria-label="Réglages">
                <NjamboFriendlyIcon name="settings" size={27} />
              </button>
            </div>
          </header>

          <section className={styles.resourceRibbon} aria-label="Ressources">
            <ResourceButton
              kind="energy"
              asset="/assets/njambo/economy/energy-flask-64.webp"
              label={t("economy.energy")}
              value={economyPending || isGuest ? "—" : energyValue}
              numericValue={economyPending || isGuest || economy?.energy.unlimited ? undefined : economy?.energy.available}
              tone="teal"
              progress={economyPending || isGuest ? undefined : energyProgress}
              motionMode={motionMode}
              onClick={() => openLink("wallet")}
            />
            <ResourceButton
              kind="nkap"
              asset="/assets/njambo/economy/nkap-stack-64.webp"
              label={t("economy.nkap")}
              value={economyPending || isGuest ? "—" : formatRibbonAmount(displayProfile.balance)}
              numericValue={economyPending || isGuest ? undefined : displayProfile.balance}
              formatValue={formatRibbonAmount}
              fullValue={economyPending || isGuest ? undefined : displayProfile.balance.toLocaleString("fr-FR")}
              tone="gold"
              motionMode={motionMode}
              onClick={() => openLink("wallet")}
            />
            <ResourceButton
              kind="cauris"
              asset="/assets/njambo/economy/cauris-pouch-64.webp"
              label={t("economy.cauris")}
              value={economyPending || isGuest ? "—" : formatRibbonAmount(displayProfile.cauris)}
              numericValue={economyPending || isGuest ? undefined : displayProfile.cauris}
              formatValue={formatRibbonAmount}
              fullValue={economyPending || isGuest ? undefined : displayProfile.cauris.toLocaleString("fr-FR")}
              tone="pink"
              motionMode={motionMode}
              onClick={() => openLink("wallet")}
            />
          </section>
        </HubReveal>

        {!isGuest && economyError && !economy && (
          <StatusBanner
            severity="error"
            action={<button data-nj-skin="pink" type="button" className="nj-choice" onClick={() => void refresh()}>Réessayer</button>}
          >
            Impossible de charger ton énergie. Vérifie la connexion au serveur puis réessaie.
          </StatusBanner>
        )}

        <HubReveal className={styles.dashboard} order={2}>
          <section className={styles.playZone} aria-labelledby="home-play-title">
            <section className={`${styles.homeHero} ${styles.illustratedHero}${canResume ? ` ${styles.homeHeroResume}` : ""}`}>
              <Image
                className={styles.homeHeroArt}
                src="/assets/njambo/menu/mode-online.webp"
                alt=""
                fill
                priority
                sizes="(max-width: 959px) 100vw, 720px"
              />
              <span className={styles.homeHeroPattern} aria-hidden="true" />
              <div className={styles.homeHeroCopy}>
                <small>{canResume ? "Partie en cours" : t("home.playKicker")}</small>
                <div className={styles.heroActionRow}>
                  <h1 id="home-play-title">{canResume ? "La table t’attend" : t("home.playTitle")}</h1>
                  <Btn
                    tone={canResume ? "gold" : "teal"}
                    fill="solid"
                    size="lg"
                    motif="indigo-dots"
                    motifSides="both"
                    className={styles.primaryPlay}
                    onClick={handlePrimaryPlay}
                    onPointerEnter={() => preloadScene("play")}
                    onFocus={() => preloadScene("play")}
                    ariaLabel={canResume ? "Reprendre la partie en cours" : "Jouer, choisir une table"}
                  >
                    <span className={styles.primaryPlayIcon} aria-hidden="true">
                      <NjamboIcon name={canResume ? "history" : "play"} tone={canResume ? "gold" : "teal"} size={28} priority />
                    </span>
                    <span><strong>{canResume ? "Reprendre" : "Jouer"}</strong></span>
                    <span className={styles.primaryPlayArrow} aria-hidden="true">→</span>
                  </Btn>
                </div>
              </div>
              <button data-nj-skin="none" type="button" className={styles.allModesLink} onClick={() => openLink("play")} onPointerEnter={() => preloadScene("play")} onFocus={() => preloadScene("play")} aria-label="Voir tous les modes de jeu">
                <NjamboIcon name="cards" tone="teal" size={20} />
                <span className={styles.allModesText}>Modes</span>
              </button>
            </section>

            <nav className={styles.quickModes} aria-label="Accès rapides aux modes de jeu">
              {GAME_MODE_CATALOG.map((mode) => (
                <QuickModeButton
                  key={mode.scene}
                  mode={mode}
                  locked={isGameModeLocked(mode, isGuest)}
                  onOpen={() => openLink(resolveGameModeDestination(mode, isGuest))}
                  onPrefetch={() => preloadScene(resolveGameModeDestination(mode, isGuest))}
                />
              ))}
            </nav>
          </section>

          <aside className={styles.activityZone} aria-label="Activité du jour">
            <article className={`${styles.terCard} ${styles.terCompact}`}>
              <Image className={styles.terArt} src="/assets/njambo/events/defi-du-mboa.webp" alt="" fill sizes="(max-width: 959px) 100vw, 360px" />
              <div className={styles.terTexture} aria-hidden="true" />
              <div className={styles.cardEyebrow}>
                <span><span className={styles.liveDot} /> En cours</span>
                <span className={styles.ticketPill}>Ticket Bronze · {bronzeTickets}</span>
              </div>
              <div className={styles.terCopy}>
                <small>Événement du Ter</small>
                <h2>{featuredEvent.title}</h2>
              </div>
              <div className={styles.rewardLine}>
                <NjamboIcon name="sparkle" tone="gold" size={17} />
                <span><small>Récompense finale</small><strong>{featuredReward}</strong></span>
              </div>
              <Btn
                tone="pink"
                fill="solid"
                motif="indigo-dots"
                motifSides="both"
                className={styles.terAction}
                onClick={() => openLink("events")}
              >
                Voir le défi <span className={styles.actionArrow} aria-hidden="true">→</span>
              </Btn>
            </article>

            <article className={`${styles.dailyCard} ${bonusReady ? styles.dailyReady : ""}${bonusBurst ? ` ${styles.bonusBurst}` : ""}${claiming ? ` ${styles.claiming}` : ""}`}>
              <span className={styles.rewardToast} aria-hidden="true">+100 Nkap</span>
              <div className={styles.dailyHead}>
                <span className={styles.dailyWheel} aria-hidden="true">
                  <span className={styles.dailyWheelHalo} />
                  <span className={styles.dailyWheelDisc} />
                </span>
                <span><small>Rituel quotidien</small><h2>Le cadeau du quartier</h2></span>
                <strong>+100</strong>
              </div>
              <p>{economy?.daily.availableSpins ? "Ta roulette est prête après la réclamation." : "Reviens jouer : les jours s’additionnent sans se perdre."}</p>
              <div
                className={styles.loyaltyRow}
                role="progressbar"
                aria-label="Progression vers la roulette"
                aria-valuemin={0}
                aria-valuemax={7}
                aria-valuenow={loyaltyPoints}
              >
                {Array.from({ length: 7 }, (_, index) => {
                  const done = index < loyaltyPoints;
                  const next = bonusReady && index === loyaltyPoints;
                  return (
                    <span
                      aria-hidden="true"
                      key={index}
                      className={`${done ? styles.loyaltyDone : ""}${next ? ` ${styles.loyaltyNext}` : ""}`}
                    >
                      {index + 1}
                    </span>
                  );
                })}
              </div>
              <button data-nj-skin="none"
                type="button"
                className={styles.bonusAction}
                aria-live="polite"
                onClick={handleBonusAction}
                disabled={!!user && !user.isAnonymous && (!bonusReady || claiming)}
              >
                {!user || user.isAnonymous
                  ? "Créer un compte"
                  : economyPending
                    ? "Chargement…"
                    : claiming
                      ? "Versement…"
                      : bonusReady
                        ? "Récupérer 100 Nkap"
                        : "Cadeau déjà récupéré"}
              </button>
            </article>

            <nav className={styles.quickLinks} aria-label="Raccourcis">
              {QUICK_LINKS.map((link) => (
                <button
                  data-nj-skin="none"
                  data-tone={link.tone}
                  type="button"
                  key={link.scene}
                  onClick={() => openLink(link.scene)}
                  onPointerEnter={() => preloadScene(link.scene)}
                  onFocus={() => preloadScene(link.scene)}
                >
                  <span className={styles.quickLinkIcon}><NjamboIcon name={link.icon} tone={link.tone} size={23} /></span>
                  {link.label}
                  <span className={styles.quickLinkChevron} aria-hidden="true">›</span>
                </button>
              ))}
            </nav>
          </aside>
        </HubReveal>
      </div>
    </GameShell>
  );
}
