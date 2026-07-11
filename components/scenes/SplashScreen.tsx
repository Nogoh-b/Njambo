"use client";

import { useEffect, useRef } from "react";
import { CEREMONIAL_STRIP, T } from "@/config/theme";
import { useGame } from "@/contexts/GameContext";
import { useGsapTimeline, useMotionProfile } from "@/lib/motion";
import { displayFont, Shell } from "@/components/ui/Shell";
import { NjamboMark } from "@/components/ui/Art";

export function SplashScreen() {
  const { navigateTo } = useGame();
  const motion = useMotionProfile();
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    /* Navigation : filet de sécurité indépendant de l'animation. */
    const timer = setTimeout(() => navigateTo("menu"), 2500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Timeline d'intro cinématique (GSAP) — gated par le toggle animations. */
  useGsapTimeline(motion.enabled, rootRef, (gsap) => {
    const tl = gsap.timeline({ defaults: { ease: "power3.out" } });
    tl.from(".nj-splash-logo", { scale: 0.72, opacity: 0, duration: 0.56 })
      .from(".nj-splash-kicker", { y: 16, opacity: 0, duration: 0.4 }, "-=0.25")
      .from(".nj-splash-title", { y: 22, opacity: 0, scale: 0.94, duration: 0.48 }, "-=0.18")
      .from(".nj-splash-tagline", { y: 12, opacity: 0, duration: 0.4 }, "-=0.3")
      .from(".nj-splash-bar", { scaleX: 0, opacity: 0, transformOrigin: "50% 50%", duration: 0.5 }, "-=0.2")
      .from(".nj-splash-dots > *", { scale: 0, opacity: 0, stagger: 0.08, duration: 0.35 }, "-=0.25");
  });

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
        ref={rootRef}
        className="nj-safe"
        style={{
          display: "grid",
          placeItems: "center",
          textAlign: "center",
        }}
      >
        <div>
          <div
            className="nj-splash-logo"
            style={{
              width: "clamp(132px, 34vw, 178px)",
              height: "clamp(132px, 34vw, 178px)",
              display: "grid",
              placeItems: "center",
              margin: "0 auto 18px",
              borderRadius: "50%",
              background: `radial-gradient(circle, ${T.gold}1f, transparent 65%)`,
              animation: motion.allowDecorativeLoop ? "glowPulse 2.4s ease-in-out infinite" : "none",
            }}
          >
            <NjamboMark size={150} />
          </div>
          <div className="nj-kicker nj-splash-kicker" style={{ color: T.gold }}>
            LE JEU DU QUARTIER
          </div>
          <h1
            className="nj-splash-title"
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
          <div className="nj-splash-tagline" style={{ marginTop: 12, color: "rgba(255,244,223,.72)", fontWeight: 800 }}>
            Kamer table - cartes, bluff et mboko
          </div>
          <div
            className="nj-splash-bar"
            style={{
              height: 7,
              width: "min(260px, 70vw)",
              margin: "22px auto 0",
              borderRadius: 999,
              background: CEREMONIAL_STRIP,
            }}
          />
          <div className="nj-splash-dots" style={{ marginTop: 38, display: "flex", justifyContent: "center", gap: 10 }}>
            {[T.gold, T.teal, T.pink, T.cobalt].map((color, i) => (
              <span
                key={color}
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  background: color,
                  animation: motion.allowDecorativeLoop ? `loaderDot 1s ${i * 0.14}s ease-in-out infinite` : "none",
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
