"use client";

/* Éditeur d'événement en onglets. La validation du domaine
   (validateEventVersion) tourne en direct ; le serveur refait la même
   vérification avant de publier. */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  EVENT_DIFFICULTIES,
  EVENT_MODIFIERS,
  normalizeEventStage,
  validateEventVersion,
  type EventNotificationConfig,
  type EventStage,
  type EventVersion,
} from "@/domain";
import { adminApi, adminErrorText, issuesFromError, type AdminEventStats, type AdminEventSummary } from "./adminApi";
import { ImageField } from "./ImageField";
import { RewardPicker, rewardSummary } from "./RewardPicker";
import { LifecycleBadge, PREVIEW_MESSAGE, formatDateTime } from "./adminUi";
import styles from "./AdminConsole.module.css";

type TabKey = "general" | "entry" | "stages" | "rewards" | "leaderboard" | "notifications" | "challenges" | "preview" | "stats";

const TABS: Array<{ key: TabKey; label: string; prefixes: string[] }> = [
  { key: "general", label: "Général", prefixes: ["eventId", "revision", "title", "description", "imageUrl", "theme", "mode", "startsAt", "endsAt"] },
  { key: "entry", label: "Entrée & vies", prefixes: ["ticketTier", "allowedLosses", "revive"] },
  { key: "stages", label: "Tables", prefixes: ["stages"] },
  { key: "rewards", label: "Récompenses", prefixes: ["finalReward", "perfectRun"] },
  { key: "leaderboard", label: "Classement", prefixes: ["leaderboard"] },
  { key: "notifications", label: "Notifications", prefixes: ["notifications"] },
  { key: "challenges", label: "Défis", prefixes: ["friendChallenges"] },
  { key: "preview", label: "Aperçu", prefixes: [] },
  { key: "stats", label: "Statistiques", prefixes: [] },
];

const DIFFICULTY_LABELS: Record<string, string> = { facile: "Facile", normal: "Normal", difficile: "Difficile", elite: "Élite" };
const MODIFIER_LABELS: Record<string, string> = { no_powers: "Pouvoirs interdits", double_stake: "Mise ×2", turn_timer: "Minuteur de tour" };
const TONES = ["gold", "teal", "pink", "cobalt", "events"];

