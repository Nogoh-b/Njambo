"use client";

import type { ReactNode } from "react";
import { T } from "@/config/theme";
import { useGame } from "@/contexts/GameContext";
import { NKAP } from "@/data/mock";
import { NjamboIcon, type NjamboIconName } from "@/components/ui/Art";
import { BottomNavScene } from "@/components/ui/BottomNavScene";
import { Chip } from "@/components/ui/Chip";
import { ScreenHeader, Surface } from "@/components/ui/Shell";

/* ═══════════════ RulesScreen — « Comment jouer » ═══════════════
   Règles + mini-tutoriel du Njambo. Contenu factuel tiré de gameConfig
   (cartes, seuils de victoire instantanée, doublés…). Pure UI. */

function RuleCard({ icon, tone, title, children }: {
  icon: NjamboIconName;
  tone: "gold" | "teal" | "pink" | "cobalt";
  title: string;
  children: ReactNode;
}) {
  return (
    <Surface>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
        <span className="nj-title-icon" style={{ width: 38, height: 38, borderRadius: 12 }}>
          <NjamboIcon name={icon} tone={tone} size={20} />
        </span>
        <div style={{ fontWeight: 900, fontSize: 15 }}>{title}</div>
      </div>
      <div className="nj-subtle" style={{ fontSize: 13, lineHeight: 1.5 }}>{children}</div>
    </Surface>
  );
}

export function RulesScreen() {
  const { navigateTo, cfg } = useGame();
  const deckSize = (cfg.ranks.max - cfg.ranks.min + 1) * cfg.suits.length;

  return (
    <BottomNavScene narrow>
        <div className="nj-phone">
          <ScreenHeader
            title="Comment jouer"
            kicker="Règles du Njambo"
            icon="cards"
            tone="gold"
            onBack={() => navigateTo("menu")}
            backLabel="Retour"
          />

          <div className="nj-stack">
            <RuleCard icon="cards" tone="gold" title="But du jeu">
              Njambo se joue à {deckSize} cartes ({cfg.ranks.min} à {cfg.ranks.max}, sans figures
              ni As). Chaque joueur reçoit <b style={{ color: T.text }}>{cfg.cardsPerPlayer} cartes</b>.
              Tout le monde mise, et le vainqueur de la manche rafle le <b style={{ color: T.gold }}>pot</b>.
            </RuleCard>

            <RuleCard icon="spark" tone="teal" title="La tendance">
              Le premier joueur pose une carte : sa couleur devient la <b style={{ color: T.text }}>tendance</b>.
              Les autres <b style={{ color: T.text }}>doivent suivre</b> la couleur menée s&apos;ils en ont.
              Sinon, ils se défaussent d&apos;une autre carte (qui ne peut pas gagner le tour).
            </RuleCard>

            <RuleCard icon="crown" tone="gold" title="Dominer un tour">
              La <b style={{ color: T.text }}>plus forte carte de la tendance</b> remporte le tour.
              Celui qui domine relance le tour suivant. On enchaîne jusqu&apos;à épuisement des mains.
            </RuleCard>

            <RuleCard icon="trophy" tone="pink" title="Victoires instantanées">
              À la distribution, une main peut gagner tout de suite :
              <ul style={{ margin: "8px 0 0", paddingLeft: 18, display: "grid", gap: 4 }}>
                <li>Somme des cartes <b style={{ color: T.text }}>&lt; {cfg.instantWin.sumBelow}</b> → victoire immédiate.</li>
                <li>Somme <b style={{ color: T.text }}>= {cfg.instantWin.sumExactDoubles}</b> → victoire <b style={{ color: T.gold }}>doublée</b>.</li>
                {cfg.instantWin.flushWins && (
                  <li><b style={{ color: T.text }}>5 cartes d&apos;une même couleur</b> → victoire immédiate.</li>
                )}
              </ul>
            </RuleCard>

            {cfg.lastCardThreeDoubles && (
              <RuleCard icon="coin" tone="gold" title="Le 3 du dernier tour">
                Dominer le <b style={{ color: T.text }}>dernier tour avec un 3</b> double les gains :
                chaque adversaire paie une mise de plus au gagnant.
              </RuleCard>
            )}

            <RuleCard icon="settings" tone="cobalt" title="Rythme & mises">
              Tu as <b style={{ color: T.text }}>{cfg.turnSeconds}s</b> par tour ; au-delà, ta plus
              basse carte est jouée automatiquement. Mises disponibles :{" "}
              <span style={{ display: "inline-flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                {cfg.stakes.map((m) => (
                  <Chip key={m} strong>{NKAP(m)}</Chip>
                ))}
              </span>
            </RuleCard>
          </div>

        </div>
    </BottomNavScene>
  );
}
