"use client";

/* ═══════════════ Bordures ornementales des cartes Pouvoir (8 itérations) ═══════════════
   Chaque style décline son armature SVG selon la rareté (Commune → Légendaire)
   et la palette de catégorie (`CATEGORY_MOTIF_PALETTE`). Conçu pour s'adapter
   aussi bien aux cartes classiques qu'aux packs Portrait et aux vignettes compactes. */

import { memo, useId } from "react";
import type { PowerBorderId } from "@/domain/powerBorders";
import type { PowerCategory, PowerRarity } from "@/types/game";
import { CATEGORY_MOTIF_PALETTE, RARITY_METAL_PALETTE } from "./PowerCardMotif";

interface PowerCardBorderProps {
  border: Exclude<PowerBorderId, "classique">;
  category: PowerCategory;
  rarity: PowerRarity;
  compact?: boolean;
  portrait?: boolean;
  className?: string;
}

const RARITY_TIER: Record<PowerRarity, number> = {
  common: 1,
  rare: 2,
  epic: 3,
  legendary: 4,
};

/** Construit un chemin SVG d'anneau rectangulaire plein à coins arrondis (fillRule="evenodd"). */
function solidFramePath(w: number, h: number, t: number, rxOuter: number, rxInner: number): string {
  const ro = rxOuter;
  const ri = rxInner;
  const outer = `M ${ro} 0 H ${w - ro} A ${ro} ${ro} 0 0 1 ${w} ${ro} V ${h - ro} A ${ro} ${ro} 0 0 1 ${w - ro} ${h} H ${ro} A ${ro} ${ro} 0 0 1 0 ${h - ro} V ${ro} A ${ro} ${ro} 0 0 1 ${ro} 0 Z`;
  const inner = `M ${t + ri} ${t} H ${w - t - ri} A ${ri} ${ri} 0 0 1 ${w - t} ${t + ri} V ${h - t - ri} A ${ri} ${ri} 0 0 1 ${w - t - ri} ${h - t} H ${t + ri} A ${ri} ${ri} 0 0 1 ${t} ${h - t - ri} V ${t + ri} A ${ri} ${ri} 0 0 1 ${t + ri} ${t} Z`;
  return `${outer} ${inner}`;
}

