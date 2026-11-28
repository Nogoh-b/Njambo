import type { ChangelogAdminSection } from "@/domain";

export const ADMIN_SECTIONS = {
  dashboard: { slug: "", label: "Tableau de bord" },
  changelog: { slug: "nouveautes", label: "Nouveautés" },
  events: { slug: "evenements", label: "Événements" },
  gameplay: { slug: "regles", label: "Règles des parties" },
  seasons: { slug: "saisons", label: "Saisons" },
  cosmetics: { slug: "cosmetiques", label: "Cosmétiques" },
  powers: { slug: "cartes-pouvoir", label: "Cartes de pouvoir" },
  packs: { slug: "packs-cartes", label: "Packs de cartes" },
  animations: { slug: "animations", label: "Animations" },
  audio: { slug: "audio", label: "Sons & Audio" },
  assistant: { slug: "assistant", label: "Assistant IA" },
  notifications: { slug: "notifications", label: "Notifications" },
  players: { slug: "joueurs", label: "Joueurs" },
  audit: { slug: "audit", label: "Audit" },
  tools: { slug: "outils", label: "Outils" },
} satisfies Record<ChangelogAdminSection | "packs", { slug: string; label: string }>;

export type AdminSection = keyof typeof ADMIN_SECTIONS;
export const ADMIN_NAV = Object.keys(ADMIN_SECTIONS) as AdminSection[];

export function adminHref(section: AdminSection): string {
  const { slug } = ADMIN_SECTIONS[section];
  return slug ? `/admin/${slug}` : "/admin";
}

export function powerPackHref(packId: string, cardId?: string): string {
  const base = `${adminHref("packs")}/${encodeURIComponent(packId)}`;
  return cardId ? `${base}/${encodeURIComponent(cardId)}` : base;
}
