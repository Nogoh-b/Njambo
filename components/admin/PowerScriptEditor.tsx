"use client";

/* Éditeur du script d'une carte pouvoir : étapes, choix par clic, briques
   (effets moteur) et animations. Formulaires générés selon le type de brique ;
   les erreurs viennent de validatePowerCard (chemins `script.steps.N…`). */

import type { ReactNode } from "react";
import type { AnimCue, CardSelector, ChoiceRequest, PlayerRef, PowerOp, PowerScript, PowerStep, ZoneRef } from "@/engine/power/types";
import { CONDITION_KINDS, CUE_KINDS, FX_PRESETS, OP_KINDS, PLAYER_REFS, POWER_TONES, SELECTOR_KINDS, SHIELD_TAGS, TARGET_COUNTS } from "@/engine/power/validate";
import {
  CONDITION_LABELS, CUE_LABELS, FX_PRESET_LABELS, OP_LABELS, PLAYER_LABELS, SELECTOR_LABELS, SHIELD_LABELS,
  TARGET_COUNT_LABELS, TONE_LABELS, ZONE_LABELS, defaultCue, defaultOp,
} from "./powerLabels";
import styles from "./AdminConsole.module.css";

type ErrorFor = (path: string) => string | undefined;
const int = (value: string) => Math.round(Number(value) || 0);

function Field({ label, error, children, hint }: { label: string; error?: string; children: ReactNode; hint?: string }) {
  return (
    <label className={`${styles.field} ${error ? styles.invalid : ""}`}>
      <span>{label}</span>
      {children}
      {error ? <span className={styles.fieldError}>{error}</span> : hint ? <span className={styles.hint}>{hint}</span> : null}
    </label>
  );
}

function PlayerField({ label = "Joueur", value, onChange, error }: { label?: string; value: PlayerRef; onChange: (value: PlayerRef) => void; error?: string }) {
  return (
    <Field label={label} error={error}>
      <select value={value} onChange={(e) => onChange(e.target.value as PlayerRef)}>
        {PLAYER_REFS.map((ref) => <option key={ref} value={ref}>{PLAYER_LABELS[ref]}</option>)}
      </select>
    </Field>
  );
}

function DurationField({ label = "Durée (s)", value, onChange, error }: { label?: string; value: number | undefined; onChange: (ms: number) => void; error?: string }) {
  return (
    <Field label={label} error={error}>
      <input type="number" min={0} max={15} step={0.5} value={(value ?? 0) / 1000} onChange={(e) => onChange(Math.round(Number(e.target.value) * 1000))} />
    </Field>
  );
}

function ZoneField({ label, value, onChange, errorFor, path }: { label: string; value: ZoneRef; onChange: (zone: ZoneRef) => void; errorFor: ErrorFor; path: string }) {
  const withPlayer = value.zone === "hand" || value.zone === "deposit";
  return (
    <div className={styles.row} style={{ alignItems: "end" }}>
      <Field label={label} error={errorFor(path)}>
        <select value={value.zone} onChange={(e) => {
          const zone = e.target.value as ZoneRef["zone"];
          onChange(zone === "hand" || zone === "deposit" ? { zone, player: withPlayer ? (value as { player: PlayerRef }).player : "self" } : { zone });
        }}>
          {Object.entries(ZONE_LABELS).map(([zone, label]) => <option key={zone} value={zone}>{label}</option>)}
        </select>
      </Field>
      {withPlayer && <PlayerField label="de" value={(value as { player: PlayerRef }).player} error={errorFor(`${path}.player`)} onChange={(player) => onChange({ zone: value.zone as "hand" | "deposit", player })} />}
    </div>
  );
}

