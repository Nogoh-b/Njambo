"use client";

/* Choix des packs d'assets utilisés dans tout le jeu, en trois réglages
   indépendants : assets système (monnaies, énergie, roue, packs boutique,
   tickets, livres, rangs) et interface (icônes, navigation, cadres de boutons,
   cartes de modes de jeu), et illustrations des cartes Pouvoir. */

import { useState } from "react";
import { assetPackUrl, assetPacksForScope, isPortraitPowerPack, powerPackThumbUrl, type AssetPackId, type AssetPackScope } from "@/domain/assetPacks";
import { setAssetPacks, useAssetPacks } from "@/lib/assetPack";
import { useAssetPackSync } from "@/hooks/useAssetPackSync";
import { adminApi, adminErrorText } from "./adminApi";
import { PowerPackImporter } from "./PowerPackImporter";
import styles from "./AdminConsole.module.css";

const SECTIONS: Record<AssetPackScope, { title: string; hint: string; preview: string[] }> = {
  system: {
    title: "Pack d'assets système",
    hint: "Monnaies, énergie, roue, packs boutique, tickets, livres et rangs.",
    preview: [
      "/assets/njambo/economy/nkap-128.webp",
      "/assets/njambo/economy/cauri-128.webp",
      "/assets/njambo/economy/energy-flask-128.webp",
      "/assets/njambo/tickets/ticket-or-128.webp",
      "/assets/njambo/books/book-rare-128.webp",
      "/assets/njambo/ranks/rank-legende-237-128.webp",
    ],
  },
  interface: {
    title: "Pack d'interface",
    hint: "Icônes, icônes de navigation, cadres de boutons et cartes des modes de jeu.",
    preview: [
      "/assets/njambo/ui/icons/home-128.webp",
      "/assets/njambo/ui/icons/trophy-128.webp",
      "/assets/njambo/ui/icons/settings-128.webp",
      "/assets/njambo/ui/icons/friends-128.webp",
      "/assets/njambo/ui/icons/star-128.webp",
      "/assets/njambo/ui/buttons/icon-plate-128.webp",
    ],
  },
  powers: {
    title: "Pack de cartes Pouvoir",
    hint: "Illustrations des 21 cartes Pouvoir intégrées, packs importés compris. Les images personnalisées restent prioritaires.",
    preview: [
      "/assets/power-cards/v2/oeil_sorcier.webp",
      "/assets/power-cards/v2/tambour_appel.webp",
      "/assets/power-cards/v2/bouclier_village.webp",
      "/assets/power-cards/v2/masque_bluffeur.webp",
      "/assets/power-cards/v2/cauris_chanceux.webp",
      "/assets/power-cards/v2/totem_ancetres.webp",
    ],
  },
};

function PackSection({ scope, active }: { scope: AssetPackScope; active: AssetPackId }) {
  const section = SECTIONS[scope];
  const [saving, setSaving] = useState<AssetPackId | null>(null);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  async function activate(pack: AssetPackId) {
    setSaving(pack);
    setMessage(null);
    try {
      await adminApi.saveAssetPack(pack, scope);
      setAssetPacks({ [scope]: pack });
      const name = assetPacksForScope(scope).find((item) => item.id === pack)?.name ?? pack;
      setMessage({ kind: "ok", text: `« ${name} » activé pour tous les joueurs. Il s'affiche tout de suite sur tous les écrans, sans relancer le jeu.` });
    } catch (error) {
      setMessage({ kind: "error", text: `Activation impossible : ${adminErrorText(error)}` });
    } finally {
      setSaving(null);
    }
  }

  return (
    <section className={styles.panel}>
      <h2>{section.title}</h2>
      <p className={styles.hint} style={{ marginTop: 0, marginBottom: 12 }}>
        {section.hint} Un seul pack est utilisé à la fois ; les autres restent installés.
      </p>
      {message && <div className={`${styles.notice} ${styles[message.kind]}`}>{message.text}</div>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 12 }}>
        {assetPacksForScope(scope).map((pack) => {
          const isActive = pack.id === active;
          return (
            <div
              key={pack.id}
              style={{
                display: "flex", flexDirection: "column", gap: 10, padding: 12, borderRadius: 10, background: "#1b140d",
                border: isActive ? "2px solid #f2bb45" : "1px solid #352719",
              }}
            >
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6, background: "#0c0906", borderRadius: 8, padding: 6 }}>
                {section.preview.map((path) => {
                  const thumbnail = scope === "powers" ? powerPackThumbUrl(path, pack.id) : assetPackUrl(path, pack.id, scope);
                  return (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={path} src={thumbnail} alt="" loading="lazy" width={64} height={isPortraitPowerPack(pack.id) ? 96 : 64} style={{ width: "100%", height: "auto" }} />
                  );
                })}
              </div>
              <div>
                <strong>{pack.name}</strong>{isActive && <span style={{ color: "#f2bb45", marginLeft: 8 }}>● actif</span>}
                <div className={styles.hint}>{pack.description}</div>
              </div>
              <button
                type="button"
                className={`${styles.btn} ${isActive ? "" : styles.primary}`}
                disabled={isActive || saving !== null}
                onClick={() => void activate(pack.id)}
              >
                {saving === pack.id ? "Activation…" : isActive ? "Pack utilisé" : "Utiliser ce pack"}
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function AssetPackPanel() {
  useAssetPackSync();
  const active = useAssetPacks();
  return (
    <>
      <PackSection scope="system" active={active.system} />
      <PackSection scope="interface" active={active.interface} />
      <PackSection scope="powers" active={active.powers} />
      <PowerPackImporter />
    </>
  );
}

/** Même sélecteur dans la section Cartes de pouvoir. */
export function PowerArtPackPanel() {
  useAssetPackSync();
  const active = useAssetPacks();
  return (
    <>
      <PackSection scope="powers" active={active.powers} />
      <PowerPackImporter />
    </>
  );
}
