"use client";

import { useState, type ReactNode } from "react";
import { PlayCard } from "@/components/cards/PlayCard";
import { NjamboIcon, type NjamboIconName } from "@/components/ui/Art";
import { BottomNavScene } from "@/components/ui/BottomNavScene";
import { Btn } from "@/components/ui/Btn";
import { Chip } from "@/components/ui/Chip";
import { ScreenHeader, Surface } from "@/components/ui/Shell";
import { useGame } from "@/contexts/GameContext";
import { NKAP } from "@/data/mock";
import { getInstantWinRules } from "@/lib/gamePresentation";
import { AcademyChapters } from "@/components/academy/AcademyChapters";
import type { AcademyChapter } from "@/data/academy/course";

/* ═══════════════ RulesScreen — Académie : chapitres + Mémo express en 5 cartes (zéro scroll) ═══════════════ */

interface RuleStep {
  id: string;
  shortLabel: string;
  icon: NjamboIconName;
  tone: "gold" | "teal" | "pink" | "cobalt";
  title: string;
  badge?: string;
  render: () => ReactNode;
}

interface RulesScreenProps {
  /** Lance un chapitre de l'Académie sur la table. */
  onPlayChapter?: (chapter: AcademyChapter) => void;
}

export function RulesScreen({ onPlayChapter }: RulesScreenProps) {
  const { navigateTo, goBack, backLabelFor, cfg } = useGame();
  const [tab, setTab] = useState<"chapters" | "memo">("chapters");
  const [stepIndex, setStepIndex] = useState(0);
  const deckSize = (cfg.ranks.max - cfg.ranks.min + 1) * cfg.suits.length;
  const instantWins = getInstantWinRules(cfg);
  const powerLimit = cfg.maxEquippedPowers;

  const steps: RuleStep[] = [
    {
      id: "goal",
      shortLabel: "1. But",
      icon: "cards",
      tone: "gold",
      title: "Le but du jeu",
      badge: "5 tours",
      render: () => (
        <div style={{ display: "grid", gap: 12 }}>
          <p style={{ margin: 0 }}>
            Njambo se joue avec <b style={{ color: "#fffaf0" }}>{deckSize} cartes</b> (numérotées de{" "}
            <b style={{ color: "#fffaf0" }}>{cfg.ranks.min} à {cfg.ranks.max}</b>, sans figures ni As).
            Chaque joueur reçoit <b style={{ color: "#fffaf0" }}>{cfg.cardsPerPlayer} cartes</b> et mise au départ.
          </p>
          <div
            style={{
              padding: "12px 14px",
              borderRadius: 14,
              border: "1px solid rgba(255, 207, 64, 0.44)",
              background: "rgba(255, 207, 64, 0.14)",
              color: "#fff2be",
              fontWeight: 750,
            }}
          >
            Seul le gagnant du 5e et dernier tour remporte tout le pot ! Les 4 premiers tours servent à prendre et conserver la main.
          </div>
        </div>
      ),
    },
    {
      id: "suit",
      shortLabel: "2. Tendance",
      icon: "spark",
      tone: "teal",
      title: "Tendance & Défausse",
      badge: "Règle d'or",
      render: () => (
        <div style={{ display: "grid", gap: 12 }}>
          <p style={{ margin: 0 }}>
            Le 1er joueur pose une carte : sa couleur fixe la <b style={{ color: "#fffaf0" }}>tendance</b>.
            Les autres doivent jouer cette couleur s&apos;ils l&apos;ont, sinon ils se défaussent — mais <b style={{ color: "#fffaf0" }}>une défausse ne gagne jamais le pli</b>.
          </p>
          <div
            style={{
              padding: "12px 10px",
              borderRadius: 15,
              background: "rgba(8, 22, 18, 0.72)",
              border: "1px solid rgba(29, 228, 190, 0.34)",
              display: "flex",
              justifyContent: "space-around",
              alignItems: "flex-end",
              gap: 8,
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
              <PlayCard card={{ id: "ex-1", rank: "6", value: 6, suit: "♥", color: "#b81d2d" }} w={48} />
              <span style={{ fontSize: 11, fontWeight: 700, color: "#fff8ea" }}>1. Tendance ♥</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
              <PlayCard card={{ id: "ex-2", rank: "9", value: 9, suit: "♥", color: "#b81d2d" }} w={52} glow lift={4} />
              <span style={{ fontSize: 11, fontWeight: 900, color: "#fff0a8" }}>2. Domine (9♥)</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
              <PlayCard card={{ id: "ex-3", rank: "10", value: 10, suit: "♠", color: "#1c1f24" }} w={48} dim />
              <span style={{ fontSize: 11, opacity: 0.78 }}>3. Défausse</span>
            </div>
          </div>
        </div>
      ),
    },
    {
      id: "three",
      shortLabel: "3. Le 3 ×2",
      icon: "crown",
      tone: "gold",
      title: "Le 5e tour & le 3 bonus",
      badge: "Ngata ×2",
      render: () => (
        <div style={{ display: "grid", gap: 12 }}>
          <p style={{ margin: 0 }}>
            La plus forte carte de la tendance remporte le pli et lance le tour suivant.
            {cfg.lastCardThreeDoubles && (
              <>
                {" "}Si tu gagnes le <b style={{ color: "#fffaf0" }}>5e et dernier tour avec un 3</b>, tu réalises un coup de maître :{" "}
                <b style={{ color: "#fff0a8" }}>tes gains sont doublés (×2)</b> ! Un 3 boosté par un pouvoir ne double pas.
              </>
            )}
          </p>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "11px 12px",
              borderRadius: 14,
              background: "rgba(255, 207, 64, 0.14)",
              border: "1px solid rgba(255, 207, 64, 0.42)",
            }}
          >
            <PlayCard card={{ id: "ex-3bonus", rank: "3", value: 3, suit: "♠", color: "#1c1f24" }} w={46} glow />
            <div style={{ fontSize: 12.5, lineHeight: 1.4, color: "#f2e4c7" }}>
              <b style={{ color: "#fff0a8" }}>Astuce de pro :</b> gagne le 4e tour avec une grosse carte pour lancer le dernier. Ton <b>3</b>{" "}ne gagne que si personne ne peut suivre sa couleur : c&apos;est un pari !
            </div>
          </div>
        </div>
      ),
    },
    {
      id: "instant",
      shortLabel: "4. Victoires",
      icon: "trophy",
      tone: "pink",
      title: "Victoires instantanées",
      badge: "Dès la donne",
      render: () => (
        <div style={{ display: "grid", gap: 10 }}>
          {instantWins.length > 0 ? (
            <>
              <p style={{ margin: 0 }}>Avant même le 1er tour, ta main de {cfg.cardsPerPlayer} cartes gagne immédiatement le pot si :</p>
              <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 8 }}>
                {instantWins.map((rule) => (
                  <li key={rule.reason}>
                    {rule.reason === "under21" && <>Somme des {cfg.cardsPerPlayer} cartes <b style={{ color: "#fffaf0" }}>&lt; {cfg.instantWin.sumBelow}</b></>}
                    {rule.reason === "exact21" && <>Somme exacte <b style={{ color: "#fffaf0" }}>= {cfg.instantWin.sumExactDoubles}</b></>}
                    {rule.reason === "flush" && <b style={{ color: "#fffaf0" }}>Couleur ({cfg.cardsPerPlayer} cartes du même signe)</b>}
                    {" → victoire "}
                    {rule.doubles ? <b style={{ color: "#fff0a8" }}>doublée (×2)</b> : "immédiate"}.
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p style={{ margin: 0 }}>Pas de victoire immédiate à la donne : on joue toujours les {cfg.cardsPerPlayer} tours.</p>
          )}
        </div>
      ),
    },
    {
      id: "powers",
      shortLabel: "5. Pouvoirs",
      icon: "settings",
      tone: "cobalt",
      title: "Pouvoirs, rythme & mises",
      badge: `${cfg.turnSeconds}s / tour`,
      render: () => (
        <div style={{ display: "grid", gap: 12 }}>
          <p style={{ margin: 0 }}>
            {powerLimit > 0 && (
              <>
                Équipe jusqu&apos;à <b style={{ color: "#fffaf0" }}>{powerLimit} carte{powerLimit > 1 ? "s" : ""} Pouvoir</b>{" "}avant la partie, puis touche-les à table pour activer leur effet.
                Chacune ne sert qu&apos;<b style={{ color: "#fffaf0" }}>une fois par partie</b>.{" "}
              </>
            )}
            Tu disposes de <b style={{ color: "#fffaf0" }}>{cfg.turnSeconds}s</b> par tour.
          </p>
          <div style={{ display: "flex", gap: 7, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ fontSize: 12, fontWeight: 800, color: "#b0cdc2" }}>Mises :</span>
            {cfg.stakes.map((m) => (
              <Chip key={m} strong>{NKAP(m)}</Chip>
            ))}
          </div>
        </div>
      ),
    },
  ];

  const activeStep = steps[stepIndex];

  return (
    <BottomNavScene narrow dock={false} scroll={false}>
      <div className="nj-phone">
        <ScreenHeader
          title="Académie"
          kicker="Apprendre le Njambo"
          icon="cards"
          tone="gold"
          onBack={() => goBack("menu")}
          backLabel={backLabelFor("menu")}
        />

        <div role="tablist" aria-label="Académie" style={{ flex: "0 0 auto", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
          {([["chapters", "Chapitres"], ["memo", "Mémo express"]] as const).map(([id, label]) => (
            <Btn
              key={id}
              tone={id === "chapters" ? "gold" : "teal"}
              fill={tab === id ? "solid" : "soft"}
              size="sm"
              ariaPressed={tab === id}
              onClick={() => setTab(id)}
            >
              {label}
            </Btn>
          ))}
        </div>

        {tab === "chapters" ? (
          <AcademyChapters onPlay={onPlayChapter} />
        ) : (
        <>
        {/* Sélecteur rapide des 5 cartes de règles */}
        <nav
          aria-label="Étapes des règles"
          style={{
            flex: "0 0 auto",
            display: "grid",
            gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
            gap: 6,
          }}
        >
          {steps.map((step, index) => {
            const active = index === stepIndex;
            return (
              <Btn
                key={step.id}
                tone={step.tone}
                fill={active ? "solid" : "soft"}
                size="sm"
                ariaPressed={active}
                onClick={() => setStepIndex(index)}
                style={{ paddingInline: 4, fontSize: 11 }}
              >
                {step.shortLabel}
              </Btn>
            );
          })}
        </nav>

        {/* Carte de règle centrale (sans scroll) */}
        <Surface
          style={{
            flex: "1 1 auto",
            minHeight: 0,
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            gap: 14,
            overflow: "auto",
          }}
        >
          <div style={{ display: "grid", gap: 14 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span className="nj-title-icon" style={{ width: 42, height: 42, borderRadius: 13 }}>
                  <NjamboIcon name={activeStep.icon} tone={activeStep.tone} size={22} />
                </span>
                <div>
                  <div className="nj-kicker">Carte {stepIndex + 1} / {steps.length}</div>
                  <div style={{ fontFamily: "var(--font-display), sans-serif", fontWeight: 900, fontSize: 19, color: "#fffaf0" }}>
                    {activeStep.title}
                  </div>
                </div>
              </div>
              {activeStep.badge && (
                <Chip strong tone={activeStep.tone === "cobalt" ? undefined : activeStep.tone} style={{ fontSize: 11 }}>
                  {activeStep.badge}
                </Chip>
              )}
            </div>

            <div className="nj-subtle" style={{ fontSize: 13.5, lineHeight: 1.55 }}>
              {activeStep.render()}
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, paddingTop: 6 }}>
            <Btn
              tone="gold"
              fill="soft"
              size="sm"
              disabled={stepIndex === 0}
              onClick={() => setStepIndex((prev) => Math.max(0, prev - 1))}
            >
              ← Précédent
            </Btn>
            <Btn
              tone="gold"
              fill="soft"
              size="sm"
              disabled={stepIndex === steps.length - 1}
              onClick={() => setStepIndex((prev) => Math.min(steps.length - 1, prev + 1))}
            >
              Suivant →
            </Btn>
          </div>
        </Surface>

        {/* Actions fixes en bas */}
        <div style={{ flex: "0 0 auto", display: "flex", gap: 8 }}>
          <Btn
            tone="gold"
            fill="solid"
            size="md"
            onClick={() => navigateTo("bot_setup")}
            style={{ flex: 1 }}
          >
            Jouer contre l&apos;IA
          </Btn>
          <Btn
            tone="teal"
            fill="soft"
            size="md"
            onClick={() => navigateTo("power_collection")}
            style={{ flex: 1 }}
          >
            Cartes Pouvoir
          </Btn>
        </div>
        </>
        )}
      </div>
    </BottomNavScene>
  );
}
