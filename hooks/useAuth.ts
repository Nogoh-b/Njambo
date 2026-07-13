"use client";

/* ═══════════════ useAuth — ré-export ═══════════════
   L'implémentation vit dans contexts/AuthContext.tsx (Provider unique).
   Ce shim préserve les imports historiques `@/hooks/useAuth` :
   le hook lit désormais le contexte — plus AUCUNE cascade Firestore
   ni battement de présence par composant appelant. */

export { AuthProvider, useAuth } from "@/contexts/AuthContext";
