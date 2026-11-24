"use client";

/* Options → « Alertes d'événements » : préférence serveur (opt-out des
   campagnes) + permission et jeton push de cet appareil. */

import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { backendCallable } from "@/lib/backendCallable";
import { db } from "@/lib/firebase";
import { doc, getDoc } from "@/lib/firestoreClient";
import { enablePush, pushSupport } from "@/lib/pushRegistration";

const CAPTIONS: Record<string, string> = {
  on: "Ouverture, dernières heures, résultats",
  off: "Tu ne recevras plus d’alertes d’événements",
  denied: "Bloquées par le navigateur : autorise les notifications du site",
  unsupported: "Alertes dans l’app uniquement sur cet appareil",
  not_configured: "Alertes dans l’app uniquement",
  guest: "Connecte-toi pour recevoir les alertes",
};

/** État et action des alertes d'événements, réutilisable par n'importe quel rendu. */
export function useEventAlerts() {
  const { user } = useAuth();
  const [on, setOn] = useState(true);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const guest = !user || user.isAnonymous;

  useEffect(() => {
    if (guest || !user) return;
    let active = true;
    getDoc(doc(db, "players", user.uid))
      .then((snapshot) => { if (active) setOn(snapshot.get("notificationPrefs.events") !== false); })
      .catch(() => { /* préférence par défaut : activée */ });
    return () => { active = false; };
  }, [guest, user]);

  const change = async (next: boolean) => {
    if (guest || busy) return;
    setBusy(true);
    setNote(null);
    setOn(next);
    try {
      await backendCallable("setNotificationPrefs")({ events: next });
      if (next) {
        const result = await enablePush();
        if (result !== "granted") setNote(CAPTIONS[result] ?? null);
      }
    } catch {
      setOn(!next);
      setNote("Impossible d’enregistrer pour le moment.");
    } finally {
      setBusy(false);
    }
  };

  const support = typeof window === "undefined" ? "ok" : pushSupport();
  const caption = guest ? CAPTIONS.guest : note ?? (!on ? CAPTIONS.off : support === "ok" ? CAPTIONS.on : CAPTIONS[support]);
  return { on: !guest && on, guest, busy, caption, setOn: (next: boolean) => void change(next) };
}
