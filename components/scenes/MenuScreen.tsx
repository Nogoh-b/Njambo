"use client";

import Image from "next/image";
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { BottomNavScene } from "@/components/ui/BottomNavScene";
import { GameModeCard, StatusBanner } from "@/components/ui/GamePrimitives";
import { AvatarIllustration, NjamboIcon, type NjamboIconName } from "@/components/ui/Art";
import { useGame } from "@/contexts/GameContext";
import { useEconomy } from "@/contexts/EconomyContext";
import { DEFAULT_EVENTS, doualaDayKey, type Reward } from "@/domain";
import { useAuth } from "@/hooks/useAuth";
import { useLiveOpsContent } from "@/hooks/useLiveOpsContent";
import {
  HOME_MOTION_FEATURES,
  getHomeResourceChange,
  resolveHomeMotionMode,
  type HomeMotionMode,
  type HomeResourceKind,
} from "@/lib/homeArcadeMotion";
import { t } from "@/lib/i18n";
import { useGsapTimeline, useMotionProfile, usePageActive } from "@/lib/motion";
import { getPlayerLevel } from "@/lib/playerLevel";
import { listenPlayer, listenSocialCounts } from "@/lib/socialData";
import type { PlayerStats, PublicPlayerProfile, SceneName } from "@/types/game";
import styles from "./MenuScreen.module.css";

type SocialCounts = { notifications: number; messages: number; requests: number };
type ModeTone = "teal" | "gold" | "pink";

interface MenuScreenProps {
  /** Type de la partie en cours à reprendre (null = rien à reprendre). */
  resumeRoomType?: "online" | "friends" | null;
  onResumeGame?: () => void;
}

interface ModeDefinition {
  scene: SceneName;
  icon: NjamboIconName;
  label: string;
  subtitle: string;
  image: string;
  tone: ModeTone;
  primary?: boolean;
  chips: Array<{ icon: NjamboIconName; label: string }>;
}

const ZERO_STATS: PlayerStats = { played: 0, won: 0, bestWin: 0 };

const RESUME_SCENE: Record<"online" | "friends", SceneName> = {
  online: "online_setup",
  friends: "friends_invite",
};

const MODES: ModeDefinition[] = [
  {
    scene: "online_setup",
    icon: "online",
    label: "Online",
    subtitle: "Affronte le Ter et fais monter ton rang",
    image: "/assets/njambo/menu/mode-online.webp",
    tone: "teal",
    primary: true,
    chips: [
      { icon: "hourglass", label: "10 énergie" },
      { icon: "coin", label: "Mise Nkap" },
      { icon: "crown", label: "Couronnes" },
    ],
  },
  {
    scene: "bot_setup",
    icon: "bot",
    label: "Contre l’IA",
    subtitle: "Entraîne ton jeu à ton rythme",
    image: "/assets/njambo/menu/mode-ai.webp",
    tone: "gold",
    chips: [
      { icon: "hourglass", label: "5 énergie" },
      { icon: "coin", label: "100/250/500 Nkap" },
    ],
  },
  {
    scene: "friends_invite",
    icon: "friends",
    label: "Entre amis",
    subtitle: "Invite ta bande autour de la table",
    image: "/assets/njambo/menu/mode-friends.webp",
    tone: "pink",
    chips: [
      { icon: "hourglass", label: "10 énergie" },
      { icon: "users", label: "Sans mise" },
    ],
  },
];

const QUICK_LINKS: Array<{ scene: SceneName; icon: NjamboIconName; label: string }> = [
  { scene: "leaderboard", icon: "trophy", label: "Classement" },
  { scene: "history", icon: "history", label: "Historique" },
  { scene: "rules", icon: "cards", label: "Règles" },
];

