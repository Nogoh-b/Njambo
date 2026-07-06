"use client";

import { useGame } from "@/contexts/GameContext";
import { NjamboIcon, NjamboMark } from "@/components/ui/Art";
import { ScreenHeader, Shell, Surface } from "@/components/ui/Shell";

export function HistoryScreen() {
  const { navigateTo } = useGame();

  return (
    <Shell>
      <div className="nj-safe">
        <div className="nj-phone">
          <ScreenHeader title="Historique" kicker="Dernières parties" icon="history" tone="pink" onBack={() => navigateTo("menu")} backLabel="Retour" />
          <Surface
            style={{
              minHeight: 360,
              display: "grid",
              placeItems: "center",
              textAlign: "center",
            }}
          >
            <div>
              <div style={{ display: "grid", placeItems: "center", marginBottom: 16 }}>
                <span style={{ position: "relative", display: "grid", placeItems: "center" }}>
                  <NjamboMark size={104} compact />
                  <span className="nj-title-icon" style={{ position: "absolute", right: -8, bottom: -8, width: 44, height: 44 }}>
                    <NjamboIcon name="empty" tone="pink" size={26} />
                  </span>
                </span>
              </div>
              <div style={{ fontWeight: 900, fontSize: 20, marginBottom: 6 }}>Aucune partie jouée</div>
              <p className="nj-subtle" style={{ maxWidth: 300 }}>
                Lance une première manche, et tes coups propres viendront se ranger ici.
              </p>
            </div>
          </Surface>
        </div>
      </div>
    </Shell>
  );
}