/** Valeur d'<input type="datetime-local"> (heure locale du navigateur). */
export function toLocalInput(ms: number) {
  if (!Number.isFinite(ms) || ms <= 0) return "";
  const date = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
const fromLocalInput = (value: string) => (value ? new Date(value).getTime() : 0);
const int = (value: string) => Math.floor(Number(value) || 0);

function Field({ label, error, hint, className, children }: { label: string; error?: string; hint?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <label className={`${styles.field} ${error ? styles.invalid : ""} ${className ?? ""}`}>
      <span>{label}</span>
      {children}
      {error && <span className={styles.fieldError}>{error}</span>}
      {hint && !error && <span className={styles.hint}>{hint}</span>}
    </label>
  );
}

function Check({ checked, onChange, children }: { checked: boolean; onChange: (value: boolean) => void; children: ReactNode }) {
  return <label className={styles.check}><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />{children}</label>;
}

function PhaseHint({ phase }: { phase: number }) {
  return <span className={styles.hint}>Réglage enregistré dès maintenant ; appliqué en jeu à partir de la phase {phase} du plan.</span>;
}

export function EventEditor({ initial, summary, isNew, onClose, onChanged }: {
  initial: EventVersion;
  summary: AdminEventSummary | null;
  isNew: boolean;
  onClose: () => void;
  /** Recharge la fiche depuis le serveur après une action. */
  onChanged: (eventId: string) => void;
}) {
  const [event, setEvent] = useState<EventVersion>(initial);
  const [saved, setSaved] = useState(() => (isNew ? "" : JSON.stringify(initial)));
  const [tab, setTab] = useState<TabKey>("general");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [serverIssues, setServerIssues] = useState<Array<{ path: string; message: string }>>([]);
  const [publishOpen, setPublishOpen] = useState(false);

  const issues = useMemo(() => validateEventVersion(event), [event]);
  const dirty = JSON.stringify(event) !== saved;
  const errorFor = useCallback((path: string) => issues.find((issue) => issue.path === path)?.message, [issues]);
  const tabIssues = (key: TabKey) => {
    const prefixes = TABS.find((entry) => entry.key === key)?.prefixes ?? [];
    return issues.filter((issue) => prefixes.some((prefix) => issue.path === prefix || issue.path.startsWith(`${prefix}.`))).length;
  };

  useEffect(() => {
    const warn = (beforeUnload: BeforeUnloadEvent) => { if (dirty) beforeUnload.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const patch = (next: Partial<EventVersion>) => setEvent((current) => ({ ...current, ...next }));
  const patchStage = (index: number, next: Partial<EventStage>) =>
    setEvent((current) => ({ ...current, stages: current.stages.map((stage, i) => (i === index ? { ...stage, ...next } : stage)) }));
  const setStages = (stages: EventStage[]) => patch({ stages: stages.map((stage, index) => ({ ...stage, order: index + 1 })) });

  const run = async (action: () => Promise<string>) => {
    setBusy(true);
    setNotice(null);
    setServerIssues([]);
    try {
      setNotice({ kind: "ok", text: await action() });
    } catch (cause) {
      setServerIssues(issuesFromError(cause));
      setNotice({ kind: "error", text: adminErrorText(cause) });
    } finally {
      setBusy(false);
    }
  };

  const save = () => run(async () => {
    const result = await adminApi.saveDraft(event);
    setSaved(JSON.stringify(event));
    onChanged(event.eventId);
    return result.issues.length
      ? `Brouillon enregistré (révision ${result.revision} à venir) — ${result.issues.length} point(s) à corriger avant publication.`
      : `Brouillon enregistré — prêt à publier en révision ${result.revision}.`;
  });

  const publish = (publishAt: number | null) => run(async () => {
    if (dirty) {
      await adminApi.saveDraft(event);
      setSaved(JSON.stringify(event));
    }
    const result = await adminApi.publish(event.eventId, publishAt);
    setPublishOpen(false);
    onChanged(event.eventId);
    return result.scheduled
      ? `Révision ${result.revision} programmée le ${formatDateTime(result.publishAt)}.`
      : `Révision ${result.revision} publiée : visible par les joueurs.`;
  });

  return (
    <div>
      <div className={styles.editorHead}>
        <button type="button" className={styles.btn} onClick={() => { if (!dirty || window.confirm("Quitter sans enregistrer ?")) onClose(); }}>← Événements</button>
        <h1>{event.title || event.eventId}</h1>
        {summary && <LifecycleBadge lifecycle={summary.lifecycle} />}
        {summary?.activeRevision && <span className={styles.hint}>En ligne : rév. {summary.activeRevision}</span>}
        {summary?.scheduledRevision && summary.scheduledAt && <span className={styles.hint}>Programmée : rév. {summary.scheduledRevision} le {formatDateTime(summary.scheduledAt)}</span>}
        <span className={styles.spacer} />
        {dirty && <span className={styles.hint}>Modifications non enregistrées</span>}
        <button type="button" className={styles.btn} disabled={busy || !dirty} onClick={() => void save()}>Enregistrer le brouillon</button>
        <button type="button" className={`${styles.btn} ${styles.primary}`} disabled={busy || issues.length > 0} title={issues.length ? "Corrige les erreurs d'abord" : undefined} onClick={() => setPublishOpen(true)}>Publier…</button>
      </div>

      {notice && <div className={`${styles.notice} ${styles[notice.kind]}`}>{notice.text}</div>}
      {serverIssues.length > 0 && (
        <div className={`${styles.notice} ${styles.error}`}>
          <ul className={styles.issues}>{serverIssues.map((issue) => <li key={issue.path + issue.message}><code>{issue.path}</code> — {issue.message}</li>)}</ul>
        </div>
      )}

      <div className={styles.tabs} role="tablist">
        {TABS.filter((entry) => entry.key !== "stats" || (summary?.activeRevision ?? 0) > 0).map((entry) => {
          const count = tabIssues(entry.key);
          return (
            <button key={entry.key} type="button" role="tab" aria-selected={tab === entry.key} className={styles.tab} onClick={() => setTab(entry.key)}>
              {entry.label}{count > 0 && <span className={styles.badge}>{count}</span>}
            </button>
          );
        })}
      </div>

      {tab === "general" && (
        <section className={styles.panel}>
          <div className={styles.grid2}>
            <Field label="Identifiant" error={errorFor("eventId")} hint={isNew ? "Définitif : sert d'adresse et de clé du classement." : "Non modifiable."}>
              <input value={event.eventId} disabled={!isNew} onChange={(e) => patch({ eventId: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_") })} />
            </Field>
            <Field label="Mode">
              <select value={event.mode} onChange={(e) => patch({ mode: e.target.value as EventVersion["mode"] })}>
                <option value="pve">Contre l’IA (PvE)</option>
                <option value="pvp">Contre des joueurs (PvP)</option>
              </select>
            </Field>
            <Field label="Titre" error={errorFor("title")} className={styles.full}>
              <input value={event.title} maxLength={60} onChange={(e) => patch({ title: e.target.value })} />
            </Field>
            <Field label="Description" error={errorFor("description")} hint={`${event.description.length}/280`} className={styles.full}>
              <textarea value={event.description} maxLength={280} onChange={(e) => patch({ description: e.target.value })} />
            </Field>
            <Field label="Début" error={errorFor("startsAt")}>
              <input type="datetime-local" value={toLocalInput(event.startsAt)} onChange={(e) => patch({ startsAt: fromLocalInput(e.target.value) })} />
            </Field>
            <Field label="Fin" error={errorFor("endsAt")}>
              <input type="datetime-local" value={toLocalInput(event.endsAt)} onChange={(e) => patch({ endsAt: fromLocalInput(e.target.value) })} />
            </Field>
          </div>
          <h3>Saison</h3>
          <SeasonSelect value={event.seasonId} onChange={(seasonId) => patch({ seasonId })} />
          <h3>Affiche</h3>
          <ImageField kind="event" label="Illustration de l’événement" value={event.imageUrl} error={errorFor("imageUrl")} onChange={(imageUrl) => patch({ imageUrl })} />
          <h3>Ambiance</h3>
          <div className={styles.grid3}>
            <Field label="Couleur d’accent" error={errorFor("theme.accent")}>
              <div className={styles.row}>
                <input type="color" value={/^#[0-9a-f]{6}$/i.test(event.theme.accent) ? event.theme.accent : "#e5407a"} onChange={(e) => patch({ theme: { ...event.theme, accent: e.target.value } })} style={{ width: 48, padding: 2 }} />
                <input value={event.theme.accent} onChange={(e) => patch({ theme: { ...event.theme, accent: e.target.value } })} style={{ flex: 1 }} />
              </div>
            </Field>
            <Field label="Libellé d’ambiance" error={errorFor("theme.label")}>
              <input value={event.theme.label} maxLength={40} onChange={(e) => patch({ theme: { ...event.theme, label: e.target.value } })} />
            </Field>
            <Field label="Décor">
              <select value={event.theme.tone ?? "events"} onChange={(e) => patch({ theme: { ...event.theme, tone: e.target.value } })}>
                {TONES.map((tone) => <option key={tone} value={tone}>{tone}</option>)}
              </select>
            </Field>
          </div>
        </section>
      )}

      {tab === "entry" && (
        <section className={styles.panel}>
          <div className={styles.grid2}>
            <Field label="Ticket d’entrée" hint="Un ticket couvre tout le parcours, jusqu’à l’élimination.">
              <select value={event.ticketTier} onChange={(e) => patch({ ticketTier: e.target.value as EventVersion["ticketTier"] })}>
                <option value="bronze">Bronze</option><option value="argent">Argent</option><option value="or">Or</option>
              </select>
            </Field>
            <Field label="Vies (défaites autorisées)" error={errorFor("allowedLosses")}>
              <input type="number" min={1} max={10} value={event.allowedLosses} onChange={(e) => patch({ allowedLosses: int(e.target.value) })} />
            </Field>
          </div>
          <h3>Sauver une vie (rachat en cauris)</h3>
          <Check checked={event.revive.enabled} onChange={(enabled) => patch({ revive: { ...event.revive, enabled } })}>Proposer de racheter une vie après l’élimination</Check>
          {event.revive.enabled && (
            <div className={styles.grid3} style={{ marginTop: 10 }}>
              <Field label="Rachats max par parcours" error={errorFor("revive.maxPerRun")}>
                <input type="number" min={1} max={10} value={event.revive.maxPerRun} onChange={(e) => patch({ revive: { ...event.revive, maxPerRun: int(e.target.value) } })} />
              </Field>
              <Field label="Prix successifs (cauris)" error={errorFor("revive.pricesCauris") ?? event.revive.pricesCauris.map((_, i) => errorFor(`revive.pricesCauris.${i}`)).find(Boolean)} hint="Séparés par des virgules ; le dernier s’applique ensuite.">
                <input value={event.revive.pricesCauris.join(", ")} onChange={(e) => patch({ revive: { ...event.revive, pricesCauris: e.target.value.split(/[,;\s]+/).filter(Boolean).map(int) } })} />
              </Field>
              <Field label="Délai pour décider (min)" error={errorFor("revive.windowMinutes")}>
                <input type="number" min={1} value={event.revive.windowMinutes} onChange={(e) => patch({ revive: { ...event.revive, windowMinutes: int(e.target.value) } })} />
              </Field>
            </div>
          )}
          <PhaseHint phase={4} />
        </section>
      )}

      {tab === "stages" && <StagesTab event={event} setStages={setStages} patchStage={patchStage} errorFor={errorFor} />}

      {tab === "rewards" && (
        <section className={styles.panel}>
          <h2>Grand prix (parcours terminé)</h2>
          <RewardPicker path="finalReward" value={event.finalReward} errorFor={errorFor} onChange={(finalReward) => patch({ finalReward })} />
          <h3>Bonus « parcours parfait » (aucune vie perdue)</h3>
          <p className={styles.hint} style={{ marginTop: 0 }}>Astuce : ajoutez une récompense « Cosmétique » (ex. un badge) pour marquer les parcours parfaits sur le profil.</p>
          <RewardPicker path="perfectRun.reward" value={event.perfectRun.reward} errorFor={errorFor} onChange={(reward) => patch({ perfectRun: { ...event.perfectRun, reward } })} />
          <PhaseHint phase={4} />
        </section>
      )}

      {tab === "leaderboard" && (
        <section className={styles.panel}>
          <Check checked={event.leaderboard.enabled} onChange={(enabled) => patch({ leaderboard: { ...event.leaderboard, enabled } })}>Classement et récompenses par rang</Check>
          {event.leaderboard.enabled && (
            <>
              <h3>Barème</h3>
              <div className={styles.grid2}>
                <Field label="Points par table gagnée" error={errorFor("leaderboard.pointsPerStage")}><input type="number" min={0} value={event.leaderboard.pointsPerStage} onChange={(e) => patch({ leaderboard: { ...event.leaderboard, pointsPerStage: int(e.target.value) } })} /></Field>
                <Field label="Points par vie restante" error={errorFor("leaderboard.pointsPerLifeLeft")}><input type="number" min={0} value={event.leaderboard.pointsPerLifeLeft} onChange={(e) => patch({ leaderboard: { ...event.leaderboard, pointsPerLifeLeft: int(e.target.value) } })} /></Field>
                <Field label="Bonus parcours parfait" error={errorFor("leaderboard.perfectBonus")}><input type="number" min={0} value={event.leaderboard.perfectBonus} onChange={(e) => patch({ leaderboard: { ...event.leaderboard, perfectBonus: int(e.target.value) } })} /></Field>
                <Field label="Participants minimum pour distribuer" error={errorFor("leaderboard.minParticipants")}><input type="number" min={1} value={event.leaderboard.minParticipants} onChange={(e) => patch({ leaderboard: { ...event.leaderboard, minParticipants: int(e.target.value) } })} /></Field>
              </div>
              <span className={styles.hint}>Égalité : le parcours le plus rapide passe devant.</span>
              <h3>Récompenses par rang</h3>
              {event.leaderboard.rankRewards.map((tier, index) => (
                <div key={index} className={styles.stageCard}>
                  <div className={styles.row}>
                    <Field label="Du rang" error={errorFor(`leaderboard.rankRewards.${index}`)}><input type="number" min={1} value={tier.fromRank} onChange={(e) => patch({ leaderboard: { ...event.leaderboard, rankRewards: event.leaderboard.rankRewards.map((t, i) => (i === index ? { ...t, fromRank: int(e.target.value) } : t)) } })} /></Field>
                    <Field label="Au rang"><input type="number" min={1} value={tier.toRank} onChange={(e) => patch({ leaderboard: { ...event.leaderboard, rankRewards: event.leaderboard.rankRewards.map((t, i) => (i === index ? { ...t, toRank: int(e.target.value) } : t)) } })} /></Field>
                    <span className={styles.spacer} />
                    <button type="button" className={`${styles.btn} ${styles.small} ${styles.danger}`} onClick={() => patch({ leaderboard: { ...event.leaderboard, rankRewards: event.leaderboard.rankRewards.filter((_, i) => i !== index) } })}>Supprimer la tranche</button>
                  </div>
                  <RewardPicker path={`leaderboard.rankRewards.${index}.reward`} value={tier.reward} errorFor={errorFor} onChange={(reward) => patch({ leaderboard: { ...event.leaderboard, rankRewards: event.leaderboard.rankRewards.map((t, i) => (i === index ? { ...t, reward } : t)) } })} />
                </div>
              ))}
              <button type="button" className={styles.btn} style={{ marginTop: 10 }} onClick={() => {
                const last = event.leaderboard.rankRewards.at(-1);
                const fromRank = last ? last.toRank + 1 : 1;
                patch({ leaderboard: { ...event.leaderboard, rankRewards: [...event.leaderboard.rankRewards, { fromRank, toRank: fromRank, reward: [{ type: "cauris", amount: 10 }] }] } });
              }}>+ Tranche de rangs</button>
            </>
          )}
          <PhaseHint phase={2} />
        </section>
      )}

      {tab === "notifications" && <NotificationsTab event={event} patch={patch} errorFor={errorFor} />}

      {tab === "challenges" && (
        <section className={styles.panel}>
          <Check checked={event.friendChallenges.enabled} onChange={(enabled) => patch({ friendChallenges: { ...event.friendChallenges, enabled } })}>Autoriser les défis entre amis sur cet événement</Check>
          {event.friendChallenges.enabled && (
            <>
              <h3>Récompense du gagnant</h3>
              <RewardPicker path="friendChallenges.winnerReward" value={event.friendChallenges.winnerReward} errorFor={errorFor} onChange={(winnerReward) => patch({ friendChallenges: { ...event.friendChallenges, winnerReward } })} />
            </>
          )}
          <PhaseHint phase={7} />
        </section>
      )}

      {tab === "preview" && <PreviewTab event={event} />}
      {tab === "stats" && <StatsTab eventId={event.eventId} stages={event.stages} />}
      {tab === "stats" && event.leaderboard.enabled && <LiveLeaderboard eventId={event.eventId} />}

      {tab !== "preview" && tab !== "stats" && issues.length > 0 && (
        <section className={styles.panel}>
          <h2>À corriger avant publication ({issues.length})</h2>
          <ul className={styles.issues}>{issues.map((issue) => <li key={issue.path + issue.message}><code>{issue.path}</code> — {issue.message}</li>)}</ul>
        </section>
      )}

      {publishOpen && <PublishDialog busy={busy} startsAt={event.startsAt} onCancel={() => setPublishOpen(false)} onPublish={(at) => void publish(at)} />}
    </div>
  );
}

/* ─────────────── Rattachement à une saison (phase 6) ─────────────── */

function SeasonSelect({ value, onChange }: { value: string | undefined; onChange: (seasonId: string | undefined) => void }) {
  const [seasons, setSeasons] = useState<Array<{ id: string; title: string }> | null>(null);
  useEffect(() => { adminApi.seasons().then((result) => setSeasons(result.seasons)).catch(() => setSeasons([])); }, []);
  return (
    <label className={styles.field} style={{ maxWidth: 420 }}>
      <span>Saison rattachée (les tables gagnées rapportent leurs points de saison)</span>
      <select value={value ?? ""} onChange={(e) => onChange(e.target.value || undefined)}>
        <option value="">Aucune</option>
        {(seasons ?? []).map((season) => <option key={season.id} value={season.id}>{season.title}</option>)}
        {value && seasons && !seasons.some((season) => season.id === value) && <option value={value}>{value} (introuvable)</option>}
      </select>
    </label>
  );
}

/* ─────────────── Onglet Tables ─────────────── */

function StagesTab({ event, setStages, patchStage, errorFor }: {
  event: EventVersion;
  setStages: (stages: EventStage[]) => void;
  patchStage: (index: number, next: Partial<EventStage>) => void;
  errorFor: (path: string) => string | undefined;
}) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const move = (from: number, to: number) => {
    if (from === to || to < 0 || to >= event.stages.length) return;
    const next = [...event.stages];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    setStages(next);
  };
  const addStage = () => {
    const taken = new Set(event.stages.map((stage) => stage.id));
    let n = event.stages.length + 1;
    while (taken.has(`table_${n}`)) n += 1;
    setStages([...event.stages, normalizeEventStage({ id: `table_${n}`, title: `Table ${event.stages.length + 1}`, reward: [{ type: "nkap", amount: 200 }] }, event.stages.length)]);
  };

  return (
    <section className={styles.panel}>
      {errorFor("stages") && <div className={`${styles.notice} ${styles.error}`}>{errorFor("stages")}</div>}
      {event.stages.map((stage, index) => {
        const base = `stages.${index}`;
        const err = (key: string) => errorFor(`${base}.${key}`);
        return (
          <div
            key={`${stage.id}-${index}`}
            className={`${styles.stageCard} ${dragIndex === index ? styles.dragging : ""} ${overIndex === index && dragIndex !== index ? styles.dropTarget : ""}`}
            draggable
            onDragStart={() => setDragIndex(index)}
            onDragOver={(e) => { e.preventDefault(); setOverIndex(index); }}
            onDragEnd={() => { setDragIndex(null); setOverIndex(null); }}
            onDrop={(e) => { e.preventDefault(); if (dragIndex !== null) move(dragIndex, index); setDragIndex(null); setOverIndex(null); }}
          >
            <div className={styles.stageHead}>
              <span className={styles.grip} title="Glisser pour réordonner" aria-hidden="true">⋮⋮</span>
              <span className={styles.stageNum}>{index + 1}</span>
              <strong>{stage.title || stage.id}</strong>
              <span className={styles.spacer} />
              <button type="button" className={`${styles.btn} ${styles.small}`} disabled={index === 0} onClick={() => move(index, index - 1)} aria-label="Monter">↑</button>
              <button type="button" className={`${styles.btn} ${styles.small}`} disabled={index === event.stages.length - 1} onClick={() => move(index, index + 1)} aria-label="Descendre">↓</button>
              <button type="button" className={`${styles.btn} ${styles.small} ${styles.danger}`} onClick={() => { if (window.confirm(`Supprimer « ${stage.title} » ?`)) setStages(event.stages.filter((_, i) => i !== index)); }}>Supprimer</button>
            </div>
            <div className={styles.grid3}>
              <Field label="Nom de la table" error={err("title")}><input value={stage.title} maxLength={48} onChange={(e) => patchStage(index, { title: e.target.value })} /></Field>
              <Field label="Identifiant" error={err("id")}><input value={stage.id} onChange={(e) => patchStage(index, { id: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_") })} /></Field>
              <Field label="Difficulté">
                <select value={stage.difficulty} onChange={(e) => patchStage(index, { difficulty: e.target.value as EventStage["difficulty"] })}>
                  {EVENT_DIFFICULTIES.map((d) => <option key={d} value={d}>{DIFFICULTY_LABELS[d]}</option>)}
                </select>
              </Field>
              <Field label="Joueurs à la table" error={err("playerCount")}>
                <select value={stage.playerCount} onChange={(e) => patchStage(index, { playerCount: int(e.target.value) })}>
                  <option value={2}>2</option><option value={3}>3</option><option value={4}>4</option>
                </select>
              </Field>
              <Field label="Mise (Nkap)" error={err("stakeNkap")}><input type="number" min={0} value={stage.stakeNkap} onChange={(e) => patchStage(index, { stakeNkap: int(e.target.value) })} /></Field>
              <Field label="Points de saison" error={err("seasonPoints")} hint={event.seasonId ? "Crédités si la table est gagnée" : "Rattachez une saison (Général)"}><input type="number" min={0} value={stage.seasonPoints} onChange={(e) => patchStage(index, { seasonPoints: int(e.target.value) })} /></Field>
            </div>
            <div className={styles.row} style={{ margin: "10px 0" }}>
              <Check checked={stage.powersAllowed} onChange={(powersAllowed) => patchStage(index, { powersAllowed })}>Pouvoirs autorisés</Check>
              <Check checked={stage.crownsEnabled} onChange={(crownsEnabled) => patchStage(index, { crownsEnabled })}>Couronnes en jeu</Check>
              <Check checked={stage.rewardRepeatable} onChange={(rewardRepeatable) => patchStage(index, { rewardRepeatable })}>Récompense rejouable</Check>
            </div>
            <h3>Récompense de la table</h3>
            <RewardPicker path={`${base}.reward`} value={stage.reward} errorFor={errorFor} onChange={(reward) => patchStage(index, { reward })} />
            <h3>Règles spéciales &amp; boss <span className={styles.hint}>(phase 4)</span></h3>
            <div className={styles.row}>
              {EVENT_MODIFIERS.map((modifier) => (
                <Check key={modifier} checked={stage.modifiers.includes(modifier)} onChange={(on) => patchStage(index, { modifiers: on ? [...stage.modifiers, modifier] : stage.modifiers.filter((m) => m !== modifier) })}>{MODIFIER_LABELS[modifier]}</Check>
              ))}
            </div>
            {stage.modifiers.includes("turn_timer") && (
              <Field label="Secondes par tour" error={err("turnTimerSeconds")}><input type="number" min={5} max={120} value={stage.turnTimerSeconds ?? 20} onChange={(e) => patchStage(index, { turnTimerSeconds: int(e.target.value) })} /></Field>
            )}
            <div style={{ marginTop: 10 }}>
              <Check checked={Boolean(stage.boss)} onChange={(on) => patchStage(index, { boss: on ? { name: "Le Patriarche", botLevel: 4 } : undefined })}>Table de boss</Check>
              {stage.boss && (
                <div className={styles.grid2} style={{ marginTop: 10 }}>
                  <Field label="Nom du boss" error={err("boss.name")}><input value={stage.boss.name} maxLength={32} onChange={(e) => patchStage(index, { boss: { ...stage.boss!, name: e.target.value } })} /></Field>
                  <Field label="Niveau de l’IA (1-5)" error={err("boss.botLevel")}><input type="number" min={1} max={5} value={stage.boss.botLevel} onChange={(e) => patchStage(index, { boss: { ...stage.boss!, botLevel: int(e.target.value) } })} /></Field>
                  <div className={styles.full}>
                    <ImageField kind="boss" label="Avatar du boss" value={stage.boss.avatarUrl} error={err("boss.avatarUrl")} onChange={(avatarUrl) => patchStage(index, { boss: { ...stage.boss!, avatarUrl } })} />
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })}
      <button type="button" className={styles.btn} style={{ marginTop: 12 }} disabled={event.stages.length >= 20} onClick={addStage}>+ Ajouter une table</button>
    </section>
  );
}

/* ─────────────── Onglet Notifications ─────────────── */

function NotificationsTab({ event, patch, errorFor }: {
  event: EventVersion;
  patch: (next: Partial<EventVersion>) => void;
  errorFor: (path: string) => string | undefined;
}) {
  const update = (index: number, next: Partial<EventNotificationConfig>) =>
    patch({ notifications: event.notifications.map((n, i) => (i === index ? { ...n, ...next } : n)) });
  const add = () => {
    const taken = new Set(event.notifications.map((n) => n.id));
    let k = event.notifications.length + 1;
    while (taken.has(`notif_${k}`)) k += 1;
    patch({ notifications: [...event.notifications, { id: `notif_${k}`, trigger: "opening", title: event.title.slice(0, 60), body: "L’événement est ouvert, viens jouer !", audience: "all" }] });
  };
  return (
    <section className={styles.panel}>
      <p className={styles.hint} style={{ marginTop: 0 }}>Campagnes push + in-app créées à la publication. <PhaseHint phase={3} /></p>
      {event.notifications.map((notification, index) => {
        const base = `notifications.${index}`;
        return (
          <div key={notification.id + index} className={styles.stageCard}>
            <div className={styles.grid3}>
              <Field label="Déclencheur">
                <select value={notification.trigger} onChange={(e) => update(index, { trigger: e.target.value as EventNotificationConfig["trigger"] })}>
                  <option value="opening">À l’ouverture</option>
                  <option value="before_end">X minutes avant la fin</option>
                  <option value="at">À une date précise</option>
                </select>
              </Field>
              {notification.trigger === "before_end" && (
                <Field label="Minutes avant la fin" error={errorFor(`${base}.offsetMinutes`)}><input type="number" min={1} value={notification.offsetMinutes ?? 120} onChange={(e) => update(index, { offsetMinutes: int(e.target.value) })} /></Field>
              )}
              {notification.trigger === "at" && (
                <Field label="Date d’envoi" error={errorFor(`${base}.at`)}><input type="datetime-local" value={toLocalInput(notification.at ?? 0)} onChange={(e) => update(index, { at: fromLocalInput(e.target.value) })} /></Field>
              )}
              <Field label="Audience">
                <select value={notification.audience} onChange={(e) => update(index, { audience: e.target.value as EventNotificationConfig["audience"] })}>
                  <option value="all">Tous les joueurs</option>
                  <option value="active_run">Joueurs en cours de parcours</option>
                  <option value="not_joined">Joueurs pas encore inscrits</option>
                </select>
              </Field>
              <Field label="Titre" error={errorFor(`${base}.title`)}><input value={notification.title} maxLength={60} onChange={(e) => update(index, { title: e.target.value })} /></Field>
              <Field label="Message" error={errorFor(`${base}.body`)} className={styles.full}><input value={notification.body} maxLength={160} onChange={(e) => update(index, { body: e.target.value })} /></Field>
            </div>
            <div className={styles.row} style={{ marginTop: 8 }}>
              <span className={styles.spacer} />
              <button type="button" className={`${styles.btn} ${styles.small} ${styles.danger}`} onClick={() => patch({ notifications: event.notifications.filter((_, i) => i !== index) })}>Supprimer</button>
            </div>
          </div>
        );
      })}
      <button type="button" className={styles.btn} style={{ marginTop: 10 }} onClick={add}>+ Notification</button>
    </section>
  );
}

/* ─────────────── Aperçu (vrai écran joueur dans un iframe) ─────────────── */

function PreviewTab({ event }: { event: EventVersion }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const onMessage = (message: MessageEvent) => {
      if (message.origin === window.location.origin && (message.data as { type?: string })?.type === `${PREVIEW_MESSAGE}:ready`) setReady(true);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);
  useEffect(() => {
    if (!ready) return;
    frame.current?.contentWindow?.postMessage({ type: PREVIEW_MESSAGE, event }, window.location.origin);
  }, [ready, event]);
  return (
    <section className={styles.panel}>
      <div className={styles.previewWrap}>
        <div className={styles.phone}><iframe ref={frame} src="/admin/apercu" title="Aperçu joueur" /></div>
        <div style={{ maxWidth: 320 }}>
          <h2>Aperçu en direct</h2>
          <p className={styles.hint}>C’est le vrai écran « détail de l’événement » du jeu, alimenté par la fiche en cours d’édition (même non enregistrée). Les boutons y sont désactivés.</p>
        </div>
      </div>
    </section>
  );
}

/* ─────────────── Statistiques ─────────────── */

function StatsTab({ eventId, stages }: { eventId: string; stages: EventStage[] }) {
  const [stats, setStats] = useState<AdminEventStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    setError(null);
    adminApi.stats(eventId).then(setStats).catch((cause) => setError(adminErrorText(cause)));
  }, [eventId]);
  useEffect(load, [load]);
  if (error) return <section className={styles.panel}><div className={`${styles.notice} ${styles.error}`}>{error}</div></section>;
  if (!stats) return <section className={styles.panel}><p className={styles.hint}>Chargement…</p></section>;
  const max = Math.max(1, stats.funnel[0] ?? 0);
  const labels = [...stages.map((stage, i) => `${i + 1}. ${stage.title}`), "Grand prix"];
  return (
    <section className={styles.panel}>
      <div className={styles.row} style={{ marginBottom: 12 }}><h2 style={{ margin: 0 }}>Participation</h2><span className={styles.spacer} /><button type="button" className={`${styles.btn} ${styles.small}`} onClick={load}>Actualiser</button></div>
      <div className={styles.kpis}>
        <div className={styles.kpi}><span>Joueurs</span><strong>{stats.players}</strong></div>
        <div className={styles.kpi}><span>Parcours</span><strong>{stats.runs}</strong></div>
        <div className={styles.kpi}><span>En cours</span><strong>{stats.active}</strong></div>
        <div className={styles.kpi}><span>Éliminés</span><strong>{stats.eliminated}</strong></div>
        <div className={styles.kpi}><span>Grand prix</span><strong>{stats.completed}</strong></div>
        <div className={styles.kpi}><span>Abandons</span><strong>{stats.abandoned}</strong></div>
        <div className={styles.kpi}><span>Parcours parfaits</span><strong>{stats.perfect ?? 0}</strong></div>
        <div className={styles.kpi}><span>Vies rachetées</span><strong>{stats.revives ?? 0}</strong></div>
        <div className={styles.kpi}><span>Cauris des rachats</span><strong>{stats.reviveCauris ?? 0}</strong></div>
        <div className={styles.kpi}><span>Défis (terminés / en cours)</span><strong>{stats.challenges?.finished ?? 0} / {(stats.challenges?.accepted ?? 0) + (stats.challenges?.pending ?? 0)}</strong></div>
      </div>
      <h3>Entonnoir : parcours ayant atteint chaque table</h3>
      {stats.runs === 0 ? <p className={styles.hint}>Aucun parcours pour l’instant.</p> : (
        <div className={styles.funnel}>
          {labels.map((label, index) => {
            const count = stats.funnel[index] ?? 0;
            return (
              <div key={label} className={styles.funnelRow}>
                <span>{label}</span>
                <div className={styles.funnelTrack}><div className={styles.funnelBar} style={{ width: `${(count / max) * 100}%` }} /></div>
                <b>{count}</b>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

/* ─────────────── Classement en direct (phase 2) ─────────────── */

function formatRunDuration(ms: number) {
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return hours < 48 ? `${hours} h ${String(minutes % 60).padStart(2, "0")}` : `${Math.floor(hours / 24)} j ${hours % 24} h`;
}

function LiveLeaderboard({ eventId }: { eventId: string }) {
  const [data, setData] = useState<Awaited<ReturnType<typeof adminApi.leaderboard>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    setError(null);
    adminApi.leaderboard(eventId).then(setData).catch((cause) => setError(adminErrorText(cause)));
  }, [eventId]);
  useEffect(load, [load]);
  return (
    <section className={styles.panel}>
      <div className={styles.row} style={{ marginBottom: 12 }}>
        <h2 style={{ margin: 0 }}>Classement {data?.settledAt ? `final (réglé le ${formatDateTime(data.settledAt)})` : "en direct"}</h2>
        <span className={styles.spacer} />
        {data && <span className={styles.hint}>{data.participants} participant(s)</span>}
        <button type="button" className={`${styles.btn} ${styles.small}`} onClick={load}>Actualiser</button>
      </div>
      {error && <div className={`${styles.notice} ${styles.error}`}>{error}</div>}
      {!data ? <p className={styles.hint}>Chargement…</p> : data.top.length === 0 ? <p className={styles.hint}>Personne n’a encore marqué de points.</p> : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead><tr><th>Rang</th><th>Joueur</th><th>Score</th><th>Tables</th><th>Vies</th><th>Durée</th><th>Récompense</th></tr></thead>
            <tbody>
              {data.top.map((entry) => {
                const tier = data.rankRewards.find((t) => entry.rank >= t.fromRank && entry.rank <= t.toRank);
                return (
                  <tr key={entry.uid}>
                    <td><strong>{entry.rank}</strong></td>
                    <td>{entry.emoji} {entry.name}{entry.perfect ? " ★" : ""}<div className={styles.hint}><code>{entry.uid.slice(0, 10)}</code></div></td>
                    <td><strong>{entry.score}</strong></td>
                    <td>{entry.completed ? "Grand prix" : entry.stagesWon}</td>
                    <td>{entry.livesLeft}</td>
                    <td className={styles.hint}>{formatRunDuration(entry.durationMs)}</td>
                    <td className={styles.hint}>{tier ? tier.reward.map(rewardSummary).join(", ") : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/* ─────────────── Dialogue de publication ─────────────── */

function PublishDialog({ busy, startsAt, onCancel, onPublish }: { busy: boolean; startsAt: number; onCancel: () => void; onPublish: (at: number | null) => void }) {
  const [mode, setMode] = useState<"now" | "later">("now");
  const [at, setAt] = useState(() => toLocalInput(Math.max(Date.now() + 3_600_000, startsAt)));
  const atMs = fromLocalInput(at);
  return (
    <div className={styles.dialogBackdrop} role="dialog" aria-modal="true" onClick={onCancel}>
      <div className={styles.dialog} onClick={(e) => e.stopPropagation()}>
        <h2>Publier une nouvelle révision</h2>
        <p className={styles.hint}>Les parcours déjà commencés gardent leur version ; le classement continue.</p>
        <div style={{ display: "grid", gap: 8 }}>
          <label className={styles.check}><input type="radio" checked={mode === "now"} onChange={() => setMode("now")} />Maintenant</label>
          <label className={styles.check}><input type="radio" checked={mode === "later"} onChange={() => setMode("later")} />Programmer</label>
          {mode === "later" && (
            <Field label="Mise en ligne le" error={atMs <= Date.now() ? "Choisis une date future." : undefined}>
              <input type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} />
            </Field>
          )}
        </div>
        <div className={styles.row}>
          <button type="button" className={styles.btn} onClick={onCancel}>Annuler</button>
          <button type="button" className={`${styles.btn} ${styles.primary}`} disabled={busy || (mode === "later" && atMs <= Date.now())} onClick={() => onPublish(mode === "later" ? atMs : null)}>
            {busy ? "Publication…" : mode === "later" ? "Programmer" : "Publier maintenant"}
          </button>
        </div>
      </div>
    </div>
  );
}