function SelectorField({ label = "Quelles cartes", value, onChange, errorFor, path, choiceIds }: {
  label?: string; value: CardSelector; onChange: (selector: CardSelector) => void; errorFor: ErrorFor; path: string; choiceIds: string[];
}) {
  const set = (kind: CardSelector["kind"]): CardSelector => {
    switch (kind) {
      case "bySuit": return { kind, suit: "led" };
      case "byValue": return { kind, min: 1, max: 7 };
      case "byId": return { kind, cardId: "" };
      case "chosen": return { kind, choiceId: choiceIds[0] ?? "choix" };
      default: return { kind } as CardSelector;
    }
  };
  return (
    <div className={styles.row} style={{ alignItems: "end" }}>
      <Field label={label} error={errorFor(path)}>
        <select value={value.kind} onChange={(e) => onChange(set(e.target.value as CardSelector["kind"]))}>
          {SELECTOR_KINDS.map((kind) => <option key={kind} value={kind}>{SELECTOR_LABELS[kind]}</option>)}
        </select>
      </Field>
      {value.kind === "bySuit" && (
        <Field label="Couleur" error={errorFor(`${path}.suit`)}>
          <select value={value.suit} onChange={(e) => onChange({ kind: "bySuit", suit: e.target.value })}>
            <option value="led">Celle du pli</option><option value="♠">♠ Pique</option><option value="♥">♥ Cœur</option><option value="♦">♦ Carreau</option><option value="♣">♣ Trèfle</option>
          </select>
        </Field>
      )}
      {value.kind === "byValue" && (
        <>
          <Field label="Valeur min" error={errorFor(`${path}.min`)}><input type="number" min={1} max={30} value={value.min ?? ""} onChange={(e) => onChange({ ...value, min: e.target.value ? int(e.target.value) : undefined })} /></Field>
          <Field label="Valeur max" error={errorFor(`${path}.max`)}><input type="number" min={1} max={30} value={value.max ?? ""} onChange={(e) => onChange({ ...value, max: e.target.value ? int(e.target.value) : undefined })} /></Field>
        </>
      )}
      {value.kind === "chosen" && (
        <Field label="Choix" error={errorFor(`${path}.choiceId`)} hint={choiceIds.length ? undefined : "Ajoutez d'abord un « clic du joueur » à une étape."}>
          <select value={value.choiceId} onChange={(e) => onChange({ kind: "chosen", choiceId: e.target.value })}>
            {[...new Set([value.choiceId, ...choiceIds])].map((id) => <option key={id} value={id}>{id}</option>)}
          </select>
        </Field>
      )}
    </div>
  );
}

function ChoiceField({ value, onChange, errorFor, path, choiceIds }: { value: ChoiceRequest; onChange: (choice: ChoiceRequest) => void; errorFor: ErrorFor; path: string; choiceIds: string[] }) {
  return (
    <div className={styles.grid3}>
      <Field label="Nom du choix" error={errorFor(`${path}.id`)} hint="Réutilisé par « Choisie par clic »."><input value={value.id} maxLength={24} onChange={(e) => onChange({ ...value, id: e.target.value.replace(/[^a-z0-9_]/gi, "_") })} /></Field>
      <Field label="Où le joueur clique" error={errorFor(`${path}.surface`)}>
        <select value={value.surface} onChange={(e) => onChange({ ...value, surface: e.target.value as ChoiceRequest["surface"] })}>
          <option value="hand-self">Dans sa main</option><option value="reveal">Dans une main révélée</option><option value="deposit">Dans un dépôt</option>
        </select>
      </Field>
      {value.surface !== "hand-self" && <PlayerField label="De quel joueur" value={value.player ?? "target"} error={errorFor(`${path}.player`)} onChange={(player) => onChange({ ...value, player })} />}
      <Field label="Sans clic à temps" error={errorFor(`${path}.onTimeout`)}>
        <select value={value.onTimeout} onChange={(e) => onChange({ ...value, onTimeout: e.target.value as ChoiceRequest["onTimeout"] })}>
          <option value="cancel">Annuler la carte</option><option value="auto">Le jeu choisit</option>
        </select>
      </Field>
      <Field label="Délai pour cliquer (s)" error={errorFor(`${path}.timeoutMs`)}><input type="number" min={1} max={30} value={(value.timeoutMs ?? 10_000) / 1000} onChange={(e) => onChange({ ...value, timeoutMs: Math.round(Number(e.target.value) * 1000) })} /></Field>
      <div className={styles.full}>
        <span className={styles.hint}>Cartes cliquables</span>
        <SelectorField label="Filtre" value={value.filter ?? { kind: "all" }} errorFor={errorFor} path={`${path}.filter`} choiceIds={choiceIds} onChange={(filter) => onChange({ ...value, filter })} />
      </div>
    </div>
  );
}

