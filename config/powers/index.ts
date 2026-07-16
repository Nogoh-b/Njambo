import type { PowerCardId } from "../../types/game";
import type { PowerModule } from "../../engine/power/types";

import { oeilSorcier } from "./oeil_sorcier";
import { pluieEtoiles } from "./pluie_etoiles";
import { ventNord } from "./vent_nord";
import { benedictionChef } from "./benediction_chef";
import { coupeCircuit } from "./coupe_circuit";
import { sableTemps } from "./sable_temps";
import { bouclierVillage } from "./bouclier_village";
import { tambourAppel } from "./tambour_appel";
import { caurisChanceux } from "./cauris_chanceux";
import { mainGriot } from "./main_griot";
import { eclairMfoundi } from "./eclair_mfoundi";
import { totemAncetres } from "./totem_ancetres";
import { masqueBluffeur } from "./masque_bluffeur";
import { filetPecheur } from "./filet_pecheur";
import { marcheNuit } from "./marche_nuit";
import { criChef } from "./cri_chef";
import { feuCamp } from "./feu_camp";
import { pagneChangeant } from "./pagne_changeant";
import { trocCible } from "./troc_cible";
import { pacteMains } from "./pacte_mains";
import { sceauEntrave } from "./sceau_entrave";

/**
 * Registre unique des cartes pouvoir. `satisfies Record<PowerCardId, …>`
 * force l'exhaustivité : ajouter un littéral à PowerCardId sans module ici
 * (ou l'inverse) est une erreur de compilation.
 *
 * L'ordre d'insertion = l'ordre d'affichage en boutique (POWER_CARDS).
 */
export const POWER_MODULES = {
  oeil_sorcier: oeilSorcier,
  pluie_etoiles: pluieEtoiles,
  vent_nord: ventNord,
  benediction_chef: benedictionChef,
  coupe_circuit: coupeCircuit,
  sable_temps: sableTemps,
  bouclier_village: bouclierVillage,
  tambour_appel: tambourAppel,
  cauris_chanceux: caurisChanceux,
  main_griot: mainGriot,
  eclair_mfoundi: eclairMfoundi,
  totem_ancetres: totemAncetres,
  masque_bluffeur: masqueBluffeur,
  filet_pecheur: filetPecheur,
  marche_nuit: marcheNuit,
  cri_chef: criChef,
  feu_camp: feuCamp,
  pagne_changeant: pagneChangeant,
  troc_cible: trocCible,
  pacte_mains: pacteMains,
  sceau_entrave: sceauEntrave,
} satisfies Record<PowerCardId, PowerModule>;

/** Script d'une carte (raccourci typé). */
export function powerScriptOf(cardId: PowerCardId) {
  return POWER_MODULES[cardId].script;
}

/** La carte attend-elle un choix de cible de l'activateur (modale) ? */
export function powerRequiresTarget(cardId: PowerCardId): boolean {
  const target = POWER_MODULES[cardId].script.target;
  return target.count !== "none" && target.chooser !== "engine";
}
