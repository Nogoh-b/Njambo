"use client";

import { CEREMONIAL_STRIP, T } from "@/config/theme";
import type { ReactNode } from "react";

/* ═══════════════ Panel (bottom sheet iOS) ═══════════════
   Partagé par MenuScreen et les scènes secondaires. */

interface PanelProps {
  title: string;
  children: ReactNode;
  onClose: () => void;
}

export function Panel({ title, children, onClose }: PanelProps) {
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(8,4,22,.75)",
        zIndex: 100,
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 460,
          maxHeight: "78vh",
          overflow: "auto",
          background: T.night1,
          borderRadius: "22px 22px 0 0",
          padding: "16px 20px 28px",
          borderTop: "4px solid transparent",
          borderImage: `${CEREMONIAL_STRIP} 1`,
          animation: "slideUp .25s both",
        }}
      >
        {/* drag handle style iOS */}
        <div
          style={{
            width: 40,
            height: 4,
            borderRadius: 2,
            background: "rgba(255,255,255,.25)",
            margin: "0 auto 12px",
          }}
        />
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 12,
          }}
        >
          <h3 style={{ fontFamily: "var(--font-display), serif", fontSize: 24, color: T.gold, margin: 0 }}>
            {title}
          </h3>
          <button data-nj-skin="dark"
            onClick={onClose}
            className="panel-close"
            style={{ background: "none", border: "none", color: T.text, fontSize: 22, cursor: "pointer" }}
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
