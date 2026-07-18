"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { useGame } from "@/contexts/GameContext";
import { useAuth } from "@/hooks/useAuth";
import { listenSocialCounts } from "@/lib/socialData";
import { t, type TranslationKey } from "@/lib/i18n";
import {
  getBottomNavVisual,
  resolveHomeMotionMode,
  type BottomNavKey,
  type BottomNavTone,
} from "@/lib/homeArcadeMotion";
import { useMotionProfile, usePageActive } from "@/lib/motion";
import { NjamboIcon, type NjamboIconName } from "@/components/ui/Art";
import type { SceneName } from "@/types/game";
import styles from "./BottomNav.module.css";

export type { BottomNavKey } from "@/lib/homeArcadeMotion";

type SocialCounts = { notifications: number; messages: number; requests: number };
type BadgeKey = keyof SocialCounts;

interface NavItem {
  key: BottomNavKey;
  scene: SceneName;
  icon: NjamboIconName;
  tone: BottomNavTone;
  labelKey: TranslationKey;
  badge?: BadgeKey;
}

const NAV_ITEMS: NavItem[] = [
  { key: "menu", scene: "menu", icon: "home", tone: "gold", labelKey: "nav.home" },
  { key: "play", scene: "play", icon: "play", tone: "teal", labelKey: "nav.play" },
  { key: "events", scene: "events", icon: "trophy", tone: "pink", labelKey: "nav.events" },
  { key: "shop", scene: "shop", icon: "coin", tone: "cobalt", labelKey: "nav.shop" },
  { key: "social", scene: "friends", icon: "friends", tone: "gold", labelKey: "nav.social", badge: "requests" },
];

const NAV_TONE_CSS: Record<BottomNavTone, string> = {
  gold: "var(--nj-gold, var(--gold, #d0a35d))",
  teal: "var(--nj-teal, var(--teal, #10b7a6))",
  pink: "var(--nj-pink, var(--pink, #d83c68))",
  cobalt: "var(--nj-cobalt, var(--cobalt, #3154d4))",
};

function CountBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return <span key={count} className={styles.badge}>{count > 99 ? "99+" : count}</span>;
}

interface BottomNavProps {
  active?: BottomNavKey;
}

/** Dock principal partagé. Sa hauteur ne varie jamais avec l'onglet actif. */
export function BottomNav({ active }: BottomNavProps) {
  const { navigateTo } = useGame();
  const { user } = useAuth();
  const motion = useMotionProfile();
  const pageActive = usePageActive();
  const [counts, setCounts] = useState<SocialCounts>({ notifications: 0, messages: 0, requests: 0 });
  const motionMode = resolveHomeMotionMode(motion.enabled, motion.level);
  const navVisual = getBottomNavVisual(active);
  const navStyle = {
    "--active-index": navVisual?.index ?? 0,
    "--active-tone": navVisual ? NAV_TONE_CSS[navVisual.tone] : "transparent",
  } as CSSProperties;

  useEffect(() => {
    if (!user?.uid) {
      setCounts({ notifications: 0, messages: 0, requests: 0 });
      return;
    }
    const unsub = listenSocialCounts(user.uid, setCounts);
    return unsub;
  }, [user?.uid]);

  return (
    <nav
      className={`${styles.dock}${motion.enabled ? ` ${styles.motionOn}` : ""}${navVisual ? ` ${styles.hasActive}` : ""} nj-home-bottom-nav`}
      data-motion-level={motionMode}
      data-page-active={pageActive}
      style={navStyle}
      aria-label="Menu principal"
    >
      {NAV_ITEMS.map((item) => {
        const isActive = item.key === navVisual?.key;
        const label = t(item.labelKey);
        return (
          <button
            data-nj-skin="none"
            type="button"
            key={item.key}
            className={`${styles.item}${isActive ? ` ${styles.active}` : ""}`}
            aria-current={isActive ? "page" : undefined}
            aria-label={label}
            onClick={() => navigateTo(item.scene)}
          >
            <span className={styles.iconShell} aria-hidden="true">
              <NjamboIcon name={item.icon} tone={item.tone} size={26} />
            </span>
            <span className={styles.label}>{label}</span>
            {item.badge && <CountBadge count={counts[item.badge]} />}
          </button>
        );
      })}
    </nav>
  );
}
