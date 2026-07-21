"use client";

import Image from "next/image";
import type { CSSProperties } from "react";
import { T } from "@/config/theme";

export const NJAMBO_ICON_NAMES = [
  "bot", "cards", "check", "coin", "code", "copy", "crown", "cut",
  "empty", "eye", "friends", "globe", "history", "home", "hourglass", "language",
  "message", "music", "notification", "online", "play", "plus", "profile", "search",
  "settings", "sound", "spark", "sparkle", "star", "trophy", "users", "wind",
] as const;

export type NjamboIconName = (typeof NJAMBO_ICON_NAMES)[number];
export type NjamboIconTone = "gold" | "teal" | "pink" | "cobalt" | "palm" | "light";
export type NjamboFriendlyIconName = "home" | "play" | "events" | "shop" | "social" | "notification" | "settings";

const ICON_ASSETS: Record<NjamboIconName, string> = {
  bot: "bot",
  cards: "cards",
  check: "check",
  coin: "coin",
  code: "code",
  copy: "copy",
  crown: "crown",
  cut: "cut",
  empty: "empty",
  eye: "eye",
  friends: "friends",
  globe: "globe",
  history: "history",
  home: "home",
  hourglass: "hourglass",
  language: "language",
  message: "message",
  music: "music",
  notification: "notification",
  online: "online",
  play: "play",
  plus: "plus",
  profile: "profile",
  search: "search",
  settings: "settings",
  sound: "sound",
  spark: "spark",
  sparkle: "sparkle",
  star: "star",
  trophy: "trophy",
  users: "users",
  wind: "wind",
};

const TONE_GLOW: Record<NjamboIconTone, string> = {
  gold: "rgba(242, 187, 69, .38)",
  teal: "rgba(16, 183, 166, .38)",
  pink: "rgba(216, 60, 104, .36)",
  cobalt: "rgba(49, 84, 212, .38)",
  palm: "rgba(100, 199, 120, .38)",
  light: "rgba(255, 244, 223, .26)",
};

interface MarkProps {
  size?: number;
  compact?: boolean;
}

function responsiveAsset(base: string, size: number, available: readonly number[]) {
  const chosen = available.find((candidate) => candidate >= size) ?? available.at(-1) ?? size;
  return `${base}-${chosen}.webp`;
}

/** Marque Njambo peinte : bitmap volontairement aligné sur les objets 2,5D du jeu. */
export function NjamboMark({ size = 112, compact = false }: MarkProps) {
  const src = responsiveAsset("/assets/njambo/ui/brand/njambo-mark", size, [64, 128, 256]);
  return (
    <span
      className={`njambo-mark-asset${compact ? " njambo-mark-asset--compact" : ""}`}
      style={{ "--nj-mark-size": `${size}px` } as CSSProperties}
      aria-hidden="true"
    >
      <Image src={src} alt="" width={size} height={size} sizes={`${size}px`} draggable={false} />
    </span>
  );
}

interface IconProps {
  name: NjamboIconName;
  size?: number;
  tone?: NjamboIconTone;
  /** Charge l'image en priorité (above-the-fold) au lieu du lazy par défaut. */
  priority?: boolean;
}

/**
 * Icône de jeu matérialisée en médaillon 2,5D.
 * `tone` colore uniquement l'aura contextuelle : le bitmap conserve sa matière et sa palette.
 */
export function NjamboIcon({ name, size = 28, tone = "gold", priority = false }: IconProps) {
  const sourceSize = size > 64 ? 128 : 64;
  const style = {
    "--nj-icon-glow": TONE_GLOW[tone],
    width: size,
    height: size,
  } as CSSProperties;

  return (
    <span className={`njambo-asset-icon njambo-asset-icon--${tone}`} style={style} aria-hidden="true">
      <Image
        src={`/assets/njambo/ui/icons/${ICON_ASSETS[name]}-${sourceSize}.webp`}
        alt=""
        width={size}
        height={size}
        sizes={`${size}px`}
        draggable={false}
        priority={priority}
      />
    </span>
  );
}