export const PowerCardBorder = memo(function PowerCardBorder({
  border,
  category,
  rarity,
  compact = false,
  portrait = false,
  className,
}: PowerCardBorderProps) {
  const uid = useId().replace(/:/g, "");
  const pal = CATEGORY_MOTIF_PALETTE[category];
  const rar = RARITY_METAL_PALETTE[rarity];
  const tier = RARITY_TIER[rarity];

  const stroke = tier >= 2 ? rar.metal : pal.primary;
  const bright = tier >= 2 ? rar.metalBright : pal.secondary;
  const thin = portrait && !compact ? 0.88 : 1;

  if (border === "orfevre") {
    const gradId = `nj-orf-${uid}`;
    const mainW = (tier >= 3 ? 3.2 : 2.3) * thin;
    return (
      <svg viewBox="0 0 180 250" preserveAspectRatio="none" className={className} data-border="orfevre" aria-hidden="true">
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={bright} />
            <stop offset="35%" stopColor={stroke} />
            <stop offset="72%" stopColor={rar.metalDark} />
            <stop offset="100%" stopColor={bright} />
          </linearGradient>
        </defs>
        <rect x="4" y="4" width="172" height="242" rx="14" fill="none" stroke={`url(#${gradId})`} strokeWidth={mainW} />
        <rect x="9.5" y="9.5" width="161" height="231" rx="10" fill="none" stroke={bright} strokeWidth="1" opacity="0.62" />
        {[
          [14, 14],
          [166, 14],
          [14, 236],
          [166, 236],
        ].map(([cx, cy]) => (
          <g key={`${cx}-${cy}`}>
            <polygon
              points={`${cx},${cy - 7} ${cx + 7},${cy} ${cx},${cy + 7} ${cx - 7},${cy}`}
              fill={pal.clothBot}
              stroke={stroke}
              strokeWidth="1.6"
            />
            <polygon
              points={`${cx},${cy - 3.8} ${cx + 3.8},${cy} ${cx},${cy + 3.8} ${cx - 3.8},${cy}`}
              fill={tier >= 3 ? bright : pal.secondary}
            />
          </g>
        ))}
        {!compact && (
          <>
            <path
              d={`M 46 4 Q 90 ${tier >= 3 ? 27 : 18} 134 4`}
              fill={pal.clothBot}
              fillOpacity={portrait ? "0.66" : "0.84"}
              stroke={stroke}
              strokeWidth="2.2"
            />
            <polygon points="90,6 96,13 90,20 84,13" fill={bright} stroke={pal.primary} strokeWidth="1" />
            {tier >= 3 && (
              <>
                <circle cx="72" cy="11" r="2.2" fill={pal.secondary} />
                <circle cx="108" cy="11" r="2.2" fill={pal.secondary} />
              </>
            )}
            {tier === 4 && <path d="M 52 246 Q 90 233 128 246" fill="none" stroke={bright} strokeWidth="2" />}
          </>
        )}
      </svg>
    );
  }

  if (border === "braise") {
    return (
      <svg viewBox="0 0 180 250" preserveAspectRatio="none" className={className} data-border="braise" aria-hidden="true">
        <path
          d="M 14 4 L 166 4 L 176 16 L 176 234 L 166 246 L 14 246 L 4 234 L 4 16 Z"
          fill="none"
          stroke="#191216"
          strokeWidth={portrait ? "5.5" : "7"}
        />
        <path
          d="M 14 4 L 166 4 L 176 16 L 176 234 L 166 246 L 14 246 L 4 234 L 4 16 Z"
          fill="none"
          stroke={pal.primary}
          strokeWidth="2"
          opacity="0.92"
        />
        <g
          className="nj-border-lava"
          fill="none"
          stroke={pal.secondary}
          strokeWidth={tier >= 3 ? "2.2" : "1.5"}
          strokeLinecap="round"
        >
          <path d="M 5 36 L 14 46 L 6 62 M 5 162 L 13 176 L 6 196" />
          <path d="M 175 44 L 166 56 L 174 74 M 175 154 L 167 170 L 174 188" />
          <path d="M 48 5 L 62 12 L 78 5 M 102 5 L 118 12 L 132 5" />
          <path d="M 54 245 L 70 237 L 90 245 L 110 237 L 126 245" />
        </g>
        <g fill={pal.primary} stroke={bright} strokeWidth="0.9">
          <polygon points="3,3 24,5 12,13 5,25" />
          <polygon points="177,3 156,5 168,13 175,25" />
          <polygon points="3,247 24,245 12,237 5,225" />
          <polygon points="177,247 156,245 168,237 175,225" />
        </g>
      </svg>
    );
  }

  if (border === "prisme") {
    return (
      <svg viewBox="0 0 180 250" preserveAspectRatio="none" className={className} data-border="prisme" aria-hidden="true">
        <path
          d="M 20 5 L 160 5 L 175 20 L 175 230 L 160 245 L 20 245 L 5 230 L 5 20 Z"
          fill="none"
          stroke="rgba(232, 248, 255, 0.8)"
          strokeWidth="1.9"
        />
        <path
          d="M 24 10 L 156 10 L 170 24 L 170 226 L 156 240 L 24 240 L 10 226 L 10 24 Z"
          fill="none"
          stroke={pal.secondary}
          strokeWidth="1"
          opacity="0.68"
        />
        <g fill="rgba(255, 255, 255, 0.22)" stroke={bright} strokeWidth="1.1">
          <polygon points="5,20 20,5 24,10 10,24" />
          <polygon points="175,20 160,5 156,10 170,24" />
          <polygon points="5,230 20,245 24,240 10,226" />
          <polygon points="175,230 160,245 156,240 170,226" />
        </g>
        {!compact && (
          <>
            <polygon
              points="90,2 103,12 90,22 77,12"
              fill="rgba(255, 255, 255, 0.26)"
              stroke={bright}
              strokeWidth="1.5"
            />
            <polygon points="90,6 97,12 90,18 83,12" fill={pal.secondary} opacity="0.92" />
            {tier >= 3 && (
              <>
                <line x1="28" y1="5" x2="72" y2="5" stroke={bright} strokeWidth="2.2" opacity="0.86" />
                <line x1="108" y1="5" x2="152" y2="5" stroke={bright} strokeWidth="2.2" opacity="0.86" />
              </>
            )}
          </>
        )}
      </svg>
    );
  }

  if (border === "ndop_energy") {
    return (
      <svg viewBox="0 0 180 250" preserveAspectRatio="none" className={className} data-border="ndop_energy" aria-hidden="true">
        <rect x="6" y="6" width="168" height="238" rx="12" fill="none" stroke={pal.primary} strokeWidth="2" opacity="0.54" />
        <rect x="6" y="6" width="168" height="238" rx="12" fill="none" stroke={bright} strokeWidth="2.3" className="nj-border-ndop-flow" />
        <path
          d="M 10 34 L 16 44 L 10 54 L 16 64 L 10 74 L 16 84 L 10 94 L 16 104 L 10 114 L 16 124 L 10 134 L 16 144 L 10 154 L 16 164 L 10 174 L 16 184 L 10 194 L 16 204 L 10 214"
          fill="none"
          stroke={stroke}
          strokeWidth={portrait ? "1.4" : "1.8"}
          opacity="0.86"
        />
        <path
          d="M 170 34 L 164 44 L 170 54 L 164 64 L 170 74 L 164 84 L 170 94 L 164 104 L 170 114 L 164 124 L 170 134 L 164 144 L 170 154 L 164 164 L 170 174 L 164 184 L 170 194 L 164 204 L 170 214"
          fill="none"
          stroke={stroke}
          strokeWidth={portrait ? "1.4" : "1.8"}
          opacity="0.86"
        />
        {[
          [13, 15],
          [167, 15],
          [13, 235],
          [167, 235],
        ].map(([cx, cy]) => (
          <g key={`${cx}-${cy}`}>
            <circle cx={cx} cy={cy} r="5.8" fill={pal.clothBot} stroke={stroke} strokeWidth="1.8" />
            <circle cx={cx} cy={cy} r="2.3" fill={bright} />
          </g>
        ))}
        {!compact && (
          <>
            <path d="M 68 6 L 90 19 L 112 6" fill={pal.clothBot} fillOpacity="0.85" stroke={stroke} strokeWidth="2" />
            <circle cx="90" cy="11" r="3" fill={pal.secondary} />
          </>
        )}
      </svg>
    );
  }

  if (border === "relique") {
    const jade = "#32e8b5";
    const bronze = tier >= 4 ? "#ffd966" : "#d99b52";
    return (
      <svg viewBox="0 0 180 250" preserveAspectRatio="none" className={className} data-border="relique" aria-hidden="true">
        <rect x="4.5" y="4.5" width="171" height="241" rx="15" fill="none" stroke={bronze} strokeWidth={portrait ? "3" : "3.6"} />
        <rect x="10" y="10" width="160" height="230" rx="11" fill="none" stroke={jade} strokeWidth="1.3" opacity="0.72" />
        {[46, 86, 126, 166, 206].map((y) => (
          <g key={y}>
            <circle cx="7" cy={y} r="2.1" fill={bright} stroke={bronze} strokeWidth="0.8" />
            <circle cx="173" cy={y} r="2.1" fill={bright} stroke={bronze} strokeWidth="0.8" />
          </g>
        ))}
        <g fill="none" stroke={jade} strokeWidth="2" strokeLinecap="round">
          <path d="M 10 30 Q 14 14 30 10" />
          <path d="M 170 30 Q 166 14 150 10" />
          <path d="M 10 220 Q 14 236 30 240" />
          <path d="M 170 220 Q 166 236 150 240" />
        </g>
        {!compact && (
          <>
            <ellipse cx="90" cy="10" rx="14" ry="7" fill="#082820" stroke={bronze} strokeWidth="2" />
            <ellipse cx="90" cy="10" rx="7" ry="3.5" fill={jade} />
          </>
        )}
      </svg>
    );
  }

  if (border === "foudre") {
    return (
      <svg viewBox="0 0 180 250" preserveAspectRatio="none" className={className} data-border="foudre" aria-hidden="true">
        <rect x="4" y="4" width="172" height="242" rx="14" fill="none" stroke={pal.primary} strokeWidth="1.7" opacity="0.8" />
        <rect
          x="8.5"
          y="8.5"
          width="163"
          height="233"
          rx="11"
          fill="none"
          stroke={pal.secondary}
          strokeWidth="1"
          strokeDasharray="14 8 4 8"
          opacity="0.82"
        />
        {[
          [10, 10],
          [170, 10],
          [10, 240],
          [170, 240],
        ].map(([cx, cy]) => (
          <g key={`${cx}-${cy}`}>
            <circle cx={cx} cy={cy} r="5.4" fill="#090c16" stroke={pal.secondary} strokeWidth="1.8" />
            <circle cx={cx} cy={cy} r="2.2" fill="#ffffff" />
          </g>
        ))}
        {!compact && (
          <>
            <path d="M 64 4 L 74 11 L 106 11 L 116 4" fill="#090c16" stroke={bright} strokeWidth="1.8" />
            <line x1="78" y1="8" x2="102" y2="8" stroke={pal.secondary} strokeWidth="2.2" strokeLinecap="round" />
          </>
        )}
      </svg>
    );
  }

  /* ═══ ITÉRATION 7 — ARMURE ROYALE MASSIVE (BORDURE PLEINE & ÉPAISSE EN RELIEF 3D) ═══ */
  if (border === "monolithe") {
    const metalGrad = `nj-mono-m-${uid}`;
    const bevelGrad = `nj-mono-b-${uid}`;
    const thickness = compact ? 9.5 : 12.5;
    const innerRx = compact ? 7 : 9;
    const metalTop = tier === 4 ? "#fff3a6" : tier === 3 ? "#ffe69e" : tier === 2 ? "#e2f2ff" : "#e3d6c4";
    const metalMid = tier === 4 ? "#f0b429" : tier === 3 ? "#d89c36" : tier === 2 ? "#8eb8e0" : "#9c8a72";
    const metalLow = tier === 4 ? "#6b3b05" : tier === 3 ? "#5a340b" : tier === 2 ? "#28496c" : "#3a3126";

    return (
      <svg viewBox="0 0 180 250" preserveAspectRatio="none" className={className} data-border="monolithe" aria-hidden="true">
        <defs>
          <linearGradient id={metalGrad} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={metalTop} />
            <stop offset="28%" stopColor={metalMid} />
            <stop offset="56%" stopColor={metalLow} />
            <stop offset="82%" stopColor={metalMid} />
            <stop offset="100%" stopColor={metalTop} />
          </linearGradient>
          <linearGradient id={bevelGrad} x1="0" y1="1" x2="1" y2="0">
            <stop offset="0%" stopColor={metalLow} />
            <stop offset="50%" stopColor={metalTop} />
            <stop offset="100%" stopColor={metalLow} />
          </linearGradient>
        </defs>

        {/* Bordure pleine épaisse sculptée (fillRule="evenodd") */}
        <path
          d={solidFramePath(180, 250, thickness, 16, innerRx)}
          fill={`url(#${metalGrad})`}
          fillRule="evenodd"
        />

        {/* Rainure centrale lumineuse incrustée dans la couleur du type */}
        <rect
          x={thickness * 0.48}
          y={thickness * 0.48}
          width={180 - thickness * 0.96}
          height={250 - thickness * 0.96}
          rx={12}
          fill="none"
          stroke={pal.clothBot}
          strokeWidth={compact ? "3.2" : "4.2"}
          opacity="0.82"
        />
        <rect
          x={thickness * 0.48}
          y={thickness * 0.48}
          width={180 - thickness * 0.96}
          height={250 - thickness * 0.96}
          rx={12}
          fill="none"
          stroke={pal.primary}
          strokeWidth={compact ? "1.6" : "2.2"}
          className="nj-border-monolith-glow"
        />

        {/* Biseau intérieur net & arête extérieure */}
        <rect
          x={thickness}
          y={thickness}
          width={180 - thickness * 2}
          height={250 - thickness * 2}
          rx={innerRx}
          fill="none"
          stroke={`url(#${bevelGrad})`}
          strokeWidth="1.9"
        />
        <rect
          x="1"
          y="1"
          width="178"
          height="248"
          rx="15.5"
          fill="none"
          stroke={metalTop}
          strokeWidth="1.4"
          opacity="0.88"
        />

        {/* 4 plaques blindées aux coins + rivets gemmes */}
        {[
          [0, 0, 1, 1],
          [180, 0, -1, 1],
          [0, 250, 1, -1],
          [180, 250, -1, -1],
        ].map(([ox, oy, sx, sy], idx) => (
          <g key={idx} transform={`translate(${ox}, ${oy}) scale(${sx}, ${sy})`}>
            <path
              d="M 1 28 L 1 13 Q 1 1 13 1 L 28 1 L 24 12 L 12 12 L 12 24 Z"
              fill={`url(#${metalGrad})`}
              stroke={metalTop}
              strokeWidth="1.1"
            />
            <polygon points="8.5,5 12,8.5 8.5,12 5,8.5" fill={tier >= 3 ? bright : pal.secondary} stroke={metalLow} strokeWidth="0.7" />
          </g>
        ))}

        {/* Cimier massif intégré au sommet + barre basse */}
        {!compact && (
          <>
            <path
              d="M 48 1 L 132 1 L 122 17 L 90 24 L 58 17 Z"
              fill={`url(#${metalGrad})`}
              stroke={metalTop}
              strokeWidth="1.3"
            />
            <path
              d="M 59 5 L 121 5 L 114 14 L 90 19 L 66 14 Z"
              fill={pal.clothBot}
              stroke={pal.primary}
              strokeWidth="1.1"
            />
            <polygon points="90,6 96,12 90,18 84,12" fill={bright} stroke={pal.primary} strokeWidth="0.8" />
            {tier >= 2 && (
              <>
                <circle cx="74" cy="11" r="2.2" fill={pal.secondary} />
                <circle cx="106" cy="11" r="2.2" fill={pal.secondary} />
              </>
            )}
            {/* Fermoir bas centré sur l'épaisseur du cadre */}
            <path d="M 64 249 L 72 238 L 108 238 L 116 249 Z" fill={`url(#${metalGrad})`} stroke={metalTop} strokeWidth="1" />
            <line x1="78" y1="244" x2="102" y2="244" stroke={pal.secondary} strokeWidth="2" strokeLinecap="round" />
          </>
        )}
      </svg>
    );
  }

  /* ═══ ITÉRATION 8 — AURORE SOLAIRE IMPÉRIALE (CADRE PLEIN SATINÉ + SOLEIL & COMÈTES) ═══ */
  if (border === "solaire") {
    const solarGrad = `nj-sol-${uid}`;
    const band = compact ? 6.5 : 8.5;
    return (
      <svg viewBox="0 0 180 250" preserveAspectRatio="none" className={className} data-border="solaire" aria-hidden="true">
        <defs>
          <linearGradient id={solarGrad} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={pal.clothTop} />
            <stop offset="24%" stopColor={pal.primary} />
            <stop offset="50%" stopColor={rar.metal} />
            <stop offset="76%" stopColor={pal.primary} />
            <stop offset="100%" stopColor={pal.clothBot} />
          </linearGradient>
        </defs>

        <path
          d={solidFramePath(180, 250, band, 16, 10)}
          fill={`url(#${solarGrad})`}
          fillOpacity="0.92"
          fillRule="evenodd"
        />
        <rect x={band} y={band} width={180 - band * 2} height={250 - band * 2} rx="10" fill="none" stroke={bright} strokeWidth="1.4" opacity="0.92" />
        <rect x={band + 3.2} y={band + 3.2} width={180 - (band + 3.2) * 2} height={250 - (band + 3.2) * 2} rx="8" fill="none" stroke={pal.secondary} strokeWidth="0.8" opacity="0.58" />

        {[56, 125, 194].map((y) => (
          <g key={y}>
            <circle cx={band * 0.5} cy={y} r="1.8" fill={bright} />
            <circle cx={180 - band * 0.5} cy={y} r="1.8" fill={bright} />
          </g>
        ))}

        {[
          [10, 10],
          [170, 10],
          [10, 240],
          [170, 240],
        ].map(([cx, cy]) => (
          <polygon
            key={`${cx}-${cy}`}
            points={`${cx},${cy - 5.5} ${cx + 1.8},${cy - 1.8} ${cx + 5.5},${cy} ${cx + 1.8},${cy + 1.8} ${cx},${cy + 5.5} ${cx - 1.8},${cy + 1.8} ${cx - 5.5},${cy} ${cx - 1.8},${cy - 1.8}`}
            fill={bright}
          />
        ))}

        {!compact && (
          <g>
            <path d="M 58 2 Q 90 25 122 2" fill={pal.clothBot} fillOpacity="0.9" stroke={bright} strokeWidth="1.6" />
            <polygon
              points="90,2 93,8 100,10 93,12 90,18 87,12 80,10 87,8"
              fill={bright}
              stroke={rar.metalDark}
              strokeWidth="0.6"
            />
            {tier >= 3 && (
              <>
                <circle cx="72" cy="8" r="1.8" fill={pal.secondary} />
                <circle cx="108" cy="8" r="1.8" fill={pal.secondary} />
              </>
            )}
          </g>
        )}
      </svg>
    );
  }

  /* ═══ ITÉRATION 9 — KENTE ROYAL TISSÉ (BORDURE PLEINE ÉPAISSE GÉOMÉTRIQUE AFRICAINE) ═══ */
  if (border === "kente") {
    const kenteGold = tier >= 3 ? "#ffd95e" : tier === 2 ? "#c7e4ff" : "#e8b648";
    const kenteDeep = "#140e09";
    const thickness = compact ? 9 : 11.5;
    const innerRx = compact ? 7 : 9;
    return (
      <svg viewBox="0 0 180 250" preserveAspectRatio="none" className={className} data-border="kente" aria-hidden="true">
        {/* Bordure pleine épaisse fond ébène tissé */}
        <path d={solidFramePath(180, 250, thickness, 16, innerRx)} fill={kenteDeep} fillRule="evenodd" />

        {/* Blocs géométriques Kente rythmés sur les côtés gauche & droit */}
        {[34, 62, 90, 118, 146, 174, 202].map((y, idx) => {
          const fill = idx % 3 === 0 ? kenteGold : idx % 3 === 1 ? pal.primary : "#1fd9a7";
          return (
            <g key={y}>
              <rect x="2.2" y={y} width={thickness - 4.4} height="16" rx="1.2" fill={fill} opacity="0.92" />
              <line x1="2.2" y1={y + 8} x2={thickness - 2.2} y2={y + 8} stroke={kenteDeep} strokeWidth="1.4" />
              <rect x={180 - thickness + 2.2} y={y} width={thickness - 4.4} height="16" rx="1.2" fill={fill} opacity="0.92" />
              <line x1={180 - thickness + 2.2} y1={y + 8} x2={177.8} y2={y + 8} stroke={kenteDeep} strokeWidth="1.4" />
            </g>
          );
        })}

        {/* Blocs géométriques Kente en haut & en bas */}
        {[30, 54, 112, 136].map((x, idx) => {
          const fill = idx % 2 === 0 ? kenteGold : pal.primary;
          return (
            <g key={x}>
              <rect x={x} y="2.2" width="14" height={thickness - 4.4} rx="1.2" fill={fill} opacity="0.92" />
              <rect x={x} y={250 - thickness + 2.2} width="14" height={thickness - 4.4} rx="1.2" fill={fill} opacity="0.92" />
            </g>
          );
        })}

        {/* Double filet d'or extérieur & intérieur */}
        <rect x="1.2" y="1.2" width="177.6" height="247.6" rx="15.2" fill="none" stroke={kenteGold} strokeWidth="1.9" />
        <rect
          x={thickness}
          y={thickness}
          width={180 - thickness * 2}
          height={250 - thickness * 2}
          rx={innerRx}
          fill="none"
          stroke={bright}
          strokeWidth="1.6"
        />

        {/* 4 losanges royaux tissés aux angles */}
        {[
          [9.5, 9.5],
          [170.5, 9.5],
          [9.5, 240.5],
          [170.5, 240.5],
        ].map(([cx, cy]) => (
          <g key={`${cx}-${cy}`}>
            <polygon points={`${cx},${cy - 6.5} ${cx + 6.5},${cy} ${cx},${cy + 6.5} ${cx - 6.5},${cy}`} fill={kenteGold} stroke={kenteDeep} strokeWidth="1" />
            <polygon points={`${cx},${cy - 3.2} ${cx + 3.2},${cy} ${cx},${cy + 3.2} ${cx - 3.2},${cy}`} fill={pal.primary} />
          </g>
        ))}

        {/* Couronne en escalier au sommet + chevron bas */}
        {!compact && (
          <>
            <path d="M 68 1 L 112 1 L 106 11 L 98 11 L 90 19 L 82 11 L 74 11 Z" fill={kenteGold} stroke={kenteDeep} strokeWidth="1.1" />
            <polygon points="90,5 94.5,10 90,15 85.5,10" fill={kenteDeep} />
            <polygon points="90,7 92.5,10 90,13 87.5,10" fill={pal.secondary} />
            <path d="M 74 249 L 82 239 L 98 239 L 106 249 Z" fill={kenteGold} stroke={kenteDeep} strokeWidth="1" />
          </>
        )}
      </svg>
    );
  }

  /* ═══ ITÉRATION 10 — ÉCLIPSE D'OBSIDIENNE (BORDURE PLEINE LAQUÉE NOIR + DOUBLE LISERÉ LUXE) ═══ */
  const obsGrad = `nj-obs-${uid}`;
  const obsBand = compact ? 7.5 : 10;
  const obsInnerRx = compact ? 7 : 9.5;
  return (
    <svg viewBox="0 0 180 250" preserveAspectRatio="none" className={className} data-border="eclipse" aria-hidden="true">
      <defs>
        <linearGradient id={obsGrad} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#262834" />
          <stop offset="32%" stopColor="#0c0e14" />
          <stop offset="68%" stopColor="#1b1d28" />
          <stop offset="100%" stopColor="#08090e" />
        </linearGradient>
      </defs>

      {/* Cadre plein laqué obsidienne */}
      <path d={solidFramePath(180, 250, obsBand, 16, obsInnerRx)} fill={`url(#${obsGrad})`} fillRule="evenodd" />

      {/* Double liseré haute joaillerie */}
      <rect x="2.2" y="2.2" width="175.6" height="245.6" rx="14.5" fill="none" stroke={pal.primary} strokeWidth="1.35" opacity="0.88" />
      <rect
        x={obsBand - 1}
        y={obsBand - 1}
        width={180 - (obsBand - 1) * 2}
        height={250 - (obsBand - 1) * 2}
        rx={obsInnerRx + 0.5}
        fill="none"
        stroke={bright}
        strokeWidth="1.45"
        opacity="0.92"
      />

      {/* 4 arcs d'éclipse aux coins */}
      <g fill="none" stroke={stroke} strokeWidth="1.6" strokeLinecap="round" opacity="0.9">
        <path d="M 6 22 A 16 16 0 0 1 22 6" />
        <path d="M 158 6 A 16 16 0 0 1 174 22" />
        <path d="M 6 228 A 16 16 0 0 0 22 244" />
        <path d="M 158 244 A 16 16 0 0 0 174 228" />
      </g>

      {/* Croissant d'éclipse gravé au sommet */}
      {!compact && (
        <g>
          <path d="M 62 1 Q 90 21 118 1" fill="#0b0d14" stroke={bright} strokeWidth="1.4" />
          <circle cx="90" cy="10" r="5.4" fill={bright} />
          <circle cx="92.2" cy="9.2" r="4.5" fill="#0b0d14" />
          <circle cx="72" cy="7.5" r="1.4" fill={pal.secondary} />
          <circle cx="108" cy="7.5" r="1.4" fill={pal.secondary} />
        </g>
      )}
    </svg>
  );
});
