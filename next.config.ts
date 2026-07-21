import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR || ".next",
  images: {
    // Les assets sont déjà en .webp ; on sert directement ce format.
    formats: ["image/webp"],
    // Cache HTTP long de /_next/image : les icônes/fonds réutilisés entre
    // écrans ne sont plus re-fetchés à chaque navigation (juste re-décodés).
    minimumCacheTTL: 60 * 60 * 24 * 30,
  },
};

export default nextConfig;
