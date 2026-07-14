"use client";

import type { ReactNode } from "react";
import { useGame } from "@/contexts/GameContext";
import { NjamboIcon } from "@/components/ui/Art";
import type { BottomNavKey } from "@/components/ui/BottomNav";
import { BottomNavScene } from "@/components/ui/BottomNavScene";
import { displayFont } from "@/components/ui/Shell";
import { t } from "@/lib/i18n";

export function LiveOpsLayout({ title, subtitle, active, children }: { title: string; subtitle?: string; active?: BottomNavKey; children: ReactNode }) {
  const { navigateTo } = useGame();
  return (
    <BottomNavScene active={active} className="nj-liveops-page" contentClassName="nj-liveops-scroll">
      <header className="nj-liveops-header">
        <button type="button" className="nj-liveops-back" onClick={() => navigateTo("menu")} aria-label={t("common.back")}>
          <NjamboIcon name="home" tone="gold" size={20} />
        </button>
        <div>
          <h1 style={displayFont}>{title}</h1>
          {subtitle && <p>{subtitle}</p>}
        </div>
      </header>
      <main className="nj-liveops-content">{children}</main>
    </BottomNavScene>
  );
}
