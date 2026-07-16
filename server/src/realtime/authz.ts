/* ═══════════════ FILE: server/src/realtime/authz.ts ═══════════════
   Portage des règles de LECTURE de firestore.rules pour le canal temps réel
   et les lectures one-shot. Chaque cible (doc ou query) est évaluée avant
   l'abonnement ; les collections à visibilité conditionnelle (published,
   participants) reçoivent un prédicat appliqué à chaque document.

   Toute cible non listée est refusée (équivalent du deny-all terminal). */

import type { DocumentData } from "../../../functions/src/firestoreTypes";
import type { SubscribeTarget } from "./protocol";

export interface AuthInfo {
  uid: string;
  admin: boolean;
}

export type AuthzDecision =
  | { kind: "allow" }
  | { kind: "deny" }
  /** Documents filtrés un par un (doc: bloque l'émission ; query: retire du résultat). */
  | { kind: "filter"; predicate: (data: DocumentData) => boolean };

/** La query contient-elle `where field == value` ? */
function hasEq(target: SubscribeTarget, field: string, value: unknown): boolean {
  return (target.where ?? []).some((clause) => clause.op === "==" && clause.field === field && clause.value === value);
}

/** La query contient-elle `where field array-contains value` ? */
function hasArrayContains(target: SubscribeTarget, field: string, value: unknown): boolean {
  return (target.where ?? []).some((clause) => clause.op === "array-contains" && clause.field === field && clause.value === value);
}

const PUBLISHED_COLLECTIONS = new Set([
  "catalog_items", "offers", "reward_tables", "booster_definitions", "events", "event_versions",
]);

const publishedOnly: AuthzDecision = { kind: "filter", predicate: (data) => data.published === true };

export function authorizeTarget(auth: AuthInfo, target: SubscribeTarget): AuthzDecision {
  const segments = target.path.split("/").filter((segment) => segment.length > 0);
  const isDoc = target.kind === "doc";
  if (segments.length === 0 || segments.length > 4) return { kind: "deny" };
  const [root, second, third, fourth] = segments;
  const owner = (uid: string | undefined) => uid === auth.uid || auth.admin;

  switch (root) {
    case "users": {
      // users/{uid} et toutes ses sous-collections : owner || admin.
      return owner(second) ? { kind: "allow" } : { kind: "deny" };
    }
    case "players":
    case "players_presence":
      return { kind: "allow" }; // signedIn (la connexion WS est déjà authentifiée)
    case "economies": {
      // economies/{uid} + economies/{uid}/ledger
      if (!owner(second)) return { kind: "deny" };
      if (segments.length === 2 || (segments.length === 3 && third === "ledger") || (segments.length === 4 && third === "ledger")) {
        return { kind: "allow" };
      }
      return { kind: "deny" };
    }
    case "inventories":
      return owner(second) ? { kind: "allow" } : { kind: "deny" };
    case "friendRequests": {
      if (isDoc) {
        return { kind: "filter", predicate: (data) => data.fromUid === auth.uid || data.toUid === auth.uid };
      }
      return hasEq(target, "fromUid", auth.uid) || hasEq(target, "toUid", auth.uid)
        ? { kind: "allow" }
        : { kind: "deny" };
    }
    case "conversations": {
      if (segments.length === 1 && !isDoc) {
        return hasArrayContains(target, "participants", auth.uid) ? { kind: "allow" } : { kind: "deny" };
      }
      if (segments.length === 2 && isDoc) {
        return { kind: "filter", predicate: (data) => Array.isArray(data.participants) && data.participants.includes(auth.uid) };
      }
      if (segments.length === 3 && third === "messages" && !isDoc) {
        // Vérification du participant faite au subscribe (lecture du doc parent) par le serveur.
        return { kind: "allow" };
      }
      return { kind: "deny" };
    }
    case "rooms": {
      if (segments.length <= 2) return { kind: "allow" }; // lecture des salles : signedIn
      if (segments.length === 3 && ["reactions", "game", "takeoverRequests"].includes(third)) {
        // roomParticipant vérifié au subscribe (lecture du doc parent) par le serveur.
        return { kind: "allow" };
      }
      return { kind: "deny" };
    }
    case "matches": {
      if (segments.length === 2 && isDoc) {
        return { kind: "filter", predicate: (data) => Array.isArray(data.participantUids) && data.participantUids.includes(auth.uid) };
      }
      if (segments.length === 4 && third === "private") {
        return owner(fourth) ? { kind: "allow" } : { kind: "deny" };
      }
      return { kind: "deny" };
    }
    case "event_runs": {
      if (isDoc) return { kind: "filter", predicate: (data) => data.uid === auth.uid || auth.admin };
      return hasEq(target, "uid", auth.uid) || auth.admin ? { kind: "allow" } : { kind: "deny" };
    }
    case "daily_rotations": {
      // daily_rotations/{day}/players/{uid}
      if (segments.length === 4 && third === "players") return owner(fourth) ? { kind: "allow" } : { kind: "deny" };
      return { kind: "deny" };
    }
    case "runtime_config":
      return { kind: "allow" };
    case "admin_drafts":
    case "admin_audit":
      return auth.admin ? { kind: "allow" } : { kind: "deny" };
    default:
      if (PUBLISHED_COLLECTIONS.has(root) && segments.length <= 2) return publishedOnly;
      return { kind: "deny" };
  }
}

/** Collections dont l'accès dépend du document PARENT (lu une fois au subscribe). */
export type ParentCheck = { path: string; predicate: (data: DocumentData) => boolean } | null;

export function parentCheckFor(auth: AuthInfo, target: SubscribeTarget): ParentCheck {
  const segments = target.path.split("/").filter((segment) => segment.length > 0);
  if (segments[0] === "conversations" && segments.length === 3 && segments[2] === "messages") {
    return {
      path: `conversations/${segments[1]}`,
      predicate: (data) => Array.isArray(data.participants) && data.participants.includes(auth.uid),
    };
  }
  if (segments[0] === "rooms" && segments.length === 3 && ["reactions", "game", "takeoverRequests"].includes(segments[2])) {
    return {
      path: `rooms/${segments[1]}`,
      predicate: (data) => Array.isArray(data.playerUids) && data.playerUids.includes(auth.uid),
    };
  }
  return null;
}