const SPARKS = [
  { left: "15%", top: "12%", delay: "0s", duration: "3.8s", size: "4px" },
  { left: "83%", top: "22%", delay: ".9s", duration: "4.4s", size: "3px" },
  { left: "68%", top: "77%", delay: "1.6s", duration: "4.1s", size: "4px" },
  { left: "31%", top: "84%", delay: "2.2s", duration: "4.8s", size: "3px" },
  { left: "92%", top: "58%", delay: "2.8s", duration: "5.2s", size: "2px" },
  { left: "8%", top: "64%", delay: "1.3s", duration: "4.6s", size: "2px" },
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
        <Image src={asset} alt="" width={34} height={34} />
      </span>
      <span className={styles.resourceCopy}>
        <span className={styles.resourceLabel}>{label}</span>
        <span className={styles.resourceValueRow}>
          <AnimatedResourceValue value={numericValue} fallback={value} format={formatValue} enabled={motionFeatures.reactions} />
          {feedback && (
            <span key={feedback.key} className={styles.resourceDelta} aria-hidden="true">
              {feedback.delta > 0 ? "+" : "−"}{formatValue(Math.abs(feedback.delta))}
            </span>
          )}
        </span>
        {typeof progress === "number" && (
          <span
            className={styles.energyTrack}
            role="progressbar"
            aria-label="Énergie disponible"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress)}
          >
            <span ref={progressRef} style={{ transform: `scaleX(${Math.max(0, Math.min(100, progress)) / 100})` }} />
          </span>
        )}
      </span>
    </button>
  );
}

