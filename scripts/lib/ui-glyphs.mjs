export const ICON_NAMES = [
  "bot", "cards", "check", "coin", "code", "copy", "crown", "cut",
  "empty", "eye", "friends", "globe", "history", "home", "hourglass", "language",
  "message", "music", "notification", "online", "play", "plus", "profile", "search",
  "settings", "sound", "spark", "sparkle", "star", "trophy", "users", "wind",
];

const stroke = 'fill="none" stroke="url(#glyph-metal)" stroke-width="3.25" stroke-linecap="round" stroke-linejoin="round"';
const soft = 'fill="#0b2c30" stroke="url(#glyph-metal)" stroke-width="3.25" stroke-linecap="round" stroke-linejoin="round"';
const solid = 'fill="url(#glyph-metal)" stroke="#6f361f" stroke-width="1.15" stroke-linejoin="round"';

export function glyph(name) {
  switch (name) {
    case "online":
    case "globe":
      return `<circle cx="24" cy="24" r="16" ${soft}/><path d="M9 24h30M24 8c5 5 7 10 7 16s-2 11-7 16M24 8c-5 5-7 10-7 16s2 11 7 16" ${stroke}/>`;
    case "friends":
    case "users":
      return `<circle cx="18" cy="18" r="7" ${soft}/><circle cx="32" cy="20" r="6" ${stroke}/><path d="M7 38c3-8 18-8 22 0M25 37c3-5 11-5 15 0" ${stroke}/>`;
    case "bot":
      return `<rect x="11" y="15" width="26" height="22" rx="8" ${soft}/><path d="M24 15V9M18 9h12M18 27h.1M30 27h.1M18 34c4 2 8 2 12 0" ${stroke}/>`;
    case "trophy":
      return `<path d="M16 10h16v10c0 7-4 12-8 12s-8-5-8-12V10Z" ${soft}/><path d="M16 15H9c0 7 3 11 8 11M32 15h7c0 7-3 11-8 11M24 32v6M16 40h16" ${stroke}/>`;
    case "history":
      return `<path d="M12 13h24v27H12z" ${soft}/><path d="M17 9v8M31 9v8M17 24h14M17 31h10" ${stroke}/>`;
    case "notification":
      return `<path d="M15 34h18l-3-5V20c0-6-3-10-6-10s-6 4-6 10v9l-3 5Z" ${soft}/><path d="M21 38c1 2 5 2 6 0M30 12c3 2 5 5 5 9" ${stroke}/>`;
    case "message":
      return `<path d="M10 12h28v21H20l-8 7v-7h-2V12Z" ${soft}/><path d="M17 21h14M17 27h9" ${stroke}/>`;
    case "search":
      return `<circle cx="21" cy="21" r="11" ${soft}/><path d="m30 30 9 9" ${stroke}/>`;
    case "plus":
      return `<circle cx="24" cy="24" r="15" ${soft}/><path d="M24 16v16M16 24h16" ${stroke}/>`;
    case "settings":
      return `<circle cx="24" cy="24" r="6" ${soft}/><path d="M24 7v6M24 35v6M7 24h6M35 24h6M12 12l4 4M32 32l4 4M36 12l-4 4M16 32l-4 4" ${stroke}/>`;
    case "home":
      return `<path d="M9 23 24 10l15 13v17H14V25" ${soft}/><path d="M20 40V29h8v11" ${stroke}/>`;
    case "coin":
      return `<ellipse cx="24" cy="24" rx="15" ry="12" ${soft}/><path d="M18 24h12M21 18h9M21 30h9" ${stroke}/>`;
    case "cards":
      return `<rect x="14" y="9" width="18" height="27" rx="4" ${soft} transform="rotate(-8 23 23)"/><rect x="20" y="12" width="18" height="27" rx="4" fill="#0b1628" stroke="url(#glyph-metal)" stroke-width="3.25" transform="rotate(8 29 25)"/><path d="M28 22c3-5 9-2 6 3-2 3-6 6-6 6s-4-3-6-6c-3-5 3-8 6-3Z" ${solid}/>`;
    case "crown":
      return `<path d="m9 34 4-20 10 11 8-14 6 23H9Z" ${soft}/><path d="M12 39h24" ${stroke}/>`;
    case "copy":
      return `<rect x="16" y="15" width="20" height="24" rx="4" ${soft}/><path d="M12 31H9a3 3 0 0 1-3-3V12a3 3 0 0 1 3-3h16a3 3 0 0 1 3 3v2" ${stroke}/>`;
    case "code":
      return `<path d="m18 16-9 8 9 8M30 16l9 8-9 8M27 11l-6 26" ${stroke}/>`;
    case "check":
      return `<path d="M10 25 20 35 39 13" ${stroke}/>`;
    case "music":
      return `<path d="M18 31V12l19-4v20" ${stroke}/><circle cx="14" cy="34" r="5" ${soft}/><circle cx="33" cy="31" r="5" ${soft}/>`;
    case "sound":
      return `<path d="M8 28V20h8l10-8v24L16 28H8Z" ${soft}/><path d="M32 18c3 4 3 8 0 12M38 13c6 8 6 14 0 22" ${stroke}/>`;
    case "language":
      return `<path d="M8 13h18M17 9v4M24 13c-3 8-8 14-15 18M12 18c3 5 7 9 12 12M27 39l8-20 8 20M31 31h8" ${stroke}/>`;
    case "play":
      return `<path d="M17 11v26l22-13-22-13Z" ${soft}/>`;
    case "profile":
      return `<circle cx="24" cy="17" r="8" ${soft}/><path d="M10 40c4-10 24-10 28 0" ${stroke}/>`;
    case "empty":
      return `<rect x="14" y="9" width="20" height="30" rx="5" ${soft}/><path d="M19 18h10M19 25h10M19 32h6" ${stroke}/>`;
    case "eye":
      return `<path d="M5 24s7-12 19-12 19 12 19 12-7 12-19 12S5 24 5 24Z" ${soft}/><circle cx="24" cy="24" r="6" ${solid}/><circle cx="26" cy="22" r="1.6" fill="#090917"/>`;
    case "cut":
      return `<circle cx="13" cy="14" r="5" ${soft}/><circle cx="13" cy="34" r="5" ${soft}/><path d="M17 16 40 33M17 32 40 15" ${stroke}/>`;
    case "star":
      return `<path d="M24 6 30 18l13 2-9 9 2 13-12-6-12 6 2-13-9-9 13-2Z" ${soft}/>`;
    case "sparkle":
      return `<path d="M22 8c1.4 9 3 10.6 12 12-9 1.4-10.6 3-12 12-1.4-9-3-10.6-12-12 9-1.4 10.6-3 12-12Z" ${soft}/><path d="M37 29c.6 4 1.2 4.6 5 5-3.8.4-4.4 1-5 5-.6-4-1.2-4.6-5-5 3.8-.4 4.4-1 5-5Z" ${solid}/>`;
    case "wind":
      return `<path d="M6 18h20a5 5 0 1 0-5-5M6 26h29a5 5 0 1 1-5 5M6 34h16a4 4 0 1 1-4 4" ${stroke}/>`;
    case "hourglass":
      return `<path d="M14 8h20M14 40h20" ${stroke}/><path d="M16 8c0 9 8 11 8 16 0-5 8-7 8-16M16 40c0-9 8-11 8-16 0 5 8 7 8 16Z" ${soft}/>`;
    case "spark":
    default:
      return `<path d="M24 7 29 20l12 4-12 5-5 12-5-12-12-5 12-4 5-13Z" ${soft}/><path d="M11 10v7M7 14h8M38 32v6M35 35h6" ${stroke}/>`;
  }
}

