import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // Les jonctions node_modules/@gxe/* pointent vers ../gxe/packages : Turbopack
  // résout les liens en chemins réels, la racine doit donc englober les deux
  // dépôts, sinon `@gxe/react` est « hors projet » et introuvable.
  //
  // ATTENTION : changer cette racine change TOUS les identifiants de module
  // (« [project]/Njambo/… ») et invalide le cache Turbopack. Un cache périmé
  // produit alors des « Could not find the module … in the React Client
  // Manifest ». Après toute modification ici : supprimer `.next/dev`.
  turbopack: {
    root: path.resolve(process.cwd(), ".."),
  },
  // Game Experience Engine : les packages @gxe/* sont liés par jonction vers
  // ../gxe/packages et exportent leurs sources TypeScript — Next doit donc les
  // transpiler comme du code du projet (le HMR porte alors jusqu'au moteur).
  transpilePackages: [
    "@gxe/contract",
    "@gxe/kernel",
    "@gxe/experience",
    "@gxe/stage",
    "@gxe/driver-motion",
    "@gxe/driver-particles",
    "@gxe/react",
  ],
  images: {
    // Les assets sont déjà en .webp ; on sert directement ce format.
    formats: ["image/webp"],
    // Cache HTTP long de /_next/image : les icônes/fonds réutilisés entre
    // écrans ne sont plus re-fetchés à chaque navigation (juste re-décodés).
    minimumCacheTTL: 60 * 60 * 24 * 30,
  },
};

export default nextConfig;
