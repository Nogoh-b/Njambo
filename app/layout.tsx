import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./layout-tokens.css";
import "./globals.css";
import "./ter-nocturne.css";
import { PwaRegistration } from "@/components/PwaRegistration";

const bricolage = localFont({
  src: "./fonts/bricolage-grotesque-latin.woff2",
  variable: "--font-bricolage",
  weight: "700 800",
  display: "swap",
});

const manrope = localFont({
  src: "./fonts/manrope-latin.woff2",
  variable: "--font-manrope",
  weight: "400 800",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Njambo — Le jeu du quartier",
  description: "Prototype responsive du jeu de cartes Njambo.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  userScalable: true,
  themeColor: "#231348",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <body className={`${bricolage.variable} ${manrope.variable}`}>{children}<PwaRegistration /></body>
    </html>
  );
}
