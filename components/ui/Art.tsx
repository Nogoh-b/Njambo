"use client";

import { T } from "@/config/theme";

export type NjamboIconName =
  | "bot"
  | "cards"
  | "check"
  | "coin"
  | "code"
  | "copy"
  | "crown"
  | "cut"
  | "empty"
  | "eye"
  | "friends"
  | "globe"
  | "history"
  | "home"
  | "hourglass"
  | "language"
  | "message"
  | "music"
  | "notification"
  | "online"
  | "play"
  | "plus"
  | "profile"
  | "search"
  | "settings"
  | "sound"
  | "spark"
  | "sparkle"
  | "star"
  | "trophy"
  | "users"
  | "wind";

interface MarkProps {
  size?: number;
  compact?: boolean;
}

export function NjamboMark({ size = 112, compact = false }: MarkProps) {
  const s = size;
  return (
    <svg width={s} height={s} viewBox="0 0 120 120" aria-hidden="true">
      <defs>
        <radialGradient id="nj-mark-glow" cx="45%" cy="32%" r="70%">
          <stop offset="0%" stopColor={T.gold} stopOpacity="0.95" />
          <stop offset="52%" stopColor={T.copper} stopOpacity="0.78" />
          <stop offset="100%" stopColor={T.night3} />
        </radialGradient>
        <pattern id="nj-mark-grid" width="16" height="16" patternUnits="userSpaceOnUse">
          <path d="M0 8H16M8 0V16" stroke={T.chalk} strokeOpacity="0.13" strokeWidth="1.2" />
          <circle cx="8" cy="8" r="2" fill={T.teal} fillOpacity="0.35" />
        </pattern>
      </defs>
      <circle cx="60" cy="60" r="55" fill="url(#nj-mark-glow)" />
      <circle cx="60" cy="60" r="51" fill="url(#nj-mark-grid)" />
      <circle cx="60" cy="60" r="42" fill={T.night1} fillOpacity="0.7" stroke={T.gold} strokeWidth="2.5" />
      <path
        d="M33 76C43 52 52 39 60 39c9 0 14 17 27 17 5 0 9-2 13-6-6 21-16 32-29 32-12 0-16-17-25-17-5 0-9 3-13 11Z"
        fill={T.gold}
      />
      <path
        d="M37 45c8-6 16-9 23-9 12 0 21 8 26 22-9-7-16-10-23-10-10 0-18 7-26 21V45Z"
        fill={T.teal}
        opacity="0.86"
      />
      {!compact && (
        <>
          <circle cx="26" cy="31" r="4" fill={T.pink} />
          <circle cx="93" cy="86" r="4" fill={T.teal} />
          <path d="M24 88h16M80 30h18" stroke={T.chalk} strokeOpacity="0.6" strokeWidth="3" strokeLinecap="round" />
        </>
      )}
    </svg>
  );
}

interface IconProps {
  name: NjamboIconName;
  size?: number;
  tone?: "gold" | "teal" | "pink" | "cobalt" | "light";
}

export function NjamboIcon({ name, size = 28, tone = "gold" }: IconProps) {
  const color = {
    gold: T.gold,
    teal: T.teal,
    pink: T.pink,
    cobalt: T.cobalt,
    light: T.chalk,
  }[tone];

  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      {renderIcon(name, color)}
    </svg>
  );
}

