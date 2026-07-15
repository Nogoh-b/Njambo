"use client";

import { useEffect, useState } from "react";
import { useGame } from "@/contexts/GameContext";
import { useAuth } from "@/hooks/useAuth";
import { listenSocialCounts } from "@/lib/socialData";
import { t, type TranslationKey } from "@/lib/i18n";
import { NjamboIcon, type NjamboIconName } from "@/components/ui/Art";
import type { SceneName } from "@/types/game";
import styles from "./BottomNav.module.css";

type SocialCounts = { notifications: number; messages: number; requests: number };
type BadgeKey = keyof SocialCounts;
export type BottomNavKey = "menu" | "play" | "events" | "shop" | "social" | "players" | "notifications" | "messages" | "friends";

interface NavItem {
  key: BottomNavKey;
  scene: SceneName;
  icon: NjamboIconName;
  tone: "gold" | "teal" | "pink" | "cobalt";
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

function CountBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return <span className={styles.badge}>{count > 99 ? "99+" : count}</span>;
}

interface BottomNavProps {
  active?: BottomNavKey;
}

/** Dock principal partagé. Sa hauteur ne varie jamais avec l'onglet actif. */
export function BottomNav({ active }: BottomNavProps) {
  const { navigateTo } = useGame();
  const { user } = useAuth();
  const [counts, setCounts] = useState<SocialCounts>({ notifications: 0, messages: 0, requests: 0 });
  const normalizedActive: BottomNavKey | undefined = ["players", "notifications", "messages", "friends"].includes(active ?? "") ? "social" : active;

  useEffect(() => {
    if (!user?.uid) {
      setCounts({ notifications: 0, messages: 0, requests: 0 });
      return;
    }
    const unsub = listenSocialCounts(user.uid, setCounts);
    return unsub;
  }, [user?.uid]);

  return (
    <nav className={`${styles.dock} nj-home-bottom-nav`} aria-label="Menu principal">
      {NAV_ITEMS.map((item) => {
        const isActive = item.key === normalizedActive;
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
