import type { PowerModule } from "../../engine/power/types";

/** Totem des Ancêtres — protège de la mise double (dernier pli gagné avec un 3) si tu perds cette manche.
 *  Activable seulement avant le dernier pli : on se protège sans voir le 3 gagnant sur la table. */
export const totemAncetres: PowerModule = {
  def: {
    id: "totem_ancetres",
    name: "Totem des Ancêtres",
    category: "defense",
    icon: "trophy",
    tone: "gold",
    rarity: "legendary",
    targetMode: "self",
    art: "/assets/power-cards/v2/totem_ancetres.webp",
    activationTitle: "TOTEM DES ANCÊTRES",
    activationText: "Protégé de la mise double si tu perds",
    activationTextOthers: "{activator} invoque les ancêtres",
    description: "Si le dernier pli est gagné avec un 3, tu ne paies pas la mise double. Se joue avant le dernier pli.",
    costCauris: 70,
    costNkap: 1200,
    animTags: ["result_economy"],
  },
  script: {
    id: "totem_ancetres",
    target: { count: "none" },
    conditions: [{ kind: "notLastTrick" }],
    steps: [
      {
        ops: [{ op: "preventDoublePenalty", player: "self" }],
        anim: [{ cue: "avatarAura", player: "self", style: "totem" }],
        /* Les ancêtres veillent :
           1. annonce (« {activator} invoque les ancêtres » chez les autres) ;
           2. un totem sculpté sort de terre à côté de l'avatar du lanceur, ses yeux s'allument, un cercle de pierre
              se referme autour de l'avatar (aura totem), « Protégé » ;
           3. textes pour le lanceur et les autres ;
           ensuite (PowerChargeLayer), pour tous : « 🗿 Protégé de la mise double » sous son avatar jusqu'au dernier pli ;
           à l'écran de résultat, si le 3 a doublé : « Totem des Ancêtres : mise double évitée ». */
        choreo: {
          tracks: [
            { id: "totem", kind: "element", startMs: 0, durationMs: 2000, target: { element: "avatar", player: "self" }, effect: "totem", label: "Protégé", intensity: 2 },
            { id: "lanceur", kind: "text", startMs: 1100, durationMs: 1900, text: "Dernier pli gagné avec un 3 : tu ne paies pas la mise double", at: { kind: "screen", at: "tableCenter", dy: -14 }, size: "s", tone: "gold", audience: "activator" },
            { id: "temoin", kind: "text", startMs: 1100, durationMs: 1900, text: "{activator} ne paiera pas la mise double", at: { kind: "screen", at: "tableCenter", dy: -14 }, size: "s", tone: "gold", audience: "others" },
          ],
        },
      },
    ],
  },
};