function OpEditor({ op, onChange, errorFor, path, choiceIds }: { op: PowerOp; onChange: (op: PowerOp) => void; errorFor: ErrorFor; path: string; choiceIds: string[] }) {
  const e = (key: string) => errorFor(`${path}.${key}`);
  const sel = (key: string, value: CardSelector, label?: string) => <SelectorField label={label} value={value} errorFor={errorFor} path={`${path}.${key}`} choiceIds={choiceIds} onChange={(next) => onChange({ ...op, [key]: next } as PowerOp)} />;
  switch (op.op) {
    case "moveCards":
      return (
        <div className={styles.grid2}>
          <ZoneField label="Depuis" value={op.from} errorFor={errorFor} path={`${path}.from`} onChange={(from) => onChange({ ...op, from })} />
          <ZoneField label="Vers" value={op.to} errorFor={errorFor} path={`${path}.to`} onChange={(to) => onChange({ ...op, to })} />
          <div className={styles.full}>{sel("select", op.select)}</div>
          <label className={styles.check}><input type="checkbox" checked={Boolean(op.swap)} onChange={(ev) => onChange({ ...op, swap: ev.target.checked ? { incoming: { kind: "topOfDeck" } } : undefined })} />Échange : une carte revient en sens inverse</label>
          {op.swap && <div className={styles.full}><SelectorField label="Carte qui revient" value={op.swap.incoming} errorFor={errorFor} path={`${path}.swap.incoming`} choiceIds={choiceIds} onChange={(incoming) => onChange({ ...op, swap: { incoming } })} /></div>}
        </div>
      );
    case "exchangeCards":
      return (
        <div className={styles.grid2}>
          <PlayerField label="Joueur A" value={op.left} error={e("left")} onChange={(left) => onChange({ ...op, left })} />
          <PlayerField label="Joueur B" value={op.right} error={e("right")} onChange={(right) => onChange({ ...op, right })} />
          {sel("leftSelect", op.leftSelect, "Cartes de A")}
          {sel("rightSelect", op.rightSelect, "Cartes de B")}
        </div>
      );
    case "highlightCard":
      return <div className={styles.grid3}><PlayerField value={op.player} error={e("player")} onChange={(player) => onChange({ ...op, player })} /><DurationField value={op.durationMs} error={e("durationMs")} onChange={(durationMs) => onChange({ ...op, durationMs })} /><div className={styles.full}>{sel("select", op.select)}</div></div>;
    case "revealHand":
      return <div className={styles.grid3}><PlayerField label="Main de" value={op.player} error={e("player")} onChange={(player) => onChange({ ...op, player })} /><DurationField value={op.durationMs} error={e("durationMs")} onChange={(durationMs) => onChange({ ...op, durationMs })} /></div>;
    case "blockNextLegalCard":
      return <div className={styles.grid3}><PlayerField value={op.player} error={e("player")} onChange={(player) => onChange({ ...op, player })} /><Field label="Alternatives minimales" error={e("minLegalChoices")}><input type="number" min={1} max={5} value={op.minLegalChoices ?? 1} onChange={(ev) => onChange({ ...op, minLegalChoices: int(ev.target.value) })} /></Field><div className={styles.full}>{sel("select", op.select)}</div></div>;
    case "restrictNextPlay":
      return (
        <div className={styles.grid3}>
          <PlayerField value={op.player} error={e("player")} onChange={(player) => onChange({ ...op, player })} />
          <Field label="Mode" error={e("mode")}><select value={op.mode} onChange={(ev) => onChange({ ...op, mode: ev.target.value as typeof op.mode })}><option value="lockSelector">Interdire ces cartes</option><option value="forceSelector">Imposer ces cartes</option></select></Field>
          <div className={styles.full}>{sel("select", op.select)}</div>
        </div>
      );
    case "timerFreeze":
      return <div className={styles.grid3}><PlayerField value={op.player} error={e("player")} onChange={(player) => onChange({ ...op, player })} /><DurationField label="Gel (s)" value={op.durationMs} error={e("durationMs")} onChange={(durationMs) => onChange({ ...op, durationMs })} /></div>;
    case "timerDelta":
      return <div className={styles.grid3}><PlayerField value={op.player} error={e("player")} onChange={(player) => onChange({ ...op, player })} /><Field label="Secondes (+ ou −)" error={e("seconds")}><input type="number" min={-30} max={30} value={op.seconds} onChange={(ev) => onChange({ ...op, seconds: int(ev.target.value) })} /></Field></div>;
    case "boostNextCard":
      return (
        <div className={styles.grid3}>
          <PlayerField value={op.player} error={e("player")} onChange={(player) => onChange({ ...op, player })} />
          <Field label="Bonus de valeur" error={e("valueBonus")}><input type="number" min={0} max={10} value={op.valueBonus ?? 0} onChange={(ev) => onChange({ ...op, valueBonus: int(ev.target.value) || undefined })} /></Field>
          <label className={styles.check}><input type="checkbox" checked={op.suitOverride === "led"} onChange={(ev) => onChange({ ...op, suitOverride: ev.target.checked ? "led" : undefined })} />Prend la couleur du pli</label>
          {e("") && <span className={styles.fieldError}>{errorFor(path)}</span>}
        </div>
      );
    case "potBonus":
      return <div className={styles.grid3}><Field label="Nkap ajoutés" error={e("amount")}><input type="number" min={1} value={op.amount} onChange={(ev) => onChange({ ...op, amount: int(ev.target.value) })} /></Field><Field label="Quand" error={e("when")}><select value={op.when} onChange={(ev) => onChange({ ...op, when: ev.target.value as typeof op.when })}><option value="now">Tout de suite</option><option value="winTrick">Si le pli est gagné</option></select></Field></div>;
    case "potMultiplier":
      return <div className={styles.grid3}><Field label="Multiplicateur" error={e("factor")}><input type="number" min={1.1} max={5} step={0.1} value={op.factor} onChange={(ev) => onChange({ ...op, factor: Number(ev.target.value) })} /></Field><span className={styles.hint}>Appliqué si le pli est gagné.</span></div>;
    case "refundOnLoss":
      return <div className={styles.grid3}><PlayerField value={op.player} error={e("player")} onChange={(player) => onChange({ ...op, player })} /><Field label="Part remboursée (%)" error={e("ratio")}><input type="number" min={5} max={100} value={Math.round(op.ratio * 100)} onChange={(ev) => onChange({ ...op, ratio: int(ev.target.value) / 100 })} /></Field></div>;
    case "preventDoublePenalty":
      return <div className={styles.grid3}><PlayerField value={op.player} error={e("player")} onChange={(player) => onChange({ ...op, player })} /></div>;
    case "grantShield":
      return (
        <div className={styles.grid2}>
          <PlayerField label="Protège" value={op.player} error={e("player")} onChange={(player) => onChange({ ...op, player })} />
          <Field label="Bloque" error={e("blocks")}>
            <div className={styles.row}>
              {SHIELD_TAGS.map((tag) => (
                <label key={tag} className={styles.check}><input type="checkbox" checked={op.blocks.includes(tag)} onChange={(ev) => onChange({ ...op, blocks: ev.target.checked ? [...op.blocks, tag] : op.blocks.filter((item) => item !== tag) })} />{SHIELD_LABELS[tag]}</label>
              ))}
            </div>
          </Field>
        </div>
      );
  }
}

