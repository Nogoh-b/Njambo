"use client";

import { useEffect } from "react";
import { CEREMONIAL_STRIP, T } from "@/config/theme";
import { useGame } from "@/contexts/GameContext";
import { displayFont, Shell } from "@/components/ui/Shell";
import { NjamboMark } from "@/components/ui/Art";

export function SplashScreen() {
  const { navigateTo } = useGame();

  useEffect(() => {
    const timer = setTimeout(() => navigateTo("menu"), 2500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Shell className="nj-shell-splash">
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          height: 10,
          background: CEREMONIAL_STRIP,
          opacity: 0.8,
          zIndex: 2,
        }}
      />
      <div
        className="nj-safe"
        style={{
          display: "grid",
          placeItems: "center",
          textAlign: "center",
        }}
      >
        <div style={{ animation: "riseIn .65s ease both" }}>
          <div
            style={{
              width: "clamp(132px, 34vw, 178px)",
              height: "clamp(132px, 34vw, 178px)",
              display: "grid",
              placeItems: "center",
              margin: "0 auto 18px",
              borderRadius: "50%",
              background: `radial-gradient(circle, ${T.gold}1f, transparent 65%)`,
              animation: "glowPulse 2.4s ease-in-out infinite",
            }}
          >
            <NjamboMark size={150} />
          </div>
          <div className="nj-kicker" style={{ color: T.gold }}>
            LE JEU DU QUARTIER
          </div>
          <h1
            style={{
              ...displayFont,
              marginTop: 6,
              fontSize: "clamp(54px, 16vw, 92px)",
              fontWeight: 900,
              lineHeight: 0.88,
            }}
          >
            NJAMBO
          </h1>
          <div style={{ marginTop: 12, color: "rgba(255,244,223,.72)", fontWeight: 800 }}>
            Kamer table - cartes, bluff et mboko
          </div>
          <div
            style={{
              height: 7,
              width: "min(260px, 70vw)",
              margin: "22px auto 0",
              borderRadius: 999,
              background: CEREMONIAL_STRIP,
            }}
          />
          <div style={{ marginTop: 38, display: "flex", justifyContent: "center", gap: 10 }}>
            {[T.gold, T.teal, T.pink, T.cobalt].map((color, i) => (
              <span
                key={color}
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  background: color,
                  animation: `loaderDot 1s ${i * 0.14}s ease-in-out infinite`,
                }}
              />
            ))}
          </div>
        </div>
      </div>
      <div
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          height: 10,
          background: CEREMONIAL_STRIP,
          opacity: 0.8,
          zIndex: 2,
        }}
      />
    </Shell>
  );
}