function ModeCard({
  mode,
  resume,
  locked,
  onOpen,
  onResume,
}: {
  mode: ModeDefinition;
  resume: boolean;
  locked?: boolean;
  onOpen: () => void;
  onResume?: () => void;
}) {
  return (
    <GameModeCard
      image={mode.image}
      imageClassName={styles.modeImage}
      shadeClassName={styles.modeShade}
      variant={mode.primary ? "primary" : "secondary"}
      locked={locked}
      resume={resume}
      priority={mode.primary}
      sizes={mode.primary ? "(max-width: 899px) 100vw, 720px" : "(max-width: 479px) calc(50vw - 16px), (max-width: 899px) 50vw, 340px"}
      surface={false}
      animateIn
      className={`${styles.modeCard} ${mode.primary ? styles.modePrimary : styles.modeSecondary} ${styles[`mode${mode.tone}`]}${locked ? ` ${styles.modeLocked}` : ""}`}
    >
      <button data-nj-skin="none" type="button" className={styles.modeOpen} onClick={onOpen} aria-label={`Jouer ${mode.label}`}>
        <span className={styles.modeTopline}>
          <span className={styles.modeGlyph}><NjamboIcon name={mode.icon} tone={mode.tone} size={mode.primary ? 32 : 28} /></span>
          <span className={styles.modeKicker}>{mode.primary ? "Table classée" : "Table libre"}</span>
        </span>
        <span className={styles.modeCopy}>
          <strong>{mode.label}</strong>
          <span>{mode.subtitle}</span>
        </span>
        <span className={styles.modeChips}>
          {mode.chips.map((chip) => (
            <span key={chip.label} className={styles.modeChip}>
              <NjamboIcon name={chip.icon} tone="light" size={13} />
              {chip.label}
            </span>
          ))}
        </span>
        <span className={styles.playDisc} aria-hidden="true"><NjamboIcon name="play" tone={mode.tone} size={27} /></span>
        {locked && (
          <span className={styles.modeLock}>
            <NjamboIcon name="profile" tone="light" size={15} />
            Créer un compte
          </span>
        )}
      </button>
      {resume && onResume && (
        <button data-nj-skin="gold" type="button" className={styles.resumeRibbon} onClick={onResume}>
          <span className={styles.liveDot} aria-hidden="true" />
          Partie en cours
          <strong>Reprendre</strong>
        </button>
      )}
    </GameModeCard>
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
  const stageRef = useRef<HTMLDivElement>(null);
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
  const now = useMemo(() => Date.now(), []);
  const featuredEvent = events.find((event) => event.published && event.startsAt <= now && event.endsAt > now) ?? events[0] ?? DEFAULT_EVENTS[0];
  const featuredReward = featuredEvent.finalReward.map(rewardLabel).join(" + ");
  const bronzeTickets = Number(inventory.tickets?.bronze ?? 0);
  const loyaltyPoints = Math.min(7, Math.max(0, economy?.daily.loyaltyPoints ?? 0));
  const energyValue = economy?.energy.unlimited ? "Illimitée" : String(economy?.energy.available ?? 100);
  const energyProgress = economy?.energy.unlimited ? 100 : economy?.energy.available ?? 100;
  const economyPending = Boolean(user && !user.isAnonymous && loading && !economy);
  const isGuest = !user || user.isAnonymous;
  const rankAssetId = rank.badge.id.replaceAll("_", "-");

  const openLink = useCallback((scene: SceneName) => navigateTo(scene), [navigateTo]);

  const handleClaimBonus = async () => {
    if (!user?.uid || user.isAnonymous || claiming || !bonusReady) return;
    setClaiming(true);
    try {
      await command("claimDailyReward");
      if (motionFeatures.reactions) {
        if (bonusBurstTimerRef.current) clearTimeout(bonusBurstTimerRef.current);
        setBonusBurst(true);
        bonusBurstTimerRef.current = setTimeout(() => {
          setBonusBurst(false);
          bonusBurstTimerRef.current = null;
        }, 900);
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

  useGsapTimeline(motionFeatures.entrances && pageActive, stageRef, (gsap) => {
    const timeline = gsap.timeline({ defaults: { ease: "power3.out" } });
    timeline
      .fromTo("[data-home-enter]", { opacity: 0, y: -10 }, { opacity: 1, y: 0, duration: 0.38, stagger: 0.06 }, 0)
      .fromTo("[data-home-card]", { opacity: 0, y: 18, scale: 0.985 }, {
        opacity: 1,
        y: 0,
        scale: 1,
        duration: motion.allowFilterFx ? 0.48 : 0.36,
        stagger: motion.allowLongCascade ? 0.08 : 0.04,
      }, 0.12)
      .fromTo("[data-home-activity]", { opacity: 0, x: 14 }, { opacity: 1, x: 0, duration: 0.4, stagger: 0.06 }, 0.24);
  }, [motion.allowFilterFx, motion.allowLongCascade, motionFeatures.entrances, pageActive]);

  const motionClass = {
    full: styles.motionFull,
    balanced: styles.motionBalanced,
    lite: styles.motionLite,
    off: styles.motionOff,
  }[motionMode];

  return (
    <BottomNavScene
      active="menu"
      className={`${styles.homeScene} ${motionClass}${motion.enabled ? ` ${styles.motionOn}` : ""}${pageActive ? "" : ` ${styles.pagePaused}`}`}
      contentClassName={styles.scrollArea}
    >
      <div className={styles.ambient} aria-hidden="true">
        {SPARKS.slice(0, motionFeatures.ambientSparkCount).map((spark, index) => (
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

      <div className={styles.homeBody} ref={stageRef}>
        <header className={styles.identityBar} data-home-enter>
          <button data-nj-skin="none"
            type="button"
            className={styles.playerIdentity}
            onClick={() => openLink("profile")}
            aria-label={`${displayProfile.name}, ${rank.badge.label}, ${rank.crowns.toLocaleString("fr-FR")} couronnes. Ouvrir le profil`}
          >
            <span className={styles.avatarWrap}>
              <AvatarIllustration seed={displayProfile.emoji} size={54} online={!!user} />
              <span className={styles.levelMedal}>{level.level}</span>
            </span>
            <span className={styles.identityCopy}>
              <span className={styles.playerName}>{displayProfile.name}</span>
              <span className={styles.rankLine}>
                <Image src={`/assets/njambo/ranks/rank-${rankAssetId}-64.webp`} alt="" width={24} height={24} aria-hidden="true" />
                <span>{rank.badge.label}</span>
                <strong><NjamboIcon name="crown" tone="gold" size={14} />{rank.crowns.toLocaleString("fr-FR")}</strong>
              </span>
            </span>
          </button>

          <div className={styles.headerActions}>
            <button data-nj-skin="none" type="button" className={styles.iconButton} onClick={() => openLink("notifications")} aria-label={`Notifications : ${socialCounts.notifications + socialCounts.requests} non lues`}>
              <NjamboIcon name="notification" tone="pink" size={22} />
              <CountBadge count={socialCounts.notifications + socialCounts.requests} />
            </button>
            <button data-nj-skin="none" type="button" className={styles.iconButton} onClick={() => openLink("options")} aria-label="Réglages">
              <NjamboIcon name="settings" tone="gold" size={22} />
            </button>
          </div>
        </header>

        <section className={styles.resourceRibbon} aria-label="Ressources" data-home-enter>
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
            asset="/assets/njambo/economy/nkap-64.webp"
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
            asset="/assets/njambo/economy/cauri-64.webp"
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

        {!isGuest && economyError && !economy && (
          <StatusBanner
            severity="error"
            action={<button data-nj-skin="pink" type="button" className="nj-choice" onClick={() => void refresh()}>Réessayer</button>}
          >
            Impossible de charger ton énergie. Vérifie la connexion au serveur puis réessaie.
          </StatusBanner>
        )}

        <div className={styles.dashboard}>
          <section className={styles.playZone} aria-labelledby="home-play-title">
            <div className={styles.sectionHeading} data-home-enter>
              <span>
                <small>{t("home.playKicker")}</small>
                <h1 id="home-play-title">{t("home.playTitle")}</h1>
              </span>
              <button data-nj-skin="none" type="button" onClick={() => openLink("play")}>{t("home.allModes")} <span aria-hidden="true">→</span></button>
            </div>

            <ModeCard
              mode={MODES[0]}
              resume={resumeScene === MODES[0].scene}
              locked={isGuest}
              onOpen={() => openLink(isGuest ? "profile" : MODES[0].scene)}
              onResume={onResumeGame}
            />

            <div className={styles.secondaryModes}>
              {MODES.slice(1).map((mode) => (
                <ModeCard
                  key={mode.scene}
                  mode={mode}
                  resume={resumeScene === mode.scene}
                  locked={isGuest && mode.scene !== "bot_setup"}
                  onOpen={() => openLink(isGuest && mode.scene !== "bot_setup" ? "profile" : mode.scene)}
                  onResume={onResumeGame}
                />
              ))}
            </div>
          </section>

          <aside className={styles.activityZone} aria-label="Activité du jour">
            <article className={styles.terCard} data-home-activity>
              <Image className={styles.terArt} src="/assets/njambo/events/defi-du-mboa.webp" alt="" fill sizes="(max-width: 899px) 100vw, 360px" />
              <div className={styles.terTexture} aria-hidden="true" />
              <div className={styles.cardEyebrow}>
                <span><span className={styles.liveDot} /> En cours</span>
                <span className={styles.ticketPill}>Ticket Bronze · {bronzeTickets}</span>
              </div>
              <span className={styles.terIcon}><NjamboIcon name="trophy" tone="pink" size={28} /></span>
              <div className={styles.terCopy}>
                <small>Événement du Ter</small>
                <h2>{featuredEvent.title}</h2>
                <p>{featuredEvent.description}</p>
              </div>
              <div className={styles.eventMeta}>
                <span>{featuredEvent.stages.length} étapes</span>
                <span>{featuredEvent.allowedLosses} défaites</span>
                <span>{featuredEvent.mode === "pve" ? "Contre l’IA" : "Joueurs"}</span>
              </div>
              <div className={styles.rewardLine}>
                <NjamboIcon name="sparkle" tone="gold" size={17} />
                <span><small>Récompense finale</small><strong>{featuredReward}</strong></span>
              </div>
              <button data-nj-skin="pink" type="button" className={styles.terAction} onClick={() => openLink("events")}>Voir le défi <span aria-hidden="true">→</span></button>
            </article>

            <article className={`${styles.dailyCard} ${bonusReady ? styles.dailyReady : ""}${bonusBurst ? ` ${styles.bonusBurst}` : ""}`} data-home-activity>
              <div className={styles.dailyHead}>
                <span className={styles.dailyIcon}><Image src="/assets/njambo/economy/loyalty-wheel-64.webp" alt="" width={38} height={38} /></span>
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
                {Array.from({ length: 7 }, (_, index) => (
                  <span aria-hidden="true" key={index} className={index < loyaltyPoints ? styles.loyaltyDone : ""}>{index + 1}</span>
                ))}
              </div>
              <button data-nj-skin="gold"
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

            <nav className={styles.quickLinks} aria-label="Raccourcis" data-home-activity>
              {QUICK_LINKS.map((link) => (
                <button data-nj-skin="none" type="button" key={link.scene} onClick={() => openLink(link.scene)}>
                  <span><NjamboIcon name={link.icon} tone="gold" size={20} /></span>
                  {link.label}
                </button>
              ))}
            </nav>
          </aside>
        </div>
      </div>
    </BottomNavScene>
  );
}
