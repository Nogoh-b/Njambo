"use client";

import Image from "next/image";
import type { CSSProperties } from "react";
import { T } from "@/config/theme";
import { NjamboIcon, type NjamboIconName } from "@/components/ui/Art";
import type { PowerCardDef, PowerCategory, PowerRarity } from "@/types/game";

const CATEGORY_LABEL: Record<PowerCategory, string> = {
  offensive: "Offensive",
  defense: "Défense",
  score: "Score",
  tactical: "Tactique",
  perturbation: "Perturbation",
  economy: "Économie",
};

const RARITY_LABEL: Record<PowerRarity, string> = {
  common: "Commune",
  rare: "Rare",
  epic: "Épique",
  legendary: "Légendaire",
};

export function cardToneColor(tone: string): string {
  return tone === "gold" ? T.gold : tone === "teal" ? T.teal : tone === "pink" ? T.pink : T.cobalt;
}

interface PowerCardViewProps {
  card: PowerCardDef;
  qty?: number;
  selected?: boolean;
  disabled?: boolean;
  compact?: boolean;
  showMeta?: boolean;
  className?: string;
  surface?: "default" | "solar";
}

export function PowerCardView({
  card,
  qty,
  selected = false,
  disabled = false,
  compact = false,
  showMeta = true,
  className,
  surface = "default",
}: PowerCardViewProps) {
  const tone = cardToneColor(card.tone);
  return (
    <div
      className={[
        "nj-power-card-view",
        `nj-power-card-${card.rarity}`,
        selected ? "is-selected" : "",
        disabled ? "is-disabled" : "",
        compact ? "is-compact" : "",
        surface === "solar" ? "is-solar" : "",
        className ?? "",
      ].filter(Boolean).join(" ")}
      style={{ "--power-tone": tone } as CSSProperties}
    >
      <div className="nj-power-card-art" aria-hidden="true">
        <Image src={card.art} alt="" fill sizes={compact ? "56px" : "84px"} />
        <span className="nj-power-card-sheen" />
      </div>
      <div className="nj-power-card-body">
        <div className="nj-power-card-topline">
          <span className="nj-power-card-icon">
            <NjamboIcon name={card.icon as NjamboIconName} tone={card.tone} size={compact ? 16 : 18} />
          </span>
          {qty !== undefined && qty > 0 && <span className="nj-power-card-qty">×{qty}</span>}
        </div>
        <strong>{card.name}</strong>
        {!compact && <p>{card.description}</p>}
        {showMeta && !compact && (
          <div className="nj-power-card-meta">
            <span>{CATEGORY_LABEL[card.category]}</span>
            <span>{RARITY_LABEL[card.rarity]}</span>
          </div>
        )}
      </div>
    </div>
  );
}