/** Glyphe fonctionnel clair, sans médaillon sombre intégré. */
export function NjamboFriendlyIcon({
  name,
  size = 26,
}: {
  name: NjamboFriendlyIconName;
  size?: number;
}) {
  return (
    <span className="njambo-friendly-icon" style={{ width: size, height: size }} aria-hidden="true">
      <Image
        src={`/assets/njambo/friendly/icons/${name}.svg`}
        alt=""
        width={size}
        height={size}
        sizes={`${size}px`}
        draggable={false}
        unoptimized
      />
    </span>
  );
}

interface AvatarIllustrationProps {
  seed: string;
  size?: number;
  active?: boolean;
  online?: boolean;
}

const AVATAR_PALETTES = [
  { skin: "#8d4f32", wrap: T.gold, cloth: T.teal, hair: "#160f16", mark: T.pink },
  { skin: "#6d3b25", wrap: T.cobalt, cloth: T.gold, hair: "#110d13", mark: T.teal },
  { skin: "#a65f39", wrap: T.pink, cloth: T.cobalt, hair: "#1d1210", mark: T.gold },
  { skin: "#7b432e", wrap: T.palm, cloth: T.copper, hair: "#100b0c", mark: T.cobalt },
  { skin: "#9b5734", wrap: T.copper, cloth: T.teal, hair: "#120d17", mark: T.gold },
  { skin: "#5f3324", wrap: T.teal, cloth: T.pink, hair: "#0f0a0d", mark: T.gold },
];

export function AvatarIllustration({ seed, size = 56, active = false, online }: AvatarIllustrationProps) {
  const index = hashSeed(seed) % AVATAR_PALETTES.length;
  const p = AVATAR_PALETTES[index];
  const hasGlasses = hashSeed(`${seed}-glasses`) % 3 === 0;
  const hasHeadwrap = hashSeed(`${seed}-wrap`) % 2 === 0;

  return (
    <span
      className="avatar-illu"
      style={{
        width: size,
        height: size,
        boxShadow: active ? `0 0 0 3px ${T.gold}, 0 0 24px ${T.gold}66` : undefined,
      }}
    >
      <svg width={size} height={size} viewBox="0 0 72 72" aria-hidden="true">
        <circle cx="36" cy="36" r="34" fill={T.night2} />
        <circle cx="36" cy="36" r="31" fill={p.cloth} opacity="0.28" />
        <path d="M11 49c8-8 16-12 25-12s17 4 25 12v12H11V49Z" fill={p.cloth} />
        <path d="M18 56c8-4 16-6 24-6 6 0 11 1 15 3" stroke={p.mark} strokeWidth="3" strokeLinecap="round" opacity="0.9" />
        <circle cx="36" cy="33" r="17" fill={p.skin} />
        {hasHeadwrap ? (
          <>
            <path d="M18 31c4-14 14-22 29-19 8 2 13 8 15 18-12-5-27-7-44 1Z" fill={p.wrap} />
            <path d="M24 17c11 5 22 6 34 3" stroke={T.chalk} strokeOpacity="0.32" strokeWidth="2" />
          </>
        ) : (
          <path d="M19 30c2-13 10-20 22-19 9 1 14 8 13 18-9-5-20-7-35 1Z" fill={p.hair} />
        )}
        <circle cx="30" cy="34" r="2.3" fill={T.deep} />
        <circle cx="43" cy="34" r="2.3" fill={T.deep} />
        {hasGlasses && (
          <path d="M24 33c3-3 9-3 12 0m1 0c3-3 9-3 12 0M36 33h1" stroke={T.chalk} strokeOpacity="0.78" strokeWidth="2" strokeLinecap="round" fill="none" />
        )}
        <path d="M31 45c4 3 8 3 12 0" stroke={T.deep} strokeWidth="2.3" strokeLinecap="round" fill="none" opacity="0.72" />
        <path d="M20 43c-3-1-5-4-4-8M52 43c3-1 5-4 4-8" stroke={p.skin} strokeWidth="5" strokeLinecap="round" fill="none" />
      </svg>
      {online !== undefined && (
        <span
          className="avatar-status"
          style={{ background: online ? T.good : "#5d5870" }}
        />
      )}
    </span>
  );
}

function hashSeed(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}
