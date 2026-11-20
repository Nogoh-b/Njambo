/* ═══════════════ Annuaire des comptes (email ↔ uid) ═══════════════
   Utilisé par les commandes admin (recherche d'un joueur par email).
   Par défaut : Firebase Auth (déploiement Cloud Functions). Le serveur VPS
   injecte son annuaire Postgres via setAuthDirectory au démarrage, comme
   setDbBackend pour les données. */

import { getAuth } from "firebase-admin/auth";

export interface AuthDirectory {
  emailOf(uid: string): Promise<string | null>;
  findByEmail(email: string): Promise<{ uid: string; email: string | null } | null>;
}

const firebaseDirectory: AuthDirectory = {
  async emailOf(uid) {
    try { return (await getAuth().getUser(uid)).email ?? null; } catch { return null; }
  },
  async findByEmail(email) {
    try {
      const user = await getAuth().getUserByEmail(email);
      return { uid: user.uid, email: user.email ?? null };
    } catch {
      return null;
    }
  },
};

let directory: AuthDirectory = firebaseDirectory;
export function setAuthDirectory(instance: AuthDirectory) { directory = instance; }
export function authDirectory(): AuthDirectory { return directory; }
