"use client";

/* Bac à sable (éditeur de carte) : active la carte EN COURS D'ÉDITION, sans
   l'enregistrer, sur une mini-table locale reproductible avec le vrai moteur
   (validation, bouclier, interprétation, application). Montre ce qui change
   (mains, minuteurs, pot, effets) puis joue l'animation et le son sur la
   table de démonstration, avec les vraies cartes déplacées. */

import { useMemo, useRef, useState } from "react";
import { PlayCard } from "@/components/cards/PlayCard";
import { ChoreoDemoStage, demoV2MovesForCue, type ChoreoDemoHandle } from "@/components/power/choreo/ChoreoDemoStage";
import { getAnimV2 } from "@/engine/anim/v2/registry";
import { choreographyFromCues, type Choreography } from "@/engine/power/choreography";
import { createSandboxTable, runSandboxActivation, SANDBOX_NAMES, type SandboxOutcome } from "@/engine/power/sandbox";
import type { AnimCue, PowerModule, PowerScript } from "@/engine/power/types";
import { playPowerSound } from "@/lib/powerSounds";
import type { Card } from "@/types/game";
import styles from "./AdminConsole.module.css";

type EditedCard = Pick<PowerModule, "def" | "script">;

const needsTarget = (script: PowerScript) => (script.target.count === "one" || script.target.count === "many") && script.target.chooser !== "engine";

/** Chorégraphie de chaque étape (ou conversion de ses cues d'animation). */
export function stepChoreographies(script: PowerScript): Choreography[] {
  return script.steps
    .map((step) => step.choreo ?? (step.anim?.length ? choreographyFromCues(step.anim as never) : null))
    .filter((choreo): choreo is Choreography => Boolean(choreo && choreo.tracks.length));
}

function resolvedCards(outcome: SandboxOutcome | null): Partial<Record<string, Card[]>> {
  const out: Partial<Record<string, Card[]>> = {};
  for (const move of outcome?.resolved?.moves ?? []) {
    if (move.cardSnapshots?.length) out[`resolved:${move.key}`] = move.cardSnapshots;
  }
  const highlight = outcome?.resolved?.highlight;
  if (highlight) {
    const card = outcome?.before.state.players[highlight.seat]?.hand[highlight.cardIdx];
    if (card) out["resolved:highlight"] = [card];
  }
  return out;
}

function HandDiff({ before, after }: { before: Card[]; after: Card[] }) {
  const beforeIds = new Set(before.map((card) => card.id));
  const afterIds = new Set(after.map((card) => card.id));
  const changed = before.some((card) => !afterIds.has(card.id)) || after.some((card) => !beforeIds.has(card.id));
  const row = (cards: Card[], other: Set<string>, tone: string) => (
    <div style={{ display: "flex", gap: 3 }}>
      {cards.map((card) => (
        <div key={card.id} style={{ borderRadius: 5, outline: other.has(card.id) ? "none" : `2px solid ${tone}`, outlineOffset: 1 }}>
          <PlayCard card={card} w={26} />
        </div>
      ))}
    </div>
  );
  if (!changed) return row(before, new Set(before.map((card) => card.id)), "transparent");
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
      {row(before, afterIds, "#ff5b82")}
      <span aria-hidden="true">→</span>
      {row(after, beforeIds, "#5fe3a1")}
    </div>
  );
}

