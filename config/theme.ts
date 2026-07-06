/* Palette Njambo - nuit urbaine camerounaise, raphia, cuivre, ndop et palmier. */
export const T = {
  night1: "#090917",
  night2: "#10142d",
  night3: "#1c1741",
  deep: "#05050c",
  felt1: "#119684",
  felt2: "#06534f",
  felt3: "#042f32",
  rim: "#b85d3e",
  rim2: "#3d1a1a",
  gold: "#f2bb45",
  raffia: "#d7a957",
  copper: "#c75b3a",
  pink: "#d83c68",
  teal: "#10b7a6",
  cobalt: "#3154d4",
  palm: "#64c778",
  cream: "#fff0d0",
  chalk: "#fff8e8",
  ink: "#1b1010",
  text: "#fff4df",
  muted: "#b8adcf",
  good: "#6ee59c",
  bad: "#ff7182",
} as const;

export const CEREMONIAL_STRIP = `repeating-linear-gradient(90deg, ${T.gold} 0 14px, ${T.copper} 14px 22px, ${T.teal} 22px 34px, ${T.cobalt} 34px 43px, ${T.pink} 43px 51px)`;

export const NDOP_LINES = (opacity = 0.15) => `
  repeating-linear-gradient(
    0deg,
    transparent 0 17px,
    ${T.cobalt}${toHex(opacity)} 17px 19px,
    transparent 19px 38px
  ),
  repeating-linear-gradient(
    90deg,
    transparent 0 21px,
    ${T.teal}${toHex(opacity * 0.8)} 21px 23px,
    transparent 23px 46px
  )`;

export const RAFFIA_WEAVE = (opacity = 0.18) => `
  repeating-linear-gradient(
    45deg,
    transparent 0 10px,
    ${T.gold}${toHex(opacity)} 10px 12px,
    transparent 12px 24px
  ),
  repeating-linear-gradient(
    -45deg,
    transparent 0 12px,
    ${T.copper}${toHex(opacity * 0.7)} 12px 14px,
    transparent 14px 28px
  )`;

export const MARKET_DOTS = (opacity = 0.12) => `
  radial-gradient(circle, ${T.gold}${toHex(opacity)} 2px, transparent 2.5px),
  radial-gradient(circle, ${T.teal}${toHex(opacity * 0.8)} 1.5px, transparent 2px),
  radial-gradient(circle, ${T.pink}${toHex(opacity * 0.65)} 1.5px, transparent 2px)`;

export const CARD_BACK_PATTERN = `
  radial-gradient(circle at 50% 50%, ${T.gold}55 0 5px, transparent 5px 15px),
  ${NDOP_LINES(0.22)},
  ${MARKET_DOTS(0.2)}
`;

export const TABLE_PATTERN = `
  ${RAFFIA_WEAVE(0.07)},
  radial-gradient(circle at 50% 50%, rgba(255,255,255,0.08) 0 1px, transparent 1.5px)
`;

export const GLASS = "rgba(255, 248, 232, 0.07)";

function toHex(n: number): string {
  const clamped = Math.max(0, Math.min(1, n));
  return Math.round(clamped * 255).toString(16).padStart(2, "0");
}
