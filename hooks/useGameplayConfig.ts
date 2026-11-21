"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { DEFAULT_GAMEPLAY_CONFIG, normalizeGameplayConfig } from "@/domain/gameplayConfig";
import { db } from "@/lib/firebase";
import { doc, onSnapshot } from "@/lib/firestoreClient";

export function useGameplayConfig() {
  const { user } = useAuth();
  const uid = user?.uid;
  const [config, setConfig] = useState(DEFAULT_GAMEPLAY_CONFIG);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (!uid) return;
    return onSnapshot(doc(db, "runtime_config", "gameplay"), (snapshot) => {
      setConfig(normalizeGameplayConfig(snapshot.data()));
      setLoading(false);
      setError(false);
    }, () => { setLoading(false); setError(true); });
  }, [uid]);
  return { config, loading, error };
}
