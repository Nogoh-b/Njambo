/* ═══════════════ lib/cryptoUtils.ts ═══════════════
   Utilitaires cryptographiques pour les identifiants uniques.
   Utilise l'API Web Crypto pour générer des playId imprévisibles
   et non réutilisables (anti-replay). */

/**
 * Génère un UUID v4 cryptographiquement sécurisé (32 hex chars).
 * Plus robuste que Date.now() qui a une précision de 1ms
 * et est prédictible.
 */
export function generateSecureId(length: number = 32): string {
  const bytes = new Uint8Array(Math.ceil(length / 2));
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, length);
}

/**
 * Génère un playId unique pour chaque coup joué.
 * Format: `<32-hex-uuid>-<uid>`
 * Le UUID est cryptographiquement aléatoire, donc impossible à deviner
 * ou rejouer (anti-replay).
 */
export function generatePlayId(uid: string): string {
  return `${generateSecureId(32)}-${uid}`;
}