function renderIcon(name: NjamboIconName, color: string) {
  const soft = `${color}33`;
  const stroke = { stroke: color, strokeWidth: 3.2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

  switch (name) {
    case "online":
    case "globe":
      return (
        <>
          <circle cx="24" cy="24" r="16" fill={soft} {...stroke} />
          <path d="M9 24h30M24 8c5 5 7 10 7 16s-2 11-7 16M24 8c-5 5-7 10-7 16s2 11 7 16" fill="none" {...stroke} />
        </>
      );
    case "friends":
    case "users":
      return (
        <>
          <circle cx="18" cy="18" r="7" fill={soft} {...stroke} />
          <circle cx="32" cy="20" r="6" fill="none" {...stroke} />
          <path d="M7 38c3-8 18-8 22 0M25 37c3-5 11-5 15 0" fill="none" {...stroke} />
        </>
      );
    case "bot":
      return (
        <>
          <rect x="11" y="15" width="26" height="22" rx="8" fill={soft} {...stroke} />
          <path d="M24 15V9M18 9h12M18 27h.1M30 27h.1M18 34c4 2 8 2 12 0" fill="none" {...stroke} />
        </>
      );
    case "trophy":
      return (
        <>
          <path d="M16 10h16v10c0 7-4 12-8 12s-8-5-8-12V10Z" fill={soft} {...stroke} />
          <path d="M16 15H9c0 7 3 11 8 11M32 15h7c0 7-3 11-8 11M24 32v6M16 40h16" fill="none" {...stroke} />
        </>
      );
    case "history":
      return (
        <>
          <path d="M12 13h24v27H12z" fill={soft} {...stroke} />
          <path d="M17 9v8M31 9v8M17 24h14M17 31h10" fill="none" {...stroke} />
        </>
      );
    case "notification":
      return (
        <>
          <path d="M15 34h18l-3-5V20c0-6-3-10-6-10s-6 4-6 10v9l-3 5Z" fill={soft} {...stroke} />
          <path d="M21 38c1 2 5 2 6 0M30 12c3 2 5 5 5 9" fill="none" {...stroke} />
        </>
      );
    case "message":
      return (
        <>
          <path d="M10 12h28v21H20l-8 7v-7h-2V12Z" fill={soft} {...stroke} />
          <path d="M17 21h14M17 27h9" fill="none" {...stroke} />
        </>
      );
    case "search":
      return (
        <>
          <circle cx="21" cy="21" r="11" fill={soft} {...stroke} />
          <path d="m30 30 9 9" fill="none" {...stroke} />
        </>
      );
    case "plus":
      return (
        <>
          <circle cx="24" cy="24" r="15" fill={soft} {...stroke} />
          <path d="M24 16v16M16 24h16" fill="none" {...stroke} />
        </>
      );
    case "settings":
      return (
        <>
          <circle cx="24" cy="24" r="6" fill={soft} {...stroke} />
          <path d="M24 7v6M24 35v6M7 24h6M35 24h6M12 12l4 4M32 32l4 4M36 12l-4 4M16 32l-4 4" fill="none" {...stroke} />
        </>
      );
    case "home":
      return (
        <>
          <path d="M9 23 24 10l15 13v17H14V25" fill={soft} {...stroke} />
          <path d="M20 40V29h8v11" fill="none" {...stroke} />
        </>
      );
    case "coin":
      return (
        <>
          <ellipse cx="24" cy="24" rx="15" ry="12" fill={soft} {...stroke} />
          <path d="M18 24h12M21 18h9M21 30h9" fill="none" {...stroke} />
        </>
      );
    case "cards":
      return (
        <>
          <rect x="14" y="9" width="18" height="27" rx="4" fill={soft} {...stroke} transform="rotate(-8 23 23)" />
          <rect x="20" y="12" width="18" height="27" rx="4" fill={T.night2} {...stroke} transform="rotate(8 29 25)" />
          <path d="M28 22c3-5 9-2 6 3-2 3-6 6-6 6s-4-3-6-6c-3-5 3-8 6-3Z" fill={color} />
        </>
      );
    case "crown":
      return (
        <>
          <path d="m9 34 4-20 10 11 8-14 6 23H9Z" fill={soft} {...stroke} />
          <path d="M12 39h24" fill="none" {...stroke} />
        </>
      );
    case "copy":
      return (
        <>
          <rect x="16" y="15" width="20" height="24" rx="4" fill={soft} {...stroke} />
          <path d="M12 31H9a3 3 0 0 1-3-3V12a3 3 0 0 1 3-3h16a3 3 0 0 1 3 3v2" fill="none" {...stroke} />
        </>
      );
    case "code":
      return <path d="m18 16-9 8 9 8M30 16l9 8-9 8M27 11l-6 26" fill="none" {...stroke} />;
    case "check":
      return <path d="M10 25 20 35 39 13" fill="none" {...stroke} />;
    case "music":
      return (
        <>
          <path d="M18 31V12l19-4v20" fill="none" {...stroke} />
          <circle cx="14" cy="34" r="5" fill={soft} {...stroke} />
          <circle cx="33" cy="31" r="5" fill={soft} {...stroke} />
        </>
      );
    case "sound":
      return (
        <>
          <path d="M8 28V20h8l10-8v24L16 28H8Z" fill={soft} {...stroke} />
          <path d="M32 18c3 4 3 8 0 12M38 13c6 8 6 14 0 22" fill="none" {...stroke} />
        </>
      );
    case "language":
      return (
        <>
          <path d="M8 13h18M17 9v4M24 13c-3 8-8 14-15 18M12 18c3 5 7 9 12 12M27 39l8-20 8 20M31 31h8" fill="none" {...stroke} />
        </>
      );
    case "play":
      return <path d="M17 11v26l22-13-22-13Z" fill={soft} {...stroke} />;
    case "profile":
      return (
        <>
          <circle cx="24" cy="17" r="8" fill={soft} {...stroke} />
          <path d="M10 40c4-10 24-10 28 0" fill="none" {...stroke} />
        </>
      );
    case "empty":
      return (
        <>
          <rect x="14" y="9" width="20" height="30" rx="5" fill={soft} {...stroke} />
          <path d="M19 18h10M19 25h10M19 32h6" fill="none" {...stroke} />
        </>
      );
    /* ── Power cards ── */
    case "eye":
      return (
        <>
          <path d="M5 24s7-12 19-12 19 12 19 12-7 12-19 12S5 24 5 24Z" fill={soft} {...stroke} />
          <circle cx="24" cy="24" r="6" fill={color} />
          <circle cx="26" cy="22" r="1.6" fill={T.night1} />
        </>
      );
    case "cut":
      return (
        <>
          <circle cx="13" cy="14" r="5" fill={soft} {...stroke} />
          <circle cx="13" cy="34" r="5" fill={soft} {...stroke} />
          <path d="M17 16 40 33M17 32 40 15" fill="none" {...stroke} />
        </>
      );
    case "star":
      return <path d="M24 6 30 18l13 2-9 9 2 13-12-6-12 6 2-13-9-9 13-2Z" fill={soft} {...stroke} />;
    case "sparkle":
      return (
        <>
          <path d="M22 8c1.4 9 3 10.6 12 12-9 1.4-10.6 3-12 12-1.4-9-3-10.6-12-12 9-1.4 10.6-3 12-12Z" fill={soft} {...stroke} />
          <path d="M37 29c.6 4 1.2 4.6 5 5-3.8.4-4.4 1-5 5-.6-4-1.2-4.6-5-5 3.8-.4 4.4-1 5-5Z" fill={color} />
        </>
      );
    case "wind":
      return (
        <>
          <path d="M6 18h20a5 5 0 1 0-5-5" fill="none" {...stroke} />
          <path d="M6 26h29a5 5 0 1 1-5 5" fill="none" {...stroke} />
          <path d="M6 34h16a4 4 0 1 1-4 4" fill="none" {...stroke} />
        </>
      );
    case "hourglass":
      return (
        <>
          <path d="M14 8h20M14 40h20" fill="none" {...stroke} />
          <path d="M16 8c0 9 8 11 8 16 0-5 8-7 8-16M16 40c0-9 8-11 8-16 0 5 8 7 8 16Z" fill={soft} {...stroke} />
        </>
      );
    case "spark":
    default:
      return (
        <>
          <path d="M24 7 29 20l12 4-12 5-5 12-5-12-12-5 12-4 5-13Z" fill={soft} {...stroke} />
          <path d="M11 10v7M7 14h8M38 32v6M35 35h6" fill="none" {...stroke} />
        </>
      );
  }
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