export function PowerSandbox({ card, hasIssues }: { card: EditedCard; hasIssues: boolean }) {
  const [seed, setSeed] = useState(1);
  const [target, setTarget] = useState(1);
  const [trickStarted, setTrickStarted] = useState(false);
  const [shield, setShield] = useState(false);
  const [outcome, setOutcome] = useState<SandboxOutcome | null>(null);
  const [crash, setCrash] = useState<string | null>(null);
  const stageRef = useRef<ChoreoDemoHandle>(null);
  const table = useMemo(() => createSandboxTable({ seed, trickStarted }), [seed, trickStarted]);
  const targeted = needsTarget(card.script);
  const targetOptions = SANDBOX_NAMES.map((name, seat) => ({ name, seat })).filter((entry) => entry.seat !== 0 || card.script.target.allowSelf);

  const animate = async (result: SandboxOutcome | null) => {
    if (card.def.sound?.ref) playPowerSound(card.def.sound.ref, card.def.sound.volume ?? 1);
    const cards = resolvedCards(result);
    // Animation V2 de la carte : ses vols de cartes passent par le lecteur V2, comme en jeu (étapes sans chorégraphie).
    const animV2 = card.def.animV2 ? getAnimV2(card.def.animV2) : null;
    if (!animV2) {
      for (const choreo of stepChoreographies(card.script)) await stageRef.current?.play(choreo, cards);
      return;
    }
    const pending = new Map<number, number>();
    for (const step of card.script.steps) {
      if (step.choreo) { if (step.choreo.tracks.length) await stageRef.current?.play(step.choreo, cards); continue; }
      // Dans l'ordre du script : les autres cues gardent leur mise en scène, les vols passent en V2.
      let others: AnimCue[] = [];
      const flushOthers = async () => {
        if (others.length) await stageRef.current?.play(choreographyFromCues(others as never), cards);
        others = [];
      };
      for (const cue of step.anim ?? []) {
        if (cue.cue !== "flyCards") { others.push(cue); continue; }
        await flushOthers();
        const ref = typeof cue.cards === "string" ? cue.cards : "";
        await stageRef.current?.playAnimV2Moves(animV2, demoV2MovesForCue(cue, cards[ref] ?? [], pending), false);
      }
      await flushOthers();
    }
    await new Promise((resolve) => setTimeout(resolve, 700));
    await stageRef.current?.playAnimV2Moves(animV2, [], true);
  };

  const activate = () => {
    setCrash(null);
    try {
      const result = runSandboxActivation(table, card.script, { requestedTarget: targeted ? target : undefined, targetShield: shield });
      setOutcome(result);
      if (!result.refusal && !result.blocked) void animate(result);
    } catch (cause) {
      setOutcome(null);
      setCrash(cause instanceof Error ? cause.message : String(cause));
    }
  };

  const status = crash ? { tone: "error", text: `Le moteur a échoué : ${crash}` }
    : !outcome ? null
      : outcome.refusal ? { tone: "error", text: `Refusée par le jeu : « ${outcome.refusal} »` }
        : outcome.blocked ? { tone: "error", text: "Contrée par le bouclier de la cible." }
          : !outcome.impact ? { tone: "error", text: "Aucun effet dans cette position : la carte ne serait pas consommée." }
            : { tone: "ok", text: `Effet appliqué (${outcome.plan.length} opération${outcome.plan.length > 1 ? "s" : ""}).` };

  const shown = outcome?.after ?? table;
  const before = outcome?.before ?? table;
  const addedEffects = outcome ? (outcome.after.state.activePowerEffects ?? []).slice((outcome.before.state.activePowerEffects ?? []).length) : [];

  return (
    <section className={styles.panel} data-power-sandbox>
      <p className={styles.hint} style={{ marginTop: 0 }}>
        La carte telle qu’elle est à l’écran (même non enregistrée) est jouée sur une table locale avec le vrai moteur du jeu.
        Rien n’est envoyé au serveur. Les étapes à choix prennent automatiquement les premières cartes admissibles.
      </p>
      {hasIssues && <div className={`${styles.notice} ${styles.error}`}>La carte a des erreurs de validation : le résultat peut différer du jeu une fois corrigée.</div>}
      <div className={styles.row} style={{ alignItems: "flex-end", gap: 10, flexWrap: "wrap" }}>
        <label className={styles.field} style={{ maxWidth: 120 }}>
          <span>Donne n°</span>
          <input type="number" min={1} value={seed} onChange={(e) => { setSeed(Math.max(1, Math.round(Number(e.target.value) || 1))); setOutcome(null); }} />
        </label>
        <button type="button" className={styles.btn} onClick={() => { setSeed((value) => value + 1); setOutcome(null); }}>Nouvelle donne</button>
        {targeted && (
          <label className={styles.field} style={{ maxWidth: 180 }}>
            <span>Cible</span>
            <select value={target} onChange={(e) => { setTarget(Number(e.target.value)); setOutcome(null); }}>
              {targetOptions.map((entry) => <option key={entry.seat} value={entry.seat}>{entry.name}</option>)}
            </select>
          </label>
        )}
        <label className={styles.check}><input type="checkbox" checked={trickStarted} onChange={(e) => { setTrickStarted(e.target.checked); setOutcome(null); }} />Pli entamé (couleur demandée)</label>
        {targeted && <label className={styles.check}><input type="checkbox" checked={shield} onChange={(e) => { setShield(e.target.checked); setOutcome(null); }} />Bouclier sur la cible</label>}
        <span className={styles.spacer} />
        <button type="button" className={`${styles.btn} ${styles.primary}`} onClick={activate}>▶ Activer la carte</button>
        <button type="button" className={styles.btn} disabled={!outcome?.impact} onClick={() => void animate(outcome)}>Rejouer l’animation</button>
      </div>

      {status && <div className={`${styles.notice} ${styles[status.tone]}`} data-sandbox-status={status.tone} style={{ marginTop: 10 }}>{status.text}</div>}
      {outcome && outcome.log.length > 0 && <ul className={styles.issues} data-sandbox-log>{outcome.log.map((line, index) => <li key={index}>{line}</li>)}</ul>}

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 12 }}>
        <div style={{ flex: "1 1 320px", minWidth: 0, display: "grid", gap: 8 }}>
          {shown.state.players.map((player, seat) => {
            const timerBefore = before.timers[seat];
            const timerAfter = shown.timers[seat];
            const frozen = shown.frozen[seat];
            const penalty = shown.pendingPenalty[seat];
            const restriction = shown.restrictions[seat];
            return (
              <div key={seat} style={{ display: "grid", gap: 4, padding: 8, borderRadius: 10, background: "rgba(255,255,255,.04)", border: seat === 0 ? "1px solid rgba(242,187,69,.5)" : "1px solid rgba(255,255,255,.08)" }}>
                <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap", fontSize: 13 }}>
                  <strong>{player.emoji} {player.name}{seat === 0 ? " (lance la carte)" : ""}{outcome?.targets.includes(seat) ? " · cible" : ""}</strong>
                  <span className={styles.hint}>⏱ {timerBefore} s{timerAfter !== timerBefore ? ` → ${timerAfter} s` : ""}{frozen ? ` · gelé ${frozen / 1000} s` : ""}{penalty ? ` · ${penalty > 0 ? "-" : "+"}${Math.abs(penalty)} s au prochain tour` : ""}</span>
                  {restriction && <span className={styles.hint}>· prochaine carte {restriction.mode === "forceSelector" ? "imposée" : "interdite"}</span>}
                  {shown.state.trickPlays.some((play) => play.playerIdx === seat) && <span className={styles.hint}>· a ouvert le pli</span>}
                </div>
                <HandDiff before={before.state.players[seat].hand} after={player.hand} />
              </div>
            );
          })}
          <div className={styles.hint}>
            Pot : {before.state.pot} Nkap{shown.state.pot !== before.state.pot ? ` → ${shown.state.pot} Nkap` : ""} · Pioche : {shown.deck.length} cartes
            {addedEffects.length > 0 && <> · Effets actifs ajoutés : {addedEffects.map((effect) => [effect.potBonus ? `pot +${effect.potBonus}` : "", effect.scoreMultiplier ? `pot ×${effect.scoreMultiplier}` : "", effect.valueBonus ? `carte +${effect.valueBonus}` : "", effect.blocks?.length ? `bouclier (${effect.blocks.join(", ")})` : "", effect.refundOnLoss ? `remboursement ${Math.round(effect.refundOnLoss * 100)} %` : "", effect.preventDoublePenalty ? "pas de double pénalité" : "", effect.suitOverride ? "couleur imposée" : ""].filter(Boolean).join(", ") || "effet").join(" ; ")}</>}
          </div>
        </div>
        <div style={{ flex: "0 0 auto" }}>
          <span className={styles.hint}>Animation et son</span>
          <div style={{ marginTop: 6 }}><ChoreoDemoStage ref={stageRef} choreo={null} tone={card.def.tone} width={260} /></div>
        </div>
      </div>
    </section>
  );
}
