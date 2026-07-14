import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Njambo — Le jeu du quartier",
    short_name: "Njambo",
    description: "Jeu de cartes camerounais, tables du Mboa et événements du Ter.",
    start_url: "/",
    display: "standalone",
    background_color: "#0b0807",
    theme_color: "#7f4a24",
    lang: "fr",
    orientation: "any",
    icons: [
      { src: "/assets/njambo/card-back.webp", sizes: "any", type: "image/webp", purpose: "any" },
    ],
  };
}
