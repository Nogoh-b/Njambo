"use client";

import { useEffect, useState } from "react";

/* ═══════════════ FILE: hooks/useViewport.js ═══════════════ */
export interface Viewport {
  w: number;
  h: number;
  portrait: boolean;
}

function getViewport(): Viewport {
  if (typeof window === "undefined") return { w: 400, h: 800, portrait: true };
  const w = window.innerWidth;
  const h = window.innerHeight;
  return { w, h, portrait: h >= w };
}

export function useViewport(): Viewport {
  const [v, setV] = useState<Viewport>(getViewport);
  useEffect(() => {
    const on = () => setV(getViewport());
    window.addEventListener("resize", on);
    window.addEventListener("orientationchange", on);
    return () => {
      window.removeEventListener("resize", on);
      window.removeEventListener("orientationchange", on);
    };
  }, []);
  return v;
}
