"use client";

import { memo } from "react";
import type { PowerCategory, PowerRarity } from "@/types/game";

export interface CategoryMotifPalette {
  primary: string;
  secondary: string;
  glow: string;
  clothTop: string;
  clothBot: string;
  label: string;
}

/** Palette directe du motif selon le TYPE de carte (aucune bordure plastique). */
export const CATEGORY_MOTIF_PALETTE: Record<PowerCategory, CategoryMotifPalette> = {
  offensive: {
    primary: "#ff5349",
    secondary: "#ffb142",
    glow: "rgba(255, 83, 73, 0.56)",
    clothTop: "#2b0d13",
    clothBot: "#12060a",
    label: "Attaque",
  },
  defense: {
    primary: "#1de4be",
    secondary: "#6cf7a8",
    glow: "rgba(29, 228, 190, 0.54)",
    clothTop: "#092721",
    clothBot: "#051311",
    label: "Défense",
  },
  tactical: {
    primary: "#4b9bff",
    secondary: "#84f2ff",
    glow: "rgba(75, 155, 255, 0.56)",
    clothTop: "#0d1d3a",
    clothBot: "#060e1c",
    label: "Tactique",
  },
  perturbation: {
    primary: "#c674ff",
    secondary: "#ff6bc0",
    glow: "rgba(198, 116, 255, 0.56)",
    clothTop: "#260f3a",
    clothBot: "#10061a",
    label: "Bluff",
  },
  score: {
    primary: "#ffcf40",
    secondary: "#fff2a8",
    glow: "rgba(255, 207, 64, 0.58)",
    clothTop: "#2e1f08",
    clothBot: "#140d04",
    label: "Score",
  },
  economy: {
    primary: "#f7b731",
    secondary: "#42f286",
    glow: "rgba(247, 183, 49, 0.56)",
    clothTop: "#20240d",
    clothBot: "#0b130a",
    label: "Nkap",
  },
};

export interface RarityMetalPalette {
  metal: string;
  metalBright: string;
  metalDark: string;
  glow: string;
  label: string;
  badgeText: string;
}

/** Signatures métalliques & lumineuses par niveau de rareté. */
export const RARITY_METAL_PALETTE: Record<PowerRarity, RarityMetalPalette> = {
  common: {
    metal: "#c9bba6",
    metalBright: "#ece2d2",
    metalDark: "#6a5f50",
    glow: "rgba(201, 187, 166, 0.28)",
    label: "Commune",
    badgeText: "I",
  },
  rare: {
    metal: "#b9deff",
    metalBright: "#f0f8ff",
    metalDark: "#3e78b2",
    glow: "rgba(150, 212, 255, 0.58)",
    label: "Rare",
    badgeText: "II",
  },
  epic: {
    metal: "#f4a8ff",
    metalBright: "#fff0ff",
    metalDark: "#8f32b8",
    glow: "rgba(232, 130, 255, 0.68)",
    label: "Épique",
    badgeText: "III",
  },
  legendary: {
    metal: "#ffe260",
    metalBright: "#fffce4",
    metalDark: "#c77808",
    glow: "rgba(255, 224, 90, 0.85)",
    label: "Légendaire",
    badgeText: "✦",
  },
};

interface PowerCardMotifProps {
  category: PowerCategory;
  rarity: PowerRarity;
  className?: string;
}

const RARITY_RANK: Record<PowerRarity, number> = {
  common: 1,
  rare: 2,
  epic: 3,
  legendary: 4,
};

/**
 * Motif Ndop & symbolique africaine imposant, plein-cadre, sans bordure plastique :
 * - La COULEUR et le GRAND EMBLÈME CENTRAL affirment le TYPE de carte.
 * - Le GRAND BLASON GRAVÉ EN HAUT + l'ARCHITECTURE ORNEMENTALE affirment
 *   immédiatement la RARETÉ :
 *   1. Commune    : motif Ndop épuré, blason simple 1 gemme.
 *   2. Rare       : gravure argentée double-frise, blason serti à 2 gemmes + médaillons argent sur les flancs.
 *   3. Épique     : grande couronne ailée triple-gemme, 4 coins sculptés, double colonnes perlées + halo central.
 *   4. Légendaire : diadème solaire impérial en or pur (5 pointes + étoile), auréole solaire 16 rayons animée,
 *                   flancs doublement tressés en or pur + mandalas d'angle + trône solaire sous l'emblème.
 */
