"use client";

import { useEffect, useState } from "react";
import { DEFAULT_GAMEPLAY_CONFIG, normalizeGameplayConfig } from "@/domain/gameplayConfig";
import { db } from "@/lib/firebase";
import { doc, onSnapshot } from "@/lib/firestoreClient";

/** Règles publiques de table (runtime_config/gameplay : lisible connectés et invités). */
export function useGameplayConfig() {
  const [config, setConfig] = useState(DEFAULT_GAMEPLAY_CONFIG);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    try {
      return onSnapshot(
        doc(db, "runtime_config", "gameplay"),
        (snapshot) => {
          setConfig(normalizeGameplayConfig(snapshot.data()));
          setLoading(false);
          setError(false);
        },
        () => {
          setLoading(false);
          setError(true);
        },
      );
    } catch {
      setLoading(false);
      return undefined;
    }
  }, []);

  return { config, loading, error };
}
