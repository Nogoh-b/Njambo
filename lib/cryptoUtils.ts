/* ═══════════════ lib/cryptoUtils.ts ═══════════════
   Utilitaires cryptographiques pour les identifiants uniques.
   Utilise l'API Web Crypto pour générer des playId imprévisibles
   et non réutilisables (anti-replay). */

/**
 * Polyfill de `crypto.randomUUID` pour les contextes HTTP non-HTTPS sur mobile
 * (ex. test en Wi-Fi sur `http://10.x.x.x:3001` où `window.isSecureContext`
 * vaut `false` et où les navigateurs mobiles masquent `crypto.randomUUID`
 * tout en exposant `crypto.getRandomValues`).
 */
export function ensureRandomUUIDPolyfill(): void {
  if (typeof globalThis.crypto !== "undefined" && typeof globalThis.crypto.randomUUID !== "function") {
    try {
      Object.defineProperty(globalThis.crypto, "randomUUID", {
        configurable: true,
        writable: true,
        value: (): `${string}-${string}-${string}-${string}-${string}` => {
          const bytes = new Uint8Array(16);
          globalThis.crypto.getRandomValues(bytes);
          bytes[6] = (bytes[6] & 0x0f) | 0x40;
          bytes[8] = (bytes[8] & 0x3f) | 0x80;
          const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
          return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
        },
      });
    } catch {
      // Ignore if crypto object is frozen
    }
  }
}

ensureRandomUUIDPolyfill();

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
