"use client";

/* Choix du pack d'assets système utilisé dans tout le jeu (monnaies, énergie,
   roue, packs boutique, tickets, livres, rangs). Les autres packs restent
   installés et peuvent être réactivés à tout moment. */

import { useState } from "react";
import { ASSET_PACKS, assetPackUrl, type AssetPackId } from "@/domain/assetPacks";
import { setAssetPack, useAssetPack } from "@/lib/assetPack";
import { useAssetPackSync } from "@/hooks/useAssetPackSync";
import { adminApi, adminErrorText } from "./adminApi";
import styles from "./AdminConsole.module.css";

const PREVIEW = [
  "/assets/njambo/economy/nkap-128.webp",
  "/assets/njambo/economy/cauri-128.webp",
  "/assets/njambo/economy/energy-flask-128.webp",
  "/assets/njambo/tickets/ticket-or-128.webp",
  "/assets/njambo/books/book-rare-128.webp",
  "/assets/njambo/ranks/rank-legende-237-128.webp",
];

export function AssetPackPanel() {
  useAssetPackSync();
  const active = useAssetPack();
  const [saving, setSaving] = useState<AssetPackId | null>(null);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  async function activate(pack: AssetPackId) {
    setSaving(pack);
    setMessage(null);
    try {
      await adminApi.saveAssetPack(pack);
      setAssetPack(pack);
      const name = ASSET_PACKS.find((item) => item.id === pack)?.name ?? pack;
      setMessage({ kind: "ok", text: `Pack « ${name} » activé pour tous les joueurs. Il s'affiche au fil des écrans, et partout au prochain lancement du jeu.` });
    } catch (error) {
      setMessage({ kind: "error", text: `Activation impossible : ${adminErrorText(error)}` });
    } finally {
      setSaving(null);
    }
  }

  return (
    <section className={styles.panel}>
      <h2>Pack d&apos;assets du jeu</h2>
      <p className={styles.hint} style={{ marginTop: 0, marginBottom: 12 }}>
        Monnaies, énergie, roue, packs boutique, tickets, livres et rangs. Un seul pack est utilisé à la fois ; les autres restent installés.
      </p>
      {message && <div className={`${styles.notice} ${styles[message.kind]}`}>{message.text}</div>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 12 }}>
        {ASSET_PACKS.map((pack) => {
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
                {PREVIEW.map((path) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={path} src={assetPackUrl(path, pack.id)} alt="" width={64} height={64} style={{ width: "100%", height: "auto" }} />
                ))}
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
