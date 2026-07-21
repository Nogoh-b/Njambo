"use client";

import { ResultScreen, type ResultScreenProps } from "@/components/scenes/ResultScreen";

/** Alias de compatibilité pour les intégrations qui montent le résultat depuis la table. */
export function ResultOverlay(props: ResultScreenProps) {
  return <ResultScreen {...props} />;
}