function CueEditor({ cue, onChange, errorFor, path, choiceIds }: { cue: AnimCue; onChange: (cue: AnimCue) => void; errorFor: ErrorFor; path: string; choiceIds: string[] }) {
  const e = (key: string) => errorFor(`${path}.${key}`);
  const fx = (
    <div className={styles.grid3} style={{ marginTop: 8 }}>
      <Field label="Effet visuel" error={e("fx.preset")}>
        <select value={cue.fx?.preset ?? ""} onChange={(ev) => onChange({ ...cue, fx: { ...cue.fx, preset: (ev.target.value || undefined) as never } })}>
          <option value="">Automatique</option>
          {FX_PRESETS.map((preset) => <option key={preset} value={preset}>{FX_PRESET_LABELS[preset]}</option>)}
        </select>
      </Field>
      <Field label="Teinte" error={e("fx.tone")}>
        <select value={cue.fx?.tone ?? ""} onChange={(ev) => onChange({ ...cue, fx: { ...cue.fx, tone: (ev.target.value || undefined) as never } })}>
          <option value="">Automatique</option>
          {POWER_TONES.map((tone) => <option key={tone} value={tone}>{TONE_LABELS[tone]}</option>)}
        </select>
      </Field>
      <Field label="Intensité" error={e("fx.intensity")}>
        <select value={cue.fx?.intensity ?? ""} onChange={(ev) => onChange({ ...cue, fx: { ...cue.fx, intensity: (ev.target.value || undefined) as never } })}>
          <option value="">Normale</option><option value="subtle">Discrète</option><option value="standard">Standard</option><option value="spectacular">Spectaculaire</option>
        </select>
      </Field>
      <DurationField label="Pause après (s)" value={cue.afterMs} error={e("afterMs")} onChange={(afterMs) => onChange({ ...cue, afterMs })} />
    </div>
  );
  let body: ReactNode = null;
  switch (cue.cue) {
    case "flyCards":
      body = (
        <div className={styles.grid2}>
          <ZoneField label="Départ" value={cue.from} errorFor={errorFor} path={`${path}.from`} onChange={(from) => onChange({ ...cue, from })} />
          <ZoneField label="Arrivée" value={cue.to} errorFor={errorFor} path={`${path}.to`} onChange={(to) => onChange({ ...cue, to })} />
          <Field label="Cartes animées" error={e("cards")} hint="Calculées par une brique de l'étape (sortantes / entrantes / mise en valeur).">
            <select value={typeof cue.cards === "string" ? cue.cards : "resolved:outgoing"} onChange={(ev) => onChange({ ...cue, cards: ev.target.value as `resolved:${string}` })}>
              <option value="resolved:outgoing">Cartes qui partent</option><option value="resolved:incoming">Cartes qui arrivent</option><option value="resolved:highlight">Carte mise en valeur</option>
            </select>
          </Field>
          <Field label="Nature" error={e("mode")}><select value={cue.mode} onChange={(ev) => onChange({ ...cue, mode: ev.target.value as typeof cue.mode })}><option value="move">Accompagne un vrai déplacement</option><option value="display">Purement visuel</option></select></Field>
          <label className={styles.check}><input type="checkbox" checked={Boolean(cue.hidden)} onChange={(ev) => onChange({ ...cue, hidden: ev.target.checked })} />Cartes face cachée pendant le vol</label>
        </div>
      );
      break;
    case "revealOverlay":
      body = <div className={styles.grid3}><PlayerField label="Main de" value={cue.player} error={e("player")} onChange={(player) => onChange({ ...cue, player })} /><DurationField value={cue.durationMs} error={e("durationMs")} onChange={(durationMs) => onChange({ ...cue, durationMs })} /></div>;
      break;
    case "highlightHandCard":
      body = (
        <div className={styles.grid3}>
          <PlayerField value={cue.player} error={e("player")} onChange={(player) => onChange({ ...cue, player })} />
          <Field label="Style" error={e("style")}><select value={cue.style} onChange={(ev) => onChange({ ...cue, style: ev.target.value as typeof cue.style })}><option value="recommend">Conseillée</option><option value="swapped">Échangée</option><option value="locked">Verrouillée</option><option value="boosted">Renforcée</option></select></Field>
          <DurationField value={cue.durationMs} error={e("durationMs")} onChange={(durationMs) => onChange({ ...cue, durationMs })} />
        </div>
      );
      break;
    case "timerFx":
      body = (
        <div className={styles.grid3}>
          <PlayerField value={cue.player} error={e("player")} onChange={(player) => onChange({ ...cue, player })} />
          <Field label="Effet" error={e("kind")}><select value={cue.kind} onChange={(ev) => onChange({ ...cue, kind: ev.target.value as typeof cue.kind })}><option value="freeze">Gel</option><option value="gain">Temps gagné</option><option value="loss">Temps perdu</option></select></Field>
          <Field label="Secondes affichées"><input type="number" min={0} max={30} value={cue.seconds ?? 0} onChange={(ev) => onChange({ ...cue, seconds: int(ev.target.value) })} /></Field>
        </div>
      );
      break;
    case "potFlash":
      body = <div className={styles.grid3}><Field label="Texte affiché"><input value={cue.amountLabel ?? ""} maxLength={12} onChange={(ev) => onChange({ ...cue, amountLabel: ev.target.value })} /></Field></div>;
      break;
    case "avatarAura":
      body = <div className={styles.grid3}><PlayerField value={cue.player} error={e("player")} onChange={(player) => onChange({ ...cue, player })} /><Field label="Aura" error={e("style")}><select value={cue.style} onChange={(ev) => onChange({ ...cue, style: ev.target.value as typeof cue.style })}><option value="shield">Bouclier</option><option value="mask">Masque</option><option value="totem">Totem</option><option value="lucky">Chance</option></select></Field></div>;
      break;
    case "toast":
      body = (
        <div className={styles.grid2}>
          <Field label="Message" error={e("text")} hint="{activator} et {target} sont remplacés par les noms."><input value={cue.text} maxLength={80} onChange={(ev) => onChange({ ...cue, text: ev.target.value })} /></Field>
          <Field label="Teinte"><select value={cue.tone ?? "gold"} onChange={(ev) => onChange({ ...cue, tone: ev.target.value as typeof cue.tone })}><option value="gold">Or</option><option value="teal">Émeraude</option><option value="pink">Rose</option></select></Field>
        </div>
      );
      break;
    default:
      body = <span className={styles.hint}>Aucun réglage.</span>;
  }
  void choiceIds;
  return <>{body}{fx}</>;
}

