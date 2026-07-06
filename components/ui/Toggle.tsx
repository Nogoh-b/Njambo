"use client";

import type { ReactNode } from "react";

interface ToggleProps {
  label: ReactNode;
  caption?: string;
  on: boolean;
  onChange: (v: boolean) => void;
}

export function Toggle({ label, caption, on, onChange }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className="nj-surface"
      style={{
        width: "100%",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 14,
        padding: "13px 14px",
        color: "inherit",
        cursor: "pointer",
        textAlign: "left",
      }}
    >
      <span>
        <span style={{ display: "block", fontWeight: 850 }}>{label}</span>
        {caption && <span className="nj-subtle">{caption}</span>}
      </span>
      <span className={`toggle${on ? " toggle-on" : ""}`}>
        <span className="toggle-knob" />
      </span>
    </button>
  );
}