export const PowerCardMotif = memo(function PowerCardMotif({ category, rarity, className }: PowerCardMotifProps) {
  const pal = CATEGORY_MOTIF_PALETTE[category];
  const tier = RARITY_RANK[rarity];

  const silver = "#d6ecff";
  const silverBright = "#f5fbff";
  const epicGold = "#ffd972";
  const epicBright = "#fff4d4";
  const imperialGold = "#ffe359";
  const imperialBright = "#fffce2";
  const imperialDeep = "#c97a08";

  const ornamentStroke =
    tier === 4 ? imperialGold : tier === 3 ? epicGold : tier === 2 ? silver : pal.primary;
  const ornamentBright =
    tier === 4 ? imperialBright : tier === 3 ? epicBright : tier === 2 ? silverBright : pal.secondary;

  return (
    <svg
      viewBox="0 0 180 250"
      preserveAspectRatio="none"
      className={className}
      data-rarity={rarity}
      aria-hidden="true"
    >
      {/* ═══ 1. AURÉOLE SOLAIRE IMPÉRIALE 16 RAYONS (LÉGENDAIRE — ANIMÉE EN CSS) ═══ */}
      {tier === 4 && (
        <g className="nj-motif-sunburst" style={{ transformOrigin: "90px 150px" }}>
          {Array.from({ length: 16 }, (_, i) => {
            const angle = (i * 22.5 * Math.PI) / 180;
            const r1 = i % 2 === 0 ? 22 : 34;
            const r2 = i % 2 === 0 ? 86 : 64;
            const x1 = 90 + Math.cos(angle) * r1;
            const y1 = 150 + Math.sin(angle) * r1;
            const x2 = 90 + Math.cos(angle) * r2;
            const y2 = 150 + Math.sin(angle) * r2;
            return (
              <line
                key={i}
                x1={x1.toFixed(1)}
                y1={y1.toFixed(1)}
                x2={x2.toFixed(1)}
                y2={y2.toFixed(1)}
                stroke={i % 2 === 0 ? imperialGold : imperialBright}
                strokeWidth={i % 2 === 0 ? "2.6" : "1.3"}
                strokeLinecap="round"
                opacity={i % 2 === 0 ? "0.48" : "0.34"}
              />
            );
          })}
          <circle
            cx="90"
            cy="150"
            r="58"
            fill="none"
            stroke={imperialGold}
            strokeWidth="1.6"
            strokeDasharray="6 6"
            opacity="0.62"
          />
        </g>
      )}

      {/* ═══ 2. HALO GÉOMÉTRIQUE ROYAL (ÉPIQUE) ═══ */}
      {tier === 3 && (
        <g fill="none" stroke={epicGold} opacity="0.46">
          <polygon points="90,124 148,176 90,228 32,176" strokeWidth="1.8" strokeDasharray="7 5" />
          <circle cx="90" cy="176" r="46" strokeWidth="1.3" opacity="0.55" />
        </g>
      )}

      {/* ═══ 3. COINS SCULPTÉS & MANDALAS D'ANGLE (ÉPIQUE & LÉGENDAIRE) ═══ */}
      {tier === 3 && (
        <g fill="none" stroke={epicGold} strokeWidth="2.4" strokeLinecap="round" opacity="0.86">
          {/* 2 coins hauts sculptés */}
          <path d="M 6 44 L 6 24 Q 6 12 18 12 L 32 12" />
          <path d="M 174 44 L 174 24 Q 174 12 162 12 L 148 12" />
          <polygon points="15,21 19,25 15,29 11,25" fill={epicBright} stroke="none" />
          <polygon points="165,21 169,25 165,29 161,25" fill={epicBright} stroke="none" />
          {/* 2 coins bas sculptés */}
          <path d="M 6 196 L 6 232 Q 6 244 18 244 L 38 244" />
          <path d="M 174 196 L 174 232 Q 174 244 162 244 L 142 244" />
          <path d="M 13 216 Q 26 216 26 232" strokeWidth="1.6" opacity="0.72" />
          <path d="M 167 216 Q 154 216 154 232" strokeWidth="1.6" opacity="0.72" />
        </g>
      )}

      {tier === 4 && (
        <g fill="none" strokeLinecap="round" strokeLinejoin="round">
          {/* Grand cadre-temple gravé en or pur (coins + arcs royaux) */}
          <path
            d="M 6 46 L 6 18 Q 6 7 17 7 L 30 7 M 174 46 L 174 18 Q 174 7 163 7 L 150 7"
            stroke={imperialGold}
            strokeWidth="3.2"
          />
          <path
            d="M 13 38 L 13 20 Q 13 14 20 14 L 28 14 M 167 38 L 167 20 Q 167 14 160 14 L 152 14"
            stroke={imperialBright}
            strokeWidth="1.4"
            opacity="0.88"
          />
          {/* Coins bas impériaux + spirales ancestrales */}
          <path
            d="M 6 184 L 6 234 Q 6 244 17 244 L 46 244 M 174 184 L 174 234 Q 174 244 163 244 L 134 244"
            stroke={imperialGold}
            strokeWidth="3.2"
          />
          <path d="M 14 208 Q 32 208 32 234 M 166 208 Q 148 208 148 234" stroke={imperialBright} strokeWidth="1.7" opacity="0.85" />
          {/* 4 gemmes d'angle en or pur */}
          <polygon points="18,22 23,27 18,32 13,27" fill={imperialBright} />
          <polygon points="162,22 167,27 162,32 157,27" fill={imperialBright} />
          <polygon points="18,228 24,234 18,240 12,234" fill={imperialGold} />
          <polygon points="162,228 168,234 162,240 156,234" fill={imperialGold} />
          {/* Trône solaire en croissant sous l'emblème */}
          <path
            d="M 28 228 Q 90 248 152 228"
            stroke={imperialGold}
            strokeWidth="2.8"
            opacity="0.92"
          />
        </g>
      )}

      {/* ═══ 4. GRAND BLASON DE RARETÉ GRAVÉ AU SOMMET (SIGNATURES INCONFONDABLES) ═══ */}
      <g fill="none" strokeLinecap="round" strokeLinejoin="round">
        {/* TIER 1 — COMMUNE : sobre frise simple + losange épuré 1 gemme */}
        {tier === 1 && (
          <>
            <path
              d="M 10 18 L 24 8 L 38 18 L 52 8 L 66 17 M 114 17 L 128 8 L 142 18 L 156 8 L 170 18"
              stroke={pal.primary}
              strokeWidth="2.2"
              opacity="0.62"
            />
            <path
              d="M 76 16 L 90 5 L 104 16 L 90 27 Z"
              fill={pal.clothBot}
              fillOpacity="0.86"
              stroke={pal.primary}
              strokeWidth="2.2"
            />
            <polygon points="90,10 95,16 90,22 85,16" fill={pal.secondary} stroke="none" opacity="0.9" />
          </>
        )}

        {/* TIER 2 — RARE : double frise ARGENTÉE + grand blason serti à 2 GEMMES */}
        {tier === 2 && (
          <>
            {/* Double frise latérale type + argent */}
            <path
              d="M 8 18 L 22 7 L 36 18 L 48 9 M 132 9 L 144 18 L 158 7 L 172 18"
              stroke={pal.primary}
              strokeWidth="2.6"
              opacity="0.82"
            />
            <path
              d="M 10 25 L 22 15 L 34 25 M 146 25 L 158 15 L 170 25"
              stroke={silver}
              strokeWidth="2"
              opacity="0.92"
            />
            {/* Grand Blason Argenté sculpté à 2 gemmes */}
            <path
              d="M 48 16 L 64 5 L 90 3 L 116 5 L 132 16 L 114 31 L 90 36 L 66 31 Z"
              fill={pal.clothBot}
              fillOpacity="0.9"
              stroke={silver}
              strokeWidth="2.6"
            />
            <path
              d="M 58 16 L 70 9 L 90 8 L 110 9 L 122 16 L 108 26 L 90 30 L 72 26 Z"
              fill={silver}
              fillOpacity="0.16"
              stroke={silverBright}
              strokeWidth="1.2"
              opacity="0.85"
            />
            {/* 2 gemmes argent-éclat côte à côte */}
            <polygon points="79,11 86,18 79,25 72,18" fill={silverBright} stroke={pal.primary} strokeWidth="1.2" />
            <polygon points="101,11 108,18 101,25 94,18" fill={silverBright} stroke={pal.primary} strokeWidth="1.2" />
            {/* Pointes latérales argent */}
            <polygon points="40,16 46,12 46,20" fill={silver} stroke="none" />
            <polygon points="140,16 134,12 134,20" fill={silver} stroke="none" />
          </>
        )}

        {/* TIER 3 — ÉPIQUE : GRANDE COURONNE AILÉE ROYALE TRIPLE-GEMME */}
        {tier === 3 && (
          <>
            {/* Grandes ailes royales gravées */}
            <path
              d="M 28 22 L 48 7 L 60 17 L 74 5 L 90 15 L 106 5 L 120 17 L 132 7 L 152 22"
              fill={epicGold}
              fillOpacity="0.18"
              stroke={epicGold}
              strokeWidth="2.8"
            />
            {/* Bouclier-couronne central */}
            <path
              d="M 48 17 L 66 6 L 90 2 L 114 6 L 132 17 L 118 33 L 90 41 L 62 33 Z"
              fill={pal.clothBot}
              fillOpacity="0.92"
              stroke={epicGold}
              strokeWidth="2.8"
            />
            <path
              d="M 60 18 L 74 10 L 90 7 L 106 10 L 120 18 L 108 29 L 90 35 L 72 29 Z"
              fill={pal.primary}
              fillOpacity="0.34"
              stroke={epicBright}
              strokeWidth="1.3"
            />
            {/* 3 GEMMES ROYALES (1 grande centrale + 2 flanquantes) */}
            <polygon points="90,9 98,19 90,29 82,19" fill={epicBright} stroke={epicGold} strokeWidth="1.4" />
            <polygon points="69,14 75,20 69,26 63,20" fill={pal.secondary} stroke={epicBright} strokeWidth="1.1" />
            <polygon points="111,14 117,20 111,26 105,20" fill={pal.secondary} stroke={epicBright} strokeWidth="1.1" />
            {/* Pointes d'ailes lumineuses */}
            <circle cx="48" cy="11" r="2.4" fill={epicBright} stroke="none" />
            <circle cx="132" cy="11" r="2.4" fill={epicBright} stroke="none" />
          </>
        )}

        {/* TIER 4 — LÉGENDAIRE : DIADÈME SOLAIRE IMPÉRIAL EN OR PUR (5 POINTES + ÉTOILE) */}
        {tier === 4 && (
          <>
            {/* Halo rayonnant derrière le diadème */}
            <path
              d="M 22 24 L 40 8 L 54 18 L 68 4 L 82 14 L 90 1 L 98 14 L 112 4 L 126 18 L 140 8 L 158 24"
              fill={imperialGold}
              fillOpacity="0.3"
              stroke={imperialGold}
              strokeWidth="3.2"
            />
            {/* Ailes basses du diadème */}
            <path
              d="M 24 27 Q 54 34 68 38 M 156 27 Q 126 34 112 38"
              stroke={imperialGold}
              strokeWidth="2.4"
              opacity="0.92"
            />
            {/* Grand Blason Impérial en or pur */}
            <path
              d="M 46 18 L 68 6 L 90 2 L 112 6 L 134 18 L 120 36 L 90 46 L 60 36 Z"
              fill={pal.clothBot}
              fillOpacity="0.94"
              stroke={imperialGold}
              strokeWidth="3.2"
            />
            <path
              d="M 58 19 L 74 10 L 90 7 L 106 10 L 122 19 L 110 32 L 90 40 L 70 32 Z"
              fill={imperialGold}
              fillOpacity="0.28"
              stroke={imperialBright}
              strokeWidth="1.6"
            />
            {/* Étoile Impériale 8 branches au cœur du diadème */}
            <polygon
              points="90,9 94,18 103,22 94,26 90,35 86,26 77,22 86,18"
              fill={imperialBright}
              stroke={imperialDeep}
              strokeWidth="1"
            />
            {/* 4 gemmes impériales serties dans la couronne */}
            <polygon points="68,15 73,21 68,27 63,21" fill={imperialGold} stroke={imperialBright} strokeWidth="1" />
            <polygon points="112,15 117,21 112,27 107,21" fill={imperialGold} stroke={imperialBright} strokeWidth="1" />
            <circle cx="40" cy="11" r="3" fill={imperialBright} stroke={imperialGold} strokeWidth="1" />
            <circle cx="140" cy="11" r="3" fill={imperialBright} stroke={imperialGold} strokeWidth="1" />
            <circle cx="68" cy="6" r="2.2" fill={imperialBright} stroke="none" />
            <circle cx="112" cy="6" r="2.2" fill={imperialBright} stroke="none" />
          </>
        )}
      </g>

      {/* ═══ 5. COLONNES TOTEMS NDOP GAUCHE & DROITE (MONTENT EN PUISSANCE PAR RARETÉ) ═══ */}
      <g fill="none" strokeLinecap="round" strokeLinejoin="round">
        {/* Zig-zag Ndop principal dans la couleur du type */}
        <path
          d="M 10 42 L 18 54 L 10 66 L 18 78 L 10 90 L 18 102 L 10 114 L 18 126 L 10 138"
          stroke={pal.primary}
          strokeWidth={tier >= 3 ? "3" : "2.2"}
          opacity={tier === 1 ? "0.52" : "0.84"}
        />
        <path
          d="M 170 42 L 162 54 L 170 66 L 162 78 L 170 90 L 162 102 L 170 114 L 162 126 L 170 138"
          stroke={pal.primary}
          strokeWidth={tier >= 3 ? "3" : "2.2"}
          opacity={tier === 1 ? "0.52" : "0.84"}
        />

        {/* TIER 2 (Rare) : 2 médaillons losanges ARGENTÉS bien visibles par flanc */}
        {tier === 2 && (
          <>
            <polygon points="10,60 16,66 10,72 4,66" fill={silverBright} stroke={silver} strokeWidth="1" />
            <polygon points="10,108 16,114 10,120 4,114" fill={silverBright} stroke={silver} strokeWidth="1" />
            <polygon points="170,60 176,66 170,72 164,66" fill={silverBright} stroke={silver} strokeWidth="1" />
            <polygon points="170,108 176,114 170,120 164,114" fill={silverBright} stroke={silver} strokeWidth="1" />
          </>
        )}

        {/* TIER 3 (Épique) : 3 gemmes royales par flanc + contre-ligne dorée */}
        {tier === 3 && (
          <>
            <path d="M 6 50 L 6 132 M 174 50 L 174 132" stroke={epicGold} strokeWidth="1.6" opacity="0.72" />
            {[54, 90, 126].map((y) => (
              <g key={y}>
                <polygon points={`10,${y - 6} 16,${y} 10,${y + 6} 4,${y}`} fill={epicBright} stroke={epicGold} strokeWidth="1.1" />
                <polygon points={`170,${y - 6} 176,${y} 170,${y + 6} 164,${y}`} fill={epicBright} stroke={epicGold} strokeWidth="1.1" />
              </g>
            ))}
          </>
        )}

        {/* TIER 4 (Légendaire) : DOUBLE TRESSAGE OR PUR ENTRELACÉ + 4 GEMMES IMPÉRIALES PAR FLANC */}
        {tier === 4 && (
          <>
            <g stroke={imperialGold} strokeWidth="2.3" opacity="0.96">
              <path d="M 18 42 L 10 54 L 18 66 L 10 78 L 18 90 L 10 102 L 18 114 L 10 126 L 18 138" />
              <path d="M 162 42 L 170 54 L 162 66 L 170 78 L 162 90 L 170 102 L 162 114 L 170 126 L 162 138" />
            </g>
            {[54, 78, 102, 126].map((y) => (
              <g key={y}>
                <polygon
                  points={`10,${y - 6} 16,${y} 10,${y + 6} 4,${y}`}
                  fill={imperialBright}
                  stroke={imperialGold}
                  strokeWidth="1.2"
                />
                <polygon
                  points={`170,${y - 6} 176,${y} 170,${y + 6} 164,${y}`}
                  fill={imperialBright}
                  stroke={imperialGold}
                  strokeWidth="1.2"
                />
              </g>
            ))}
          </>
        )}
      </g>

      {/* ═══ 6. GRAND EMBLÈME CENTRAL & BAS (COLORÉ SELON LE TYPE DE CARTE) ═══ */}
      {category === "offensive" && (
        <g>
          <path
            d="M 12 160 L 44 146 L 90 172 L 136 146 L 168 160"
            fill="none"
            stroke={ornamentStroke}
            strokeWidth="3.2"
            opacity="0.9"
          />
          <path
            d="M 90 128 L 142 184 L 90 242 L 38 184 Z"
            fill={pal.primary}
            fillOpacity={tier >= 3 ? "0.3" : "0.2"}
            stroke={pal.primary}
            strokeWidth="3.2"
          />
          <path
            d="M 90 144 L 126 184 L 90 226 L 54 184 Z"
            fill="none"
            stroke={ornamentBright}
            strokeWidth="2.4"
            opacity="0.92"
          />
          <path
            d="M 18 238 L 40 206 L 62 238 M 118 238 L 140 206 L 162 238"
            fill="none"
            stroke={pal.primary}
            strokeWidth="3"
            opacity="0.78"
          />
        </g>
      )}

      {category === "defense" && (
        <g>
          <path
            d="M 22 146 L 90 132 L 158 146 L 148 208 L 90 242 L 32 208 Z"
            fill={pal.primary}
            fillOpacity={tier >= 3 ? "0.28" : "0.18"}
            stroke={pal.primary}
            strokeWidth="3.2"
          />
          <path
            d="M 40 156 L 90 145 L 140 156 L 132 198 L 90 224 L 48 198 Z"
            fill="none"
            stroke={ornamentBright}
            strokeWidth="2.4"
            opacity="0.92"
          />
          <path
            d="M 14 184 L 34 174 L 34 194 Z M 166 184 L 146 174 L 146 194 Z"
            fill={ornamentStroke}
            opacity="0.78"
          />
        </g>
      )}

      {category === "tactical" && (
        <g>
          <path
            d="M 14 184 Q 90 128 166 184 Q 90 240 14 184 Z"
            fill={pal.primary}
            fillOpacity={tier >= 3 ? "0.28" : "0.18"}
            stroke={pal.primary}
            strokeWidth="3.2"
          />
          <polygon
            points="90,136 104,170 138,184 104,198 90,232 76,198 42,184 76,170"
            fill={pal.secondary}
            fillOpacity="0.22"
            stroke={ornamentBright}
            strokeWidth="2.4"
          />
          <circle cx="90" cy="184" r="14" fill="none" stroke={ornamentStroke} strokeWidth="2.4" opacity="0.92" />
        </g>
      )}

      {category === "perturbation" && (
        <g>
          <path
            d="M 10 156 L 36 174 L 62 156 L 90 176 L 118 156 L 144 174 L 170 156"
            fill="none"
            stroke={ornamentStroke}
            strokeWidth="3"
            opacity="0.9"
          />
          <path
            d="M 10 218 L 36 200 L 62 218 L 90 198 L 118 218 L 144 200 L 170 218"
            fill="none"
            stroke={pal.primary}
            strokeWidth="3"
            opacity="0.86"
          />
          <polygon
            points="90,140 136,186 90,234 44,186"
            fill={pal.primary}
            fillOpacity={tier >= 3 ? "0.3" : "0.2"}
            stroke={pal.primary}
            strokeWidth="3"
          />
          <polygon points="30,186 48,172 48,200" fill={ornamentBright} opacity="0.78" />
          <polygon points="150,186 132,172 132,200" fill={ornamentBright} opacity="0.78" />
        </g>
      )}

      {category === "score" && (
        <g>
          <path
            d="M 22 222 L 32 162 L 62 184 L 90 142 L 118 184 L 148 162 L 158 222 Z"
            fill={pal.primary}
            fillOpacity={tier >= 3 ? "0.32" : "0.22"}
            stroke={pal.primary}
            strokeWidth="3.2"
          />
          <path
            d="M 42 212 L 50 176 L 72 192 L 90 162 L 108 192 L 130 176 L 138 212 Z"
            fill="none"
            stroke={ornamentBright}
            strokeWidth="2.4"
            opacity="0.94"
          />
          <path d="M 24 234 L 156 234" stroke={ornamentStroke} strokeWidth="3" strokeDasharray="10 6" opacity="0.86" />
        </g>
      )}

      {category === "economy" && (
        <g>
          <circle
            cx="90"
            cy="186"
            r="48"
            fill={pal.primary}
            fillOpacity={tier >= 3 ? "0.26" : "0.16"}
            stroke={pal.primary}
            strokeWidth="3.2"
            strokeDasharray="14 6"
          />
          <ellipse
            cx="90"
            cy="186"
            rx="28"
            ry="40"
            fill="none"
            stroke={ornamentBright}
            strokeWidth="2.6"
            opacity="0.92"
          />
          <path
            d="M 90 152 L 90 220 M 22 186 L 54 186 M 126 186 L 158 186"
            stroke={ornamentStroke}
            strokeWidth="2.8"
            opacity="0.86"
          />
        </g>
      )}
    </svg>
  );
});