/** Identifiants des choix déclarés jusqu'à l'étape `uptoIndex` incluse. */
export function choiceIdsUpTo(script: PowerScript, uptoIndex: number): string[] {
  const ids: string[] = [];
  script.steps.slice(0, uptoIndex + 1).forEach((step) => {
    if (step.choice?.id) ids.push(step.choice.id);
    step.anim?.forEach((cue) => { if (cue.cue === "revealOverlay" && cue.pick?.id) ids.push(cue.pick.id); });
  });
  return ids;
}

/** Ciblage + conditions. */
export function TargetEditor({ script, onChange, errorFor }: { script: PowerScript; onChange: (script: PowerScript) => void; errorFor: ErrorFor }) {
  const target = script.target;
  const conditions = script.conditions ?? [];
  return (
    <div>
      <div className={styles.grid3}>
        <Field label="Qui est visé" error={errorFor("script.target.count")}>
          <select value={target.count} onChange={(e) => onChange({ ...script, target: { ...target, count: e.target.value as typeof target.count } })}>
            {TARGET_COUNTS.map((count) => <option key={count} value={count}>{TARGET_COUNT_LABELS[count]}</option>)}
          </select>
        </Field>
        {target.count !== "none" && (
          <Field label="Qui choisit" error={errorFor("script.target.chooser")}>
            <select value={target.chooser ?? "activator"} onChange={(e) => onChange({ ...script, target: { ...target, chooser: e.target.value as "activator" | "engine" } })}>
              <option value="activator">Le joueur (fenêtre de choix)</option><option value="engine">Le jeu</option>
            </select>
          </Field>
        )}
        {target.count === "many" && <Field label="Nombre max de cibles" error={errorFor("script.target.max")}><input type="number" min={1} max={3} value={target.max ?? 2} onChange={(e) => onChange({ ...script, target: { ...target, max: int(e.target.value) } })} /></Field>}
        {target.count !== "none" && <label className={styles.check}><input type="checkbox" checked={Boolean(target.allowSelf)} onChange={(e) => onChange({ ...script, target: { ...target, allowSelf: e.target.checked } })} />Peut se viser soi-même</label>}
      </div>
      <h3>Conditions d’activation</h3>
      <div className={styles.row}>
        {CONDITION_KINDS.map((kind) => {
          const on = conditions.some((condition) => condition.kind === kind);
          return (
            <label key={kind} className={styles.check}>
              <input type="checkbox" checked={on} onChange={(e) => onChange({ ...script, conditions: e.target.checked ? [...conditions, (kind === "isTrickLeader" ? { kind, beforeAnyPlay: true } : { kind }) as never] : conditions.filter((condition) => condition.kind !== kind) })} />
              {CONDITION_LABELS[kind]}
            </label>
          );
        })}
      </div>
    </div>
  );
}

