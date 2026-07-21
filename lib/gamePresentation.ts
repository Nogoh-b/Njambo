import type { Result, SyncStatus } from "@/types/game";

export interface NextRoundPresentation {
  label: string;
  status: string | null;
}

export interface SyncStatusPresentation {
  label: string;
  urgent: boolean;
}

/** Texte de résultat partagé par tous les modes, sans modifier le calcul du moteur. */
export function getResultReasonLabels(result: Result): string[] {
  if (result.type === "lastTrick") {
    return [
      "Dernier tour dominé",
      ...(result.doubles ? ["Dernière carte 3 · gain x2"] : []),
    ];
  }

  switch (result.reason) {
    case "flush":
      return ["Même couleur · victoire directe"];
    case "under21":
      return [`Donne sous 21 · ${result.total} points`];
    case "exact21":
      return ["21 exact · gain x2"];
  }
}

/** Libellés d'action identiques pour les parties bot, événement et réseau. */
export function getNextRoundPresentation(
  canNext: boolean,
  requiresConsensus: boolean,
  requested: boolean,
): NextRoundPresentation {
  if (!canNext) {
    return {
      label: requiresConsensus ? "Revanche indisponible" : "Manche indisponible",
      status: "Solde insuffisant pour rejoindre la prochaine manche.",
    };
  }

  if (requested) {
    return {
      label: requiresConsensus ? "Revanche demandée" : "Préparation…",
      status: requiresConsensus
        ? "Demande envoyée. En attente de la validation des autres joueurs."
        : "Préparation de la prochaine manche.",
    };
  }

  return {
    label: requiresConsensus ? "Demander une revanche" : "Manche suivante",
    status: requiresConsensus
      ? "La prochaine manche démarrera lorsque la table aura validé la revanche."
      : null,
  };
}

export function getSyncStatusPresentation(
  status: Pick<SyncStatus, "state" | "message">,
): SyncStatusPresentation | null {
  if (status.state === "live") return null;

  const fallback = status.state === "connecting"
    ? "Connexion…"
    : status.state === "slow"
      ? "Connexion lente…"
      : status.state === "offline"
        ? "Hors ligne"
        : "Synchronisation impossible";

  return {
    label: status.message ?? fallback,
    urgent: status.state === "offline" || status.state === "error",
  };
}

export function formatGameAnnouncement(title: string, detail?: string): string {
  if (!detail) return title;
  const separator = /[.!?…]$/.test(title.trim()) ? " " : ". ";
  return `${title}${separator}${detail}`;
}
