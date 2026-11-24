import os from "node:os";
import path from "node:path";
import type { NextConfig } from "next";

/**
 * Détecte automatiquement toutes les IPv4 locales de la machine + autorise les
 * plages privées LAN/Wi-Fi/partage de connexion (10.x, 192.168.x, 172.x) pour
 * que le test sur téléphone ne soit jamais bloqué quand l'IP DHCP change.
 */
function getAllowedDevOrigins(): string[] {
  const origins = new Set<string>([
    "localhost",
    "127.0.0.1",
    "*.local",
    "10.*",
    "10.*.*.*",
    "192.168.*",
    "192.168.*.*",
    "172.*",
    "172.*.*.*",
  ]);
  const interfaces = os.networkInterfaces();
  for (const entries of Object.values(interfaces)) {
    for (const entry of entries ?? []) {
      if (entry.family === "IPv4" && !entry.internal) {
        origins.add(entry.address);
      }
    }
  }
  return [...origins];
}

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR || ".next",
  allowedDevOrigins: getAllowedDevOrigins(),
  // Les jonctions node_modules/@gxe/* pointent vers ../gxe/packages : Turbopack
  // résout les liens en chemins réels, la racine doit donc englober les deux
  // dépôts, sinon `@gxe/react` est « hors projet » et introuvable.
  //
  // ATTENTION : changer cette racine change TOUS les identifiants de module
  // (« [project]/Njambo/… ») et invalide le cache Turbopack. Un cache périmé
  // produit alors des « Could not find the module … in the React Client
  // Manifest ». Après toute modification ici : supprimer `.next/dev`.
  turbopack: {
    root: process.cwd(),
  },
  images: {
    // Tous les assets locaux sont déjà générés en .webp aux tailles cibles
    // (64 / 128 / 256 / 480 px). Servir les URLs directement sans proxy
    // /_next/image garantit 100 % de partage du cache avec AssetLoader et le
    // Service Worker, élimine les doubles requêtes et supprime le ré-encodage VPS.
    unoptimized: true,
    formats: ["image/webp"],
    minimumCacheTTL: 60 * 60 * 24 * 30,
  },
  async headers() {
    return [
      {
        source: "/assets/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=604800, stale-while-revalidate=2592000",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
