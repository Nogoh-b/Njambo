import type { PowerBoosterTier, PowerCardId } from "../../types/game";
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
 * Cartes pouvoir livrées avec le code : catalogue de SECOURS (base vide) et
 * source de la migration initiale en base (commande admin seedPowerCards).
 * En jeu, on passe TOUJOURS par le registre dynamique (./registry), alimenté
 * par le catalogue publié depuis l'admin.
 *
 * L'ordre d'insertion = l'ordre d'affichage en boutique.
 */
export const CODE_POWER_MODULES: Record<PowerCardId, PowerModule> = {
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
};

/** Palier de livre historique des cartes du code (ancienne table CARD_POOL du serveur). */
export const CODE_BOOSTER_TIERS: Record<PowerCardId, PowerBoosterTier> = {
  oeil_sorcier: "village", pluie_etoiles: "village", vent_nord: "village", bouclier_village: "village", tambour_appel: "village",
  benediction_chef: "notable", coupe_circuit: "notable", sable_temps: "notable", main_griot: "notable", feu_camp: "notable",
  eclair_mfoundi: "chef", masque_bluffeur: "chef", filet_pecheur: "chef", pagne_changeant: "chef",
  totem_ancetres: "ancetre", marche_nuit: "ancetre", cri_chef: "ancetre", pacte_mains: "ancetre",
};

export {
  getPowerModule,
  listPowerModules,
  powerCatalogRevision,
  powerRequiresTarget,
  powerScriptOf,
  setPowerCatalog,
  subscribePowerCatalog,
  boosterTierOf,
} from "./registry";
