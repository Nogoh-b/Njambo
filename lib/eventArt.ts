/* Illustration d'un événement : `imageUrl` de la fiche admin (upload VPS ou
   asset local), sinon l'illustration générique. Les assets locaux par défaut
   ont une variante -480 pour les vignettes. */

export const EVENT_FALLBACK_ART = "/assets/njambo/events/event-fallback.webp";

const LOCAL_THUMBS = new Set([
  "/assets/njambo/events/defi-du-mboa.webp",
  "/assets/njambo/events/tournoi-du-ter.webp",
]);

export interface EventArt {
  src: string;
  /** Image hébergée hors du front (upload admin) : déjà en WebP optimisé. */
  remote: boolean;
}

export function eventArt(event: { imageUrl?: string | null } | null | undefined, variant: "full" | "thumb" = "full"): EventArt {
  const url = event?.imageUrl?.trim();
  if (!url) return { src: EVENT_FALLBACK_ART, remote: false };
  if (/^https?:\/\//.test(url)) return { src: url, remote: true };
  if (variant === "thumb" && LOCAL_THUMBS.has(url)) return { src: url.replace(/\.webp$/, "-480.webp"), remote: false };
  return { src: url, remote: false };
}
