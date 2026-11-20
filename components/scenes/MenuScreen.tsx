"use client";

import Image from "next/image";
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { motion } from "motion/react";
import { GameShell } from "@/components/ui/GameShell";
import { GameModal } from "@/components/ui/GameModal";
import { AvatarIllustration, NjamboIcon, type NjamboIconName, type NjamboIconTone } from "@/components/ui/Art";
import { MAX_EQUIPPED_POWERS, POWER_CARDS_BY_ID } from "@/config/powerCards";
import { useGame } from "@/contexts/GameContext";
import { useEconomy } from "@/contexts/EconomyContext";
import { DEFAULT_EVENTS, doualaDayKey, type Reward } from "@/domain";
import { useAuth } from "@/hooks/useAuth";
import { useLiveOpsContent } from "@/hooks/useLiveOpsContent";
import {
  GAME_MODE_CATALOG,
  isGameModeLocked,
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
import { rankAssetSrc } from "@/lib/playerRank";
import { preloadScene } from "@/lib/scenePreload";
import { listenPlayer, listenSocialCounts } from "@/lib/socialData";
import type { PlayerStats, PublicPlayerProfile, SceneName } from "@/types/game";
import { eventArt } from "@/lib/eventArt";
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

const RIGHT_LINKS: Array<{ scene: SceneName; icon: NjamboIconName; tone: NjamboIconTone; enamel: string; label: string; sub: string }> = [
  { scene: "leaderboard", icon: "trophy", tone: "gold", enamel: "enamelGold", label: "Rang", sub: "Top Mboa" },
  { scene: "history", icon: "history", tone: "teal", enamel: "enamelTeal", label: "Parties", sub: "Historique" },
  { scene: "rules", icon: "cards", tone: "cobalt", enamel: "enamelCobalt", label: "Règles", sub: "Guide rapide" },
];

/* Main emblématique Njambo en éventail naturel gauche → droite (toutes les 5 cartes lisibles). */
const HERO_FAN_CARDS = [
  { rank: "7", suit: "♠", red: false, rot: -20, x: -94, y: 20, featured: false, note: "7 de Pique · L’embuscade du quartier" },
  { rank: "A", suit: "♥", red: true, rot: -10, x: -47, y: 6, featured: false, note: "As de Cœur · Maître de la couleur" },
  { rank: "3", suit: "♦", red: true, rot: 0, x: 0, y: -4, featured: true, note: "3 de Carreau · La carte fétiche du Njambo !" },
  { rank: "10", suit: "♣", red: false, rot: 10, x: 47, y: 6, featured: false, note: "10 de Trèfle · Coup sec au dernier pli" },
  { rank: "K", suit: "♠", red: false, rot: 20, x: 94, y: 20, featured: false, note: "Roi de Pique · Autorité sur la table" },
] as const;

const SPARKS = [
  { left: "14%", top: "18%", delay: "0s", duration: "3.8s", size: "4px" },
  { left: "84%", top: "24%", delay: "0.9s", duration: "4.4s", size: "3.5px" },
  { left: "74%", top: "70%", delay: "1.6s", duration: "4.0s", size: "4px" },
  { left: "24%", top: "74%", delay: "2.1s", duration: "4.6s", size: "3px" },
  { left: "90%", top: "52%", delay: "0.6s", duration: "5.0s", size: "3px" },
  { left: "9%", top: "50%", delay: "1.3s", duration: "4.5s", size: "3.5px" },
  { left: "34%", top: "26%", delay: "1.9s", duration: "5.2s", size: "3px" },
  { left: "66%", top: "22%", delay: "2.5s", duration: "4.3s", size: "4px" },
  { left: "48%", top: "64%", delay: "0.4s", duration: "4.9s", size: "3px" },
  { left: "58%", top: "34%", delay: "1.1s", duration: "3.9s", size: "3.5px" },
];

const SUIT_WATERMARKS = [
  { suit: "♠", left: "6%", top: "14%", rot: "-18deg", delay: "0s", dur: "11s" },
  { suit: "♥", left: "86%", top: "16%", rot: "16deg", delay: "2.2s", dur: "13s" },
  { suit: "♦", left: "10%", top: "76%", rot: "14deg", delay: "4s", dur: "12s" },
  { suit: "♣", left: "88%", top: "74%", rot: "-15deg", delay: "1.4s", dur: "14s" },
] as const;

const BURST_ANGLES = [0, 60, 120, 180, 240, 300] as const;

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

    const duration = previous === null ? 420 : 540;
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

function ResourcePillButton({
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
    setFeedback({ direction: change.direction, delta: change.delta, key: Date.now() });
    feedbackTimerRef.current = setTimeout(() => {
      setFeedback(null);
      feedbackTimerRef.current = null;
    }, 850);
  }, [kind, motionMode, numericValue]);

  useEffect(() => () => {
    if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
  }, []);

  const feedbackClass = feedback?.direction === "gain"
    ? styles.resourceGain
    : feedback?.direction === "spend"
      ? styles.resourceSpend
      : "";

  return (
    <button
      data-nj-skin="none"
      type="button"
      className={`${styles.resourcePill} ${styles[`pill_${tone}`]}${feedbackClass ? ` ${feedbackClass}` : ""}`}
      data-resource={kind}
      onClick={onClick}
      aria-label={`${label} : ${fullValue ?? value}. Ouvrir le portefeuille`}
      title={fullValue && fullValue !== value ? fullValue : undefined}
    >
      <span className={styles.pillSheen} aria-hidden="true" />
      <span className={styles.resourceIcon} aria-hidden="true">
        <Image src={asset} alt="" width={26} height={26} />
      </span>
      <span className={styles.resourceBody}>
        <span className={styles.resourceValRow}>
          <AnimatedResourceValue value={numericValue} fallback={value} format={formatValue} enabled={motionFeatures.reactions} />
          {feedback && (
            <span key={feedback.key} className={styles.resourceDelta} aria-hidden="true">
              {feedback.delta > 0 ? "+" : "−"}{formatValue(Math.abs(feedback.delta))}
            </span>
          )}
        </span>
        {typeof progress === "number" ? (
          <span className={styles.energyTrack} aria-hidden="true">
            <span style={{ transform: `scaleX(${Math.max(0, Math.min(100, progress)) / 100})` }} />
          </span>
        ) : (
          <span className={styles.resourceLabel}>{label}</span>
        )}
      </span>
    </button>
  );
}

