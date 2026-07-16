/* ═══════════════ FILE: server/src/firestoreCompat/bus.ts ═══════════════
   Bus d'événements post-commit de la façade Postgres. Chaque écriture commitée
   publie {path, parent, data|null}. Consommateurs : onSnapshot (doc + query)
   de la façade, donc aussi le serveur temps réel WebSocket et jobs.ts. */

import type { DocumentData } from "../../../functions/src/firestoreTypes";

export interface ChangeEvent {
  path: string;
  parent: string;
  /** null = document supprimé */
  data: DocumentData | null;
}

type Listener = (event: ChangeEvent) => void;

export class ChangeBus {
  private listeners = new Set<Listener>();

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  publishAll(events: ChangeEvent[]) {
    for (const event of events) {
      for (const listener of this.listeners) {
        try { listener(event); } catch (error) { console.error("ChangeBus listener error", error); }
      }
    }
  }
}
