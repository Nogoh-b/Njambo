"use client";

import { useGame } from "@/contexts/GameContext";
import { POWER_CARDS, MAX_EQUIPPED_POWERS } from "@/config/powerCards";
import { Btn } from "@/components/ui/Btn";
import { Chip } from "@/components/ui/Chip";
import { NjamboIcon } from "@/components/ui/Art";
import { PowerCardView } from "@/components/power/PowerCardView";
import { ScreenHeader, Shell, Surface } from "@/components/ui/Shell";
import type { PowerCardId } from "@/types/game";

/* ═══════════════ PowerCollectionScreen — inventaire & équipement ═══════════════
   Affiche les cartes pouvoir débloquées à vie, et permet
   d'équiper jusqu'à 2 cartes pour la prochaine partie. */

export function PowerCollectionScreen() {
  const { navigateTo, profile, setProfile } = useGame();
  const inventory = profile.powerInventory ?? {};
  const equipped = profile.equippedPowers ?? [];

  const toggleEquip = (id: PowerCardId) => {
    if ((inventory[id] ?? 0) <= 0) return;
    setProfile((prev) => {
      const cur = prev.equippedPowers ?? [];
      let next: PowerCardId[];
      if (cur.includes(id)) next = cur.filter((c) => c !== id);
      else if (cur.length >= MAX_EQUIPPED_POWERS) next = cur;
      else next = [...cur, id];
      return { ...prev, equippedPowers: next };
    });
  };

  return (
    <Shell>
      <div className="nj-safe">
        <div className="nj-phone">
          <ScreenHeader
            title="Cartes Pouvoir"
            kicker="Ta collection"
            icon="spark"
            tone="pink"
            onBack={() => navigateTo("menu")}
            badge={<Chip tone="gold">{equipped.length}/{MAX_EQUIPPED_POWERS}</Chip>}
          />

          <div className="nj-stack">
            <Surface style={{ flex: "0 0 auto" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 900 }}>Équipe jusqu&apos;à {MAX_EQUIPPED_POWERS} cartes</div>
                  <div className="nj-subtle" style={{ fontSize: 12 }}>Disponibles dans ta prochaine partie.</div>
                </div>
                <Btn
                  variant="gold"
                  onClick={() => navigateTo("power_shop")}
                  icon={<NjamboIcon name="coin" tone="gold" size={18} />}
                  style={{ flex: "0 0 auto" }}
                >
                  Boutique
                </Btn>
              </div>
            </Surface>

            <Surface className="nj-panel-pad-sm" scrollable style={{ flex: "1 1 auto", minHeight: 0 }}>
              <div style={{ display: "grid", gap: 10 }}>
                {POWER_CARDS.map((card) => {
                  const owned = (inventory[card.id] ?? 0) > 0;
                  const isEquipped = equipped.includes(card.id);
                  const full = !isEquipped && equipped.length >= MAX_EQUIPPED_POWERS;
                  return (
                    <div
                      key={card.id}
                      className={`nj-list-card${isEquipped ? " nj-list-card--pink is-active" : ""}`}
                      style={{ opacity: owned ? 1 : 0.5, alignItems: "flex-start" }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <PowerCardView card={card} qty={owned ? 1 : undefined} selected={isEquipped} disabled={!owned} />
                        <div className="nj-subtle" style={{ fontSize: 12, marginTop: 4 }}>
                          {owned ? "Possédée à vie" : "Non possédée"}
                        </div>
                      </div>
                      <Btn
                        variant={isEquipped ? "pink" : "ghost"}
                        disabled={!owned || full}
                        onClick={() => toggleEquip(card.id)}
                        style={{ flex: "0 0 auto", minHeight: 34, fontSize: 13 }}
                      >
                        {isEquipped ? "Équipée" : full ? "Plein" : "Équiper"}
                      </Btn>
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