/** Étapes : mode « effet » (clic + briques) ou « animation » (cues). */
export function StepsEditor({ script, onChange, errorFor, mode }: { script: PowerScript; onChange: (script: PowerScript) => void; errorFor: ErrorFor; mode: "effect" | "animation" }) {
  const setStep = (index: number, step: PowerStep) => onChange({ ...script, steps: script.steps.map((item, i) => (i === index ? step : item)) });
  const move = (from: number, to: number) => {
    if (to < 0 || to >= script.steps.length) return;
    const steps = [...script.steps];
    const [item] = steps.splice(from, 1);
    steps.splice(to, 0, item);
    onChange({ ...script, steps });
  };
  return (
    <div>
      {errorFor("script.steps") && <div className={`${styles.notice} ${styles.error}`}>{errorFor("script.steps")}</div>}
      {script.steps.map((step, index) => {
        const base = `script.steps.${index}`;
        const choiceIds = choiceIdsUpTo(script, index);
        const ops = step.ops ?? [];
        const anim = step.anim ?? [];
        return (
          <div key={index} className={styles.stageCard}>
            <div className={styles.stageHead}>
              <span className={styles.stageNum}>{index + 1}</span>
              <strong>Étape {index + 1}</strong>
              <span className={styles.hint}>{ops.length} brique(s) · {anim.length} animation(s)</span>
              <span className={styles.spacer} />
              {mode === "effect" && (
                <>
                  <button type="button" className={`${styles.btn} ${styles.small}`} disabled={index === 0} onClick={() => move(index, index - 1)} aria-label="Monter">↑</button>
                  <button type="button" className={`${styles.btn} ${styles.small}`} disabled={index === script.steps.length - 1} onClick={() => move(index, index + 1)} aria-label="Descendre">↓</button>
                  <button type="button" className={`${styles.btn} ${styles.small} ${styles.danger}`} onClick={() => onChange({ ...script, steps: script.steps.filter((_, i) => i !== index) })}>Supprimer l’étape</button>
                </>
              )}
            </div>

            {mode === "effect" ? (
              <>
                <label className={styles.check}>
                  <input type="checkbox" checked={Boolean(step.choice)} onChange={(e) => setStep(index, { ...step, choice: e.target.checked ? { id: `choix_${index + 1}`, surface: "hand-self", onTimeout: "cancel" } : undefined })} />
                  Le joueur clique une carte avant cette étape
                </label>
                {step.choice && <div style={{ marginTop: 8 }}><ChoiceField value={step.choice} errorFor={errorFor} path={`${base}.choice`} choiceIds={choiceIds} onChange={(choice) => setStep(index, { ...step, choice })} /></div>}
                <h3>Briques</h3>
                {ops.map((op, opIndex) => (
                  <div key={opIndex} className={styles.rewardRow} style={{ display: "block" }}>
                    <div className={styles.row} style={{ marginBottom: 8 }}>
                      <select className={styles.inlineSelect} value={op.op} onChange={(e) => setStep(index, { ...step, ops: ops.map((item, i) => (i === opIndex ? defaultOp(e.target.value as PowerOp["op"]) : item)) })}>
                        {OP_KINDS.map((kind) => <option key={kind} value={kind}>{OP_LABELS[kind].family} · {OP_LABELS[kind].label}</option>)}
                      </select>
                      <span className={styles.hint}>{OP_LABELS[op.op]?.help}</span>
                      <span className={styles.spacer} />
                      <button type="button" className={`${styles.btn} ${styles.small} ${styles.danger}`} onClick={() => setStep(index, { ...step, ops: ops.filter((_, i) => i !== opIndex) })}>✕</button>
                    </div>
                    {errorFor(`${base}.ops.${opIndex}`) && <span className={styles.fieldError}>{errorFor(`${base}.ops.${opIndex}`)}</span>}
                    <OpEditor op={op} errorFor={errorFor} path={`${base}.ops.${opIndex}`} choiceIds={choiceIds} onChange={(next) => setStep(index, { ...step, ops: ops.map((item, i) => (i === opIndex ? next : item)) })} />
                  </div>
                ))}
                <button type="button" className={`${styles.btn} ${styles.small}`} onClick={() => setStep(index, { ...step, ops: [...ops, defaultOp("revealHand")] })}>+ Brique</button>
              </>
            ) : (
              <>
                {anim.length === 0 && <span className={styles.hint}>Aucune animation : l’effet s’applique sans mise en scène.</span>}
                {anim.map((cue, cueIndex) => (
                  <div key={cueIndex} className={styles.rewardRow} style={{ display: "block" }}>
                    <div className={styles.row} style={{ marginBottom: 8 }}>
                      <select className={styles.inlineSelect} value={cue.cue} onChange={(e) => setStep(index, { ...step, anim: anim.map((item, i) => (i === cueIndex ? defaultCue(e.target.value as AnimCue["cue"]) : item)) })}>
                        {CUE_KINDS.map((kind) => <option key={kind} value={kind}>{CUE_LABELS[kind]}</option>)}
                      </select>
                      <span className={styles.spacer} />
                      <button type="button" className={`${styles.btn} ${styles.small}`} disabled={cueIndex === 0} onClick={() => { const next = [...anim]; [next[cueIndex - 1], next[cueIndex]] = [next[cueIndex], next[cueIndex - 1]]; setStep(index, { ...step, anim: next }); }} aria-label="Avant">↑</button>
                      <button type="button" className={`${styles.btn} ${styles.small} ${styles.danger}`} onClick={() => setStep(index, { ...step, anim: anim.filter((_, i) => i !== cueIndex) })}>✕</button>
                    </div>
                    {errorFor(`${base}.anim.${cueIndex}`) && <span className={styles.fieldError}>{errorFor(`${base}.anim.${cueIndex}`)}</span>}
                    <CueEditor cue={cue} errorFor={errorFor} path={`${base}.anim.${cueIndex}`} choiceIds={choiceIds} onChange={(next) => setStep(index, { ...step, anim: anim.map((item, i) => (i === cueIndex ? next : item)) })} />
                  </div>
                ))}
                <button type="button" className={`${styles.btn} ${styles.small}`} onClick={() => setStep(index, { ...step, anim: [...anim, defaultCue("toast")] })}>+ Animation</button>
              </>
            )}
          </div>
        );
      })}
      {mode === "effect" && <button type="button" className={styles.btn} style={{ marginTop: 10 }} disabled={script.steps.length >= 6} onClick={() => onChange({ ...script, steps: [...script.steps, { ops: [defaultOp("timerDelta")], anim: [defaultCue("timerFx")] }] })}>+ Étape</button>}
    </div>
  );
}
