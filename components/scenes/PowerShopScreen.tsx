"use client";

import { useState } from "react";
import { T } from "@/config/theme";
import { useGame } from "@/contexts/GameContext";
import { POWER_CARDS } from "@/config/powerCards";
import { FCFA } from "@/data/mock";
import { Btn } from "@/components/ui/Btn";
import { Chip } from "@/components/ui/Chip";
import { NjamboIcon, type NjamboIconName } from "@/components/ui/Art";
import { ScreenHeader, Shell, Surface } from "@/components/ui/Shell";
import { cardToneColor } from "@/components/scenes/PowerCollectionScreen";
import type { PowerCardId } from "@/types/game";

/* ═══════════════ PowerShopScreen — boutique de cartes pouvoir ═══════════════
   Achat des 6 cartes avec des cauris (monnaie premium) ou du FCFA.
   Opère sur le profil local (persisté en localStorage). */

export function PowerShopScreen() {
  const { navigateTo, profile, setProfile } = useGame();
  const cauris = profile.cauris ?? 0;
  const inventory = profile.powerInventory ?? {};
  const [flash, setFlash] = useState<{ id: PowerCardId; msg: string; ok: boolean } | null>(null);

  const buy = (id: PowerCardId, currency: "cauris" | "fcfa") => {
    const card = POWER_CARDS.find((c) => c.id === id);
    if (!card) return;
    const cost = currency === "cauris" ? card.costCauris : card.costFcfa;
    const funds = currency === "cauris" ? (profile.cauris ?? 0) : profile.balance;
    if (funds < cost) {
      setFlash({ id, msg: currency === "cauris" ? "Cauris insuffisants" : "FCFA insuffisants", ok: false });
      return;
    }
    setProfile((prev) => {
      const inv = { ...(prev.powerInventory ?? {}) };
      inv[id] = (inv[id] ?? 0) + 1;
      return {
        ...prev,
        cauris: currency === "cauris" ? (prev.cauris ?? 0) - cost : prev.cauris,
        balance: currency === "fcfa" ? prev.balance - cost : prev.balance,
        powerInventory: inv,
      };
    });
    setFlash({ id, msg: "Achetée ✓", ok: true });
  };

  return (
    <Shell>
      <div className="nj-safe">
        <div className="nj-phone">
          <ScreenHeader
            title="Boutique"
            kicker="Cartes pouvoir"
            icon="coin"
            tone="gold"
            onBack={() => navigateTo("power_collection")}
            backLabel="Collection"
            badge={
              <span style={{ display: "flex", gap: 6, flex: "0 0 auto" }}>
                <Chip tone="gold">{cauris} cauris</Chip>
              </span>
            }
          />

          <div className="nj-stack">
            <Surface style={{ flex: "0 0 auto" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                <div>
                  <div className="nj-subtle" style={{ fontSize: 12 }}>Ton solde</div>
                  <div style={{ fontWeight: 900 }}>{FCFA(profile.balance)}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div className="nj-subtle" style={{ fontSize: 12 }}>Cauris</div>
                  <div style={{ fontWeight: 900, color: T.gold }}>{cauris}</div>
                </div>
              </div>
            </Surface>

            <Surface className="nj-panel-pad-sm" scrollable style={{ flex: "1 1 auto", minHeight: 0 }}>
              <div style={{ display: "grid", gap: 10 }}>
                {POWER_CARDS.map((card) => {
                  const qty = inventory[card.id] ?? 0;
                  const canCauris = cauris >= card.costCauris;
                  const canFcfa = profile.balance >= card.costFcfa;
                  const showFlash = flash?.id === card.id;
                  return (
                    <div key={card.id} className="nj-list-card" style={{ alignItems: "flex-start" }}>
                      <span
                        style={{
                          flex: "0 0 auto",
                          width: 46,
                          height: 46,
                          borderRadius: 12,
                          background: `${cardToneColor(card.tone)}22`,
                          display: "grid",
                          placeItems: "center",
                        }}
                      >
                        <NjamboIcon name={card.icon as NjamboIconName} tone={card.tone} size={26} />
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          <span style={{ fontWeight: 900 }}>{card.name}</span>
                          {qty > 0 && <Chip tone="teal">×{qty}</Chip>}
                        </div>
                        <div className="nj-subtle" style={{ fontSize: 12, marginTop: 2 }}>{card.description}</div>
                        <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                          <Btn
                            variant="gold"
                            disabled={!canCauris}
                            onClick={() => buy(card.id, "cauris")}
                            style={{ minHeight: 32, fontSize: 12 }}
                          >
                            {card.costCauris} cauris
                          </Btn>
                          <Btn
                            variant="ghost"
                            disabled={!canFcfa}
                            onClick={() => buy(card.id, "fcfa")}
                            style={{ minHeight: 32, fontSize: 12 }}
                          >
                            {FCFA(card.costFcfa)}
                          </Btn>
                          {showFlash && (
                            <span style={{ alignSelf: "center", fontSize: 12, fontWeight: 800, color: flash.ok ? T.good : T.bad }}>
                              {flash.msg}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Surface>
          </div>
        </div>
      </div>
    </Shell>
  );
}
