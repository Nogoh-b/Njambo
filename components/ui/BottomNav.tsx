"use client";

import { useEffect, useState } from "react";
import { useGame } from "@/contexts/GameContext";
import { useAuth } from "@/hooks/useAuth";
import { listenSocialCounts } from "@/lib/socialData";
import { NjamboIcon, type NjamboIconName } from "@/components/ui/Art";
import type { SceneName } from "@/types/game";

type SocialCounts = { notifications: number; messages: number; requests: number };
type BadgeKey = keyof SocialCounts;
export type BottomNavKey = "menu" | "players" | "notifications" | "messages" | "friends";

interface NavItem {
  key: BottomNavKey;
  scene: SceneName;
  icon: NjamboIconName;
  tone: "gold" | "teal" | "pink" | "cobalt";
  label: string;
  badge?: BadgeKey;
}

const NAV_ITEMS: NavItem[] = [
  { key: "menu", scene: "menu", icon: "home", tone: "gold", label: "Accueil" },
  { key: "players", scene: "players", icon: "search", tone: "teal", label: "Joueurs" },
  { key: "notifications", scene: "notifications", icon: "notification", tone: "pink", label: "Notifs", badge: "notifications" },
  { key: "messages", scene: "messages", icon: "message", tone: "cobalt", label: "Messages", badge: "messages" },
  { key: "friends", scene: "friends", icon: "friends", tone: "gold", label: "Social", badge: "requests" },
];

function CountBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return <span className="nj-home-badge">{count > 99 ? "99+" : count}</span>;
}

interface BottomNavProps {
  active?: BottomNavKey;
}

/** Barre de navigation boisée partagée (extraite du menu d'accueil). */
export function BottomNav({ active }: BottomNavProps) {
  const { navigateTo } = useGame();
  const { user } = useAuth();
  const [counts, setCounts] = useState<SocialCounts>({ notifications: 0, messages: 0, requests: 0 });

  useEffect(() => {
    if (!user?.uid) {
      setCounts({ notifications: 0, messages: 0, requests: 0 });
      return;
    }
    const unsub = listenSocialCounts(user.uid, setCounts);
    return unsub;
  }, [user?.uid]);

  return (
    <nav className="nj-home-bottom-nav" aria-label="Menu principal">
      {NAV_ITEMS.map((item) => {
        const isActive = item.key === active;
        return (
          <button
            type="button"
            key={item.key}
            className={`nj-home-nav-btn${isActive ? " nj-home-nav-btn-active" : ""}`}
            aria-current={isActive ? "page" : undefined}
            onClick={() => navigateTo(item.scene)}
          >
            <NjamboIcon name={item.icon} tone={item.tone} size={isActive ? 27 : 25} />
            <span>{item.label}</span>
            {item.badge && <CountBadge count={counts[item.badge]} />}
          </button>
        );
      })}
    </nav>
  );
}
