"use client";

import { useEffect, useState, type ComponentType } from "react";

const SPLASH_SESSION_KEY = "njambo-splash-seen";

function BootstrapSplash() {
  return (
    <main className="nj-shell nj-shell-splash" aria-label="Chargement de Njambo">
      <div className="nj-bootstrap-strip nj-bootstrap-strip-top" />
      <div className="nj-bootstrap-splash">
        <span className="nj-bootstrap-mark" aria-hidden="true" />
        <div className="nj-kicker" style={{ color: "#f3c969" }}>LE JEU DU QUARTIER</div>
        <h1>NJAMBO</h1>
        <p>Kamer table - cartes, bluff et mboko</p>
        <div className="nj-bootstrap-bar" />
      </div>
      <div className="nj-bootstrap-strip nj-bootstrap-strip-bottom" />
    </main>
  );
}

export default function AppBootstrap() {
  const [Runtime, setRuntime] = useState<ComponentType | null>(null);

  useEffect(() => {
    const seen = sessionStorage.getItem(SPLASH_SESSION_KEY) === "1";
    sessionStorage.setItem(SPLASH_SESSION_KEY, "1");
    const minimumSplash = new Promise<void>((resolve) => setTimeout(resolve, seen ? 0 : 700));
    const runtime = import("@/components/NjamboApp");
    let cancelled = false;
    void Promise.all([runtime, minimumSplash]).then(([module]) => {
      if (!cancelled) setRuntime(() => module.default);
    });
    return () => { cancelled = true; };
  }, []);

  return Runtime ? <Runtime /> : <BootstrapSplash />;
}
