/* Ouvre la boutique directement sur un onglet (ex. « Rituel quotidien » →
   Roulette). Marqueur ponctuel en sessionStorage, lu puis effacé à l'ouverture. */

export type ShopDeepTab = "offers" | "boosters" | "grid" | "wheel";

const KEY = "njambo:shop-tab";

export function requestShopTab(tab: ShopDeepTab): void {
  try { sessionStorage.setItem(KEY, tab); } catch { /* stockage indisponible */ }
}

export function consumeShopTab(): ShopDeepTab | null {
  try {
    const value = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
    return value === "offers" || value === "boosters" || value === "grid" || value === "wheel" ? value : null;
  } catch {
    return null;
  }
}
