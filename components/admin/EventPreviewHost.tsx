"use client";

/* Page /admin/apercu, chargée dans un iframe par l'éditeur d'événements.
   Rend le VRAI EventDetailScreen (mêmes providers que le jeu) avec la fiche
   brouillon reçue par postMessage depuis la fenêtre parente (même origine). */

import { useEffect, useState } from "react";
import { normalizeEventVersion, type EventVersion } from "@/domain";
import { AuthProvider } from "@/hooks/useAuth";
import { EconomyProvider } from "@/contexts/EconomyContext";
import { SettingsProvider } from "@/contexts/SettingsContext";
import { GameProvider } from "@/contexts/GameContext";
import { MotionProfileProvider } from "@/lib/motion";
import { EventDetailScreen } from "@/components/scenes/EventDetailScreen";
import { PREVIEW_MESSAGE } from "./adminUi";


export function EventPreviewHost() {
  const [event, setEvent] = useState<EventVersion | null>(null);

  useEffect(() => {
    const onMessage = (message: MessageEvent) => {
      if (message.origin !== window.location.origin) return;
      const data = message.data as { type?: string; event?: unknown } | null;
      if (data?.type !== PREVIEW_MESSAGE || !data.event) return;
      // L'aperçu montre l'événement « en ligne » pour juger le rendu réel.
      setEvent({ ...normalizeEventVersion(data.event), published: true });
    };
    window.addEventListener("message", onMessage);
    window.parent?.postMessage({ type: `${PREVIEW_MESSAGE}:ready` }, window.location.origin);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  if (!event) return <main className="nj-admin"><p>En attente de la fiche…</p></main>;
  return (
    <AuthProvider>
      <EconomyProvider>
        <SettingsProvider>
          <GameProvider>
            <MotionProfileProvider>
              <EventDetailScreen previewEvent={event} />
            </MotionProfileProvider>
          </GameProvider>
        </SettingsProvider>
      </EconomyProvider>
    </AuthProvider>
  );
}