function ModeChipButton({
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
      className={`${styles.modeChip} ${styles[`chip_${mode.tone}`]}${locked ? ` ${styles.modeChipLocked}` : ""}`}
      onClick={onOpen}
      onPointerEnter={onPrefetch}
      onFocus={onPrefetch}
      aria-label={`${locked ? "Créer un compte pour jouer à" : "Jouer à"} ${mode.title}`}
    >
      <span className={styles.chipGleam} aria-hidden="true" />
      <span className={styles.modeChipIcon} aria-hidden="true">
        <NjamboIcon name={mode.icon} tone={mode.tone} size={20} />
      </span>
      <span className={styles.modeChipText}>{mode.shortTitle}</span>
      {locked && (
        <span className={styles.modeChipLock} aria-hidden="true">
          <NjamboIcon name="profile" tone="light" size={11} />
        </span>
      )}
    </button>
  );
}

export function MenuScreen({ resumeRoomType = null, onResumeGame }: MenuScreenProps) {
  const { profile, navigateTo } = useGame();
  const motionProfile = useMotionProfile();
  const pageActive = usePageActive();
  const motionMode = resolveHomeMotionMode(motionProfile.enabled, motionProfile.level);
  const motionFeatures = HOME_MOTION_FEATURES[motionMode];
  const { user } = useAuth();
  const { economy, inventory, rank, loading, error: economyError, refresh, command } = useEconomy();
  const { events } = useLiveOpsContent();
  const [socialCounts, setSocialCounts] = useState<SocialCounts>({ notifications: 0, messages: 0, requests: 0 });
  const [onlineProfile, setOnlineProfile] = useState<PublicPlayerProfile | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [bonusBurst, setBonusBurst] = useState(false);
  const [dailyModalOpen, setDailyModalOpen] = useState(false);
  const [activeCardIdx, setActiveCardIdx] = useState<number | null>(null);
  const [cardBurstState, setCardBurstState] = useState<{ idx: number; key: number } | null>(null);
  const [dealCycle, setDealCycle] = useState(0);
  const bonusBurstTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cardBurstTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const equippedPowerCount = useMemo(() => {
    const owned = new Set(
      Object.entries(inventory.powerCards ?? {})
        .filter(([, qty]) => Number(qty) > 0)
        .map(([id]) => id),
    );
    const raw = profile.equippedPowers ?? [];
    return raw
      .filter((id) => Boolean(POWER_CARDS_BY_ID[id]) && owned.has(id))
      .slice(0, MAX_EQUIPPED_POWERS).length;
  }, [inventory.powerCards, profile.equippedPowers]);

  const level = getPlayerLevel(displayProfile.stats, displayProfile.balance);
  const bonusReady = !!economy && economy.daily.lastClaimDay !== doualaDayKey();
  const resumeScene = resumeRoomType ? RESUME_SCENE[resumeRoomType] : null;
  const canResume = Boolean(resumeScene && onResumeGame);
  const now = useMemo(() => Date.now(), []);
  const featuredEvent = events.find((event) => event.published && event.startsAt <= now && event.endsAt > now) ?? events[0] ?? DEFAULT_EVENTS[0];
  const featuredReward = featuredEvent.finalReward.map(rewardLabel).join(" + ");
  const featuredEventArt = eventArt(featuredEvent, "thumb");
  const bronzeTickets = Number(inventory.tickets?.bronze ?? 0);
  const loyaltyPoints = Math.min(7, Math.max(0, economy?.daily.loyaltyPoints ?? 0));
  const energyValue = economy?.energy.unlimited ? "∞" : String(economy?.energy.available ?? 100);
  const energyProgress = economy?.energy.unlimited ? 100 : economy?.energy.available ?? 100;
  const economyPending = Boolean(user && !user.isAnonymous && loading && !economy);
  const isGuest = !user || user.isAnonymous === true;
  const rankSrc = rankAssetSrc(rank.badge);
  const entrancesOn = motionProfile.enabled && motionFeatures.entrances;
  const sparkCount = motionProfile.allowParticles
    ? motionMode === "full"
      ? SPARKS.length
      : motionFeatures.ambientSparkCount
    : 0;

  const openLink = useCallback((scene: SceneName) => navigateTo(scene), [navigateTo]);

  const handlePrimaryPlay = () => {
    if (canResume) {
      onResumeGame?.();
      return;
    }
    openLink("play");
  };

  const handleCardTap = (index: number) => {
    setActiveCardIdx((prev) => {
      const next = prev === index ? null : index;
      if (next !== null && motionProfile.enabled) {
        if (cardBurstTimerRef.current) clearTimeout(cardBurstTimerRef.current);
        setCardBurstState({ idx: index, key: Date.now() });
        cardBurstTimerRef.current = setTimeout(() => {
          setCardBurstState(null);
          cardBurstTimerRef.current = null;
        }, 680);
      }
      return next;
    });
  };

  const handleShuffleFan = () => {
    setActiveCardIdx(null);
    setCardBurstState(null);
    setDealCycle((c) => c + 1);
  };

  const handleClaimBonus = async () => {
    if (!user?.uid || user.isAnonymous || claiming || !bonusReady) return;
    setClaiming(true);
    try {
      await command("claimDailyReward");
      if (motionProfile.enabled) {
        if (bonusBurstTimerRef.current) clearTimeout(bonusBurstTimerRef.current);
        setBonusBurst(true);
        bonusBurstTimerRef.current = setTimeout(() => {
          setBonusBurst(false);
          bonusBurstTimerRef.current = null;
        }, 1200);
      }
    } finally {
      setClaiming(false);
    }
  };

  const handleBonusAction = () => {
    if (!user || user.isAnonymous) {
      setDailyModalOpen(false);
      openLink("profile");
      return;
    }
    void handleClaimBonus();
  };

  useEffect(() => () => {
    if (bonusBurstTimerRef.current) clearTimeout(bonusBurstTimerRef.current);
    if (cardBurstTimerRef.current) clearTimeout(cardBurstTimerRef.current);
  }, []);

  const motionClass = {
    full: styles.motionFull,
    balanced: styles.motionBalanced,
    lite: styles.motionLite,
    off: styles.motionOff,
  }[motionMode];

  const activeCardNote = activeCardIdx !== null ? HERO_FAN_CARDS[activeCardIdx]?.note : null;

  return (
    <GameShell
      active="menu"
      dock={false}
      scroll={false}
      className={`${styles.lobbyScene} ${motionClass}${motionProfile.enabled ? ` ${styles.motionOn}` : ""}${pageActive ? "" : ` ${styles.pagePaused}`}`}
      contentClassName={styles.lobbyFrame}
    >
      {/* Faisceau doré du lustre du Salon Royal + filigrane flottant + lucioles dorées */}
      <div className={styles.salonSpotlight} aria-hidden="true" />

      <div className={styles.feltWatermarks} aria-hidden="true">
        {SUIT_WATERMARKS.map((mark, index) => (
          <span
            key={index}
            style={{
              left: mark.left,
              top: mark.top,
              "--wm-rot": mark.rot,
              animationDelay: mark.delay,
              animationDuration: mark.dur,
            } as CSSProperties}
          >
            {mark.suit}
          </span>
        ))}
      </div>

      <div className={styles.ambient} aria-hidden="true">
        {SPARKS.slice(0, sparkCount).map((spark, index) => (
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

      {/* ═══ ZONE 1 : HUD SUPÉRIEUR COMPACT (fixe) ═══ */}
      <motion.header
        className={styles.topHud}
        initial={entrancesOn ? { opacity: 0, y: -14 } : false}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className={styles.hudRow}>
          <button
            data-nj-skin="none"
            type="button"
            className={styles.playerCrest}
            onClick={() => openLink("profile")}
            aria-label={`${displayProfile.name}, ${rank.badge.label}, ${rank.crowns.toLocaleString("fr-FR")} couronnes. Ouvrir le profil`}
          >
            <span className={styles.crestSheen} aria-hidden="true" />
            <span className={styles.avatarFrame}>
              <span className={styles.avatarAura} aria-hidden="true" />
              <AvatarIllustration seed={displayProfile.emoji} size={42} online={!!user} />
              <span className={styles.levelBadge}>{level.level}</span>
            </span>
            <span className={styles.identityMeta}>
              <span className={styles.playerName}>{displayProfile.name}</span>
              <span className={styles.rankRow}>
                <Image src={rankSrc} alt="" width={16} height={16} className={styles.rankImg} />
                <span className={styles.rankName}>{rank.badge.label}</span>
                <strong className={styles.crownCount}>
                  <NjamboIcon name="crown" tone="gold" size={12} />
                  {rank.crowns.toLocaleString("fr-FR")}
                </strong>
              </span>
            </span>
          </button>

          <div className={styles.hudActions}>
            <button
              data-nj-skin="none"
              type="button"
              className={`${styles.hudIconBtn} ${styles.hudBtnPink}`}
              onClick={() => openLink("notifications")}
              aria-label={`Notifications : ${socialCounts.notifications + socialCounts.requests} non lues`}
            >
              <NjamboIcon name="notification" tone="pink" size={24} />
              <CountBadge count={socialCounts.notifications + socialCounts.requests} />
            </button>
            <button
              data-nj-skin="none"
              type="button"
              className={`${styles.hudIconBtn} ${styles.hudBtnTeal}`}
              onClick={() => openLink("options")}
              aria-label="Réglages"
            >
              <NjamboIcon name="settings" tone="teal" size={24} />
            </button>
          </div>
        </div>

        <section className={styles.resourceBar} aria-label="Ressources">
          <ResourcePillButton
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
          <ResourcePillButton
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
          <ResourcePillButton
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

        {!isGuest && economyError && !economy && (
          <div className={styles.errorToast} role="alert">
            <span>Connexion économie interrompue</span>
            <button data-nj-skin="none" type="button" onClick={() => void refresh()}>Réessayer</button>
          </div>
        )}
      </motion.header>

      {/* ═══ ZONE 2 : ARÈNE DE TABLE (Tapis 3D acajou/émeraude + Badges émaillés) ═══ */}
      <section className={styles.arenaStage} aria-label="Salon de jeu Njambo">
        {/* Rail gauche : Boutique · Pouvoirs · Cadeau */}
        <motion.nav
          className={styles.sideRailLeft}
          aria-label="Boutique et récompenses"
          initial={entrancesOn ? { opacity: 0, x: -18 } : false}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.38, delay: 0.06, ease: [0.22, 1, 0.36, 1] }}
        >
          <button
            data-nj-skin="none"
            type="button"
            className={`${styles.jewelTile} ${styles.enamelGold} ${styles.tilePulseGleam}`}
            onClick={() => openLink("shop")}
            onPointerEnter={() => preloadScene("shop")}
            aria-label="Ouvrir la boutique"
          >
            <span className={styles.tileGleam} aria-hidden="true" />
            <span className={styles.tileIconWrap} aria-hidden="true">
              <NjamboIcon name="coin" tone="gold" size={25} />
            </span>
            <span className={styles.tileMeta}>
              <strong>Boutique</strong>
              <small>Livres & packs</small>
            </span>
          </button>

          <button
            data-nj-skin="none"
            type="button"
            className={`${styles.jewelTile} ${styles.enamelPurple}`}
            onClick={() => openLink("power_collection")}
            onPointerEnter={() => preloadScene("power_collection")}
            aria-label="Ouvrir mes cartes Pouvoir"
          >
            <span className={styles.tileGleam} aria-hidden="true" />
            <span className={styles.tileIconWrap} aria-hidden="true">
              <NjamboIcon name="sparkle" tone="cobalt" size={25} />
            </span>
            <span className={styles.tileMeta}>
              <strong>Pouvoirs</strong>
              <small>{equippedPowerCount > 0 ? `${equippedPowerCount}/${MAX_EQUIPPED_POWERS} prêts` : "Mon deck"}</small>
            </span>
            {equippedPowerCount > 0 && (
              <span className={styles.deckMiniTag} aria-hidden="true">
                {equippedPowerCount}/{MAX_EQUIPPED_POWERS}
              </span>
            )}
          </button>

          <button
            data-nj-skin="none"
            type="button"
            className={`${styles.jewelTile} ${styles.enamelOrange}${bonusReady ? ` ${styles.tileReady}` : ""}`}
            onClick={() => setDailyModalOpen(true)}
            aria-label={bonusReady ? "Cadeau du quartier prêt à récupérer" : "Ouvrir le cadeau du quartier"}
          >
            <span className={styles.tileGleam} aria-hidden="true" />
            <span className={`${styles.tileIconWrap} ${styles.wheelIconWrap}`} aria-hidden="true">
              <Image src="/assets/njambo/economy/loyalty-wheel-128.webp" alt="" width={30} height={30} />
            </span>
            <span className={styles.tileMeta}>
              <strong>Cadeau</strong>
              <small>{bonusReady ? "+100 prêt" : `Jour ${loyaltyPoints}/7`}</small>
            </span>
            {bonusReady && <span className={styles.alertDot} aria-hidden="true">!</span>}
          </button>
        </motion.nav>

        {/* Centre : Table ovale 3D en acajou & or + éventail vivant des 5 cartes */}
        <motion.div
          className={styles.tableCenterpiece}
          initial={entrancesOn ? { opacity: 0, scale: 0.94 } : false}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.42, delay: 0.04, ease: [0.22, 1, 0.36, 1] }}
        >
          {/* Halo solaire rotatif derrière la table royale */}
          <span className={styles.tableSunburst} aria-hidden="true" />

          <div className={styles.tableOval} aria-hidden="true">
            <span className={styles.tableRailShine} />
            <span className={`${styles.tableRivet} ${styles.rivetTL}`} />
            <span className={`${styles.tableRivet} ${styles.rivetTR}`} />
            <span className={`${styles.tableRivet} ${styles.rivetBL}`} />
            <span className={`${styles.tableRivet} ${styles.rivetBR}`} />
            <span className={styles.tableFeltBed}>
              <span className={styles.tableOvalInner} />
              <span className={styles.feltLightSweep} />
            </span>

            {/* Jetons & cauris 2,5D posés sur le rebord de table */}
            <span className={styles.tablePropLeft}>
              <Image src="/assets/njambo/economy/nkap-64.webp" alt="" width={28} height={28} />
            </span>
            <span className={styles.tablePropRight}>
              <Image src="/assets/njambo/economy/cauri-64.webp" alt="" width={26} height={26} />
            </span>
          </div>

          <div className={styles.brandBanner}>
            <span className={styles.statusPill}>
              <span className={styles.statusDot} aria-hidden="true" />
              {canResume ? "Partie en cours" : t("home.playKicker")}
            </span>
            <div className={styles.wordmarkRow}>
              <span className={styles.brandCrown} aria-hidden="true">
                <NjamboIcon name="crown" tone="gold" size={18} />
              </span>
              <h1 className={styles.brandWordmark}>NJAMBO</h1>
            </div>
          </div>

          <div key={dealCycle} className={styles.cardFan} role="group" aria-label="Main de cartes Njambo">
            <span className={`${styles.deckBack} ${styles.deckBackLeft}`} aria-hidden="true" />
            <span className={`${styles.deckBack} ${styles.deckBackRight}`} aria-hidden="true" />

            {HERO_FAN_CARDS.map((card, index) => {
              const selected = activeCardIdx === index;
              const isBursting = cardBurstState?.idx === index;
              return (
                <button
                  key={`${card.rank}${card.suit}`}
                  data-nj-skin="none"
                  type="button"
                  className={`${styles.playCard}${card.red ? ` ${styles.cardRed}` : ""}${card.featured ? ` ${styles.cardFeatured}` : ""}${selected ? ` ${styles.cardSelected}` : ""}`}
                  style={{
                    "--card-rot": `${card.rot}deg`,
                    "--card-x": `${card.x}%`,
                    "--card-y": `${card.y}px`,
                    "--card-z": selected ? 10 : index + 1,
                    "--deal-delay": `${0.06 + index * 0.065}s`,
                  } as CSSProperties}
                  onClick={() => handleCardTap(index)}
                  aria-label={`Carte ${card.rank} ${card.suit}`}
                  aria-pressed={selected}
                >
                  {(card.featured || selected) && <span className={styles.cardHolo} aria-hidden="true" />}
                  {isBursting && cardBurstState && (
                    <span key={cardBurstState.key} className={styles.cardBurst} aria-hidden="true">
                      <span className={styles.cardBurstRing} />
                      {BURST_ANGLES.map((deg) => (
                        <span
                          key={deg}
                          className={styles.cardBurstSpark}
                          style={{ "--spark-deg": `${deg}deg` } as CSSProperties}
                        />
                      ))}
                    </span>
                  )}
                  <span className={styles.cardCornerTop}>
                    <span>{card.rank}</span>
                    <span>{card.suit}</span>
                  </span>
                  <span className={styles.cardCenterSuit} aria-hidden="true">{card.suit}</span>
                  <span className={styles.cardCornerBottom} aria-hidden="true">
                    <span>{card.rank}</span>
                    <span>{card.suit}</span>
                  </span>
                </button>
              );
            })}
          </div>

          <div className={styles.tableFooterNote}>
            <span className={styles.chipDotGold} aria-hidden="true" />
            <p className={styles.tableTagline}>
              {activeCardNote ?? (canResume ? "La table t’attend — reprends ta main" : "Cartes, bluff & mboko")}
            </p>
            <button
              data-nj-skin="none"
              type="button"
              className={styles.shuffleBtn}
              onClick={handleShuffleFan}
              title="Rebattre la main"
              aria-label="Rebattre les cartes de présentation"
            >
              ↻
            </button>
          </div>
        </motion.div>

        {/* Rail droit : Social · Rang · Parties · Règles */}
        <motion.nav
          className={styles.sideRailRight}
          aria-label="Social et classements"
          initial={entrancesOn ? { opacity: 0, x: 18 } : false}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.38, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
        >
          <button
            data-nj-skin="none"
            type="button"
            className={`${styles.jewelTile} ${styles.enamelPalm}`}
            onClick={() => openLink("friends")}
            onPointerEnter={() => preloadScene("friends")}
            aria-label={`Social et amis${socialCounts.requests > 0 ? `, ${socialCounts.requests} demandes` : ""}`}
          >
            <span className={styles.tileGleam} aria-hidden="true" />
            <span className={styles.tileIconWrap} aria-hidden="true">
              <NjamboIcon name="users" tone="palm" size={25} />
            </span>
            <span className={styles.tileMeta}>
              <strong>Social</strong>
              <small>Amis & club</small>
            </span>
            <CountBadge count={socialCounts.requests} />
          </button>

          {RIGHT_LINKS.map((link) => (
            <button
              key={link.scene}
              data-nj-skin="none"
              type="button"
              className={`${styles.jewelTile} ${styles[link.enamel]}`}
              onClick={() => openLink(link.scene)}
              onPointerEnter={() => preloadScene(link.scene)}
              onFocus={() => preloadScene(link.scene)}
              aria-label={link.label}
            >
              <span className={styles.tileGleam} aria-hidden="true" />
              <span className={styles.tileIconWrap} aria-hidden="true">
                <NjamboIcon name={link.icon} tone={link.tone} size={24} />
              </span>
              <span className={styles.tileMeta}>
                <strong>{link.label}</strong>
                <small>{link.sub}</small>
              </span>
            </button>
          ))}
        </motion.nav>
      </section>

      {/* ═══ ZONE 3 : CONSOLE D'ACTION BASSE (sans barre de menu lourde !) ═══ */}
      <motion.footer
        className={styles.bottomConsole}
        initial={entrancesOn ? { opacity: 0, y: 18 } : false}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.12, ease: [0.22, 1, 0.36, 1] }}
      >
        {/* Carte Événement du Ter en direct */}
        <button
          data-nj-skin="none"
          type="button"
          className={styles.eventBanner}
          onClick={() => openLink("events")}
          onPointerEnter={() => preloadScene("events")}
          aria-label={`Événement en cours : ${featuredEvent.title}, récompense ${featuredReward}`}
        >
          <span className={styles.bannerSheen} aria-hidden="true" />
          <span className={styles.eventBannerThumb} aria-hidden="true">
            <Image src={featuredEventArt.src} unoptimized={featuredEventArt.remote} alt="" fill sizes="120px" />
            <span className={styles.livePulse} />
          </span>
          <span className={styles.eventBannerCopy}>
            <span className={styles.eventBannerTop}>
              <small>Événement du Ter</small>
              <span className={styles.ticketChip}>Bronze · {bronzeTickets}</span>
            </span>
            <strong>{featuredEvent.title}</strong>
            <span className={styles.eventBannerReward}>
              <NjamboIcon name="sparkle" tone="gold" size={13} />
              {featuredReward}
            </span>
          </span>
          <span className={styles.eventBannerChevron} aria-hidden="true">›</span>
        </button>

        {/* Bloc central : Gros bouton 3D JOUER + 3 modes rapides */}
        <div className={styles.playCluster}>
          <button
            data-nj-skin="none"
            type="button"
            className={`${styles.heroPlayBtn}${canResume ? ` ${styles.heroPlayResume}` : ""}`}
            onClick={handlePrimaryPlay}
            onPointerEnter={() => preloadScene("play")}
            onFocus={() => preloadScene("play")}
            aria-label={canResume ? "Reprendre la partie en cours" : "Jouer, choisir une table"}
          >
            <span className={styles.heroPlaySheen} aria-hidden="true" />
            <span className={styles.heroPlayEmblem} aria-hidden="true">
              <NjamboIcon name={canResume ? "history" : "play"} tone={canResume ? "teal" : "gold"} size={30} priority />
            </span>
            <span className={styles.heroPlayCopy}>
              <strong>{canResume ? "REPRENDRE" : "JOUER"}</strong>
              <small>{canResume ? "Retourner à la table" : "Choisir ta table du Mboa"}</small>
            </span>
            <span className={styles.heroPlayArrow} aria-hidden="true">→</span>
          </button>

          <nav className={styles.quickModesStrip} aria-label="Accès rapides aux modes">
            {GAME_MODE_CATALOG.map((mode) => (
              <ModeChipButton
                key={mode.scene}
                mode={mode}
                locked={isGameModeLocked(mode, isGuest)}
                onOpen={() => openLink(mode.scene)}
                onPrefetch={() => preloadScene(mode.scene)}
              />
            ))}
          </nav>
        </div>
      </motion.footer>

      {/* ═══ POPUP MODALE : CADEAU DU QUARTIER ═══ */}
      <GameModal
        open={dailyModalOpen}
        onClose={() => setDailyModalOpen(false)}
        kicker="Rituel quotidien"
        title="Le cadeau du quartier"
        tone="gold"
        footer={
          <button
            data-nj-skin="none"
            type="button"
            className={`${styles.modalClaimBtn}${bonusReady ? ` ${styles.modalClaimReady}` : ""}`}
            onClick={handleBonusAction}
            disabled={!!user && !user.isAnonymous && (!bonusReady || claiming)}
          >
            {!user || user.isAnonymous
              ? "Créer un compte pour réclamer"
              : economyPending
                ? "Chargement…"
                : claiming
                  ? "Versement…"
                  : bonusReady
                    ? "Récupérer +100 Nkap"
                    : "Déjà récupéré aujourd’hui"}
          </button>
        }
      >
        <div className={`${styles.dailyModalBody}${bonusBurst ? ` ${styles.bonusBurst}` : ""}`}>
          <span className={styles.rewardToast} aria-hidden="true">+100 Nkap !</span>
          <div className={styles.dailyHeroRow}>
            <span className={styles.wheelMedallion} aria-hidden="true">
              <span className={styles.wheelMedallionRays} />
              <Image src="/assets/njambo/economy/loyalty-wheel-128.webp" alt="" width={68} height={68} />
            </span>
            <div className={styles.dailyHeroCopy}>
              <strong className={styles.dailyRewardAmount}>+100 Nkap</strong>
              <p>
                {economy?.daily.availableSpins
                  ? "Ta roulette de fidélité est prête après la réclamation !"
                  : "Reviens jouer chaque jour : tes 7 étapes s’additionnent sans jamais repartir à zéro."}
              </p>
            </div>
          </div>

          <div
            className={styles.loyaltyTrack}
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
                <div
                  key={index}
                  className={`${styles.loyaltyStep}${done ? ` ${styles.stepDone}` : ""}${next ? ` ${styles.stepNext}` : ""}`}
                >
                  <span className={styles.stepNum}>{done ? "✓" : index + 1}</span>
                  <small>{index === 6 ? "Roue" : `J${index + 1}`}</small>
                </div>
              );
            })}
          </div>
        </div>
      </GameModal>
    </GameShell>
  );
}
