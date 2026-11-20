"use client";

/* Section « Cartes de pouvoir » : catalogue, création, édition (identité,
   cible, effet, animation, économie), publication versionnée, archivage et
   interrupteur d'urgence. Validation en direct par validatePowerCard. */

import { useCallback, useEffect, useMemo, useState } from "react";
import { PowerCardView } from "@/components/power/PowerCardView";
import { NJAMBO_ICON_NAMES } from "@/components/ui/Art";
import type { PowerModule, PowerScript } from "@/engine/power/types";
import { POWER_ANIM_TAGS, POWER_BOOSTER_TIERS, POWER_CATEGORIES, POWER_RARITIES, POWER_TARGET_MODES, POWER_TONES, validatePowerCard } from "@/engine/power/validate";
import type { PowerCardDef } from "@/types/game";
import { adminApi, adminErrorText, issuesFromError, type AdminPowerCardRow } from "./adminApi";
import { ImageField } from "./ImageField";
import { StepsEditor, TargetEditor } from "./PowerScriptEditor";
import { BOOSTER_TIER_LABELS, CATEGORY_LABELS, RARITY_LABELS, TARGET_MODE_LABELS, TONE_LABELS, blankPowerCard } from "./powerLabels";
import styles from "./AdminConsole.module.css";

type Card = Pick<PowerModule, "def" | "script" | "dev">;
type Tab = "identity" | "target" | "effect" | "animation" | "economy";

const TABS: Array<{ key: Tab; label: string; prefixes: string[] }> = [
  { key: "identity", label: "Identité", prefixes: ["def.id", "def.name", "def.description", "def.activationTitle", "def.activationText", "def.category", "def.rarity", "def.icon", "def.tone", "def.art", "def.targetMode", "def.animTags", "script.id"] },
  { key: "target", label: "Cible", prefixes: ["script.target", "script.conditions"] },
  { key: "effect", label: "Effet", prefixes: ["script.steps"] },
  { key: "animation", label: "Animation", prefixes: [] },
  { key: "economy", label: "Économie", prefixes: ["def.costCauris", "def.costNkap", "def.boosterTier"] },
];

const ANIM_TAG_LABELS: Record<string, string> = {
  hand_self_mutate: "Main du lanceur modifiée", hand_self_recommend: "Conseil dans la main", hand_self_boost: "Carte renforcée",
  hand_target_reveal: "Main adverse révélée", hand_target_restrict: "Main adverse bridée", deposit_from_hand: "Main → dépôt",
  hand_from_deposit: "Dépôt → main", hand_swap_players: "Échange entre joueurs", timer_self: "Minuteur du lanceur",
  timer_target: "Minuteur de la cible", timer_all_opponents: "Minuteur des adversaires", pot_bonus: "Pot",
  future_block: "Blocage futur", result_economy: "Économie de fin de manche",
};

export function PowerCardsAdmin() {
  const [rows, setRows] = useState<AdminPowerCardRow[] | null>(null);
  const [seeded, setSeeded] = useState(true);
  const [filter, setFilter] = useState<string>("all");
  const [editing, setEditing] = useState<{ card: Card; isNew: boolean; published: boolean; revision: number } | null>(null);
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const result = await adminApi.powerCards();
      setRows(result.cards);
      setSeeded(result.seeded);
    } catch (cause) {
      setNotice({ kind: "error", text: adminErrorText(cause) });
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const act = async (action: () => Promise<string>) => {
    setBusy(true);
    setNotice(null);
    try { setNotice({ kind: "ok", text: await action() }); await load(); } catch (cause) { setNotice({ kind: "error", text: adminErrorText(cause) }); } finally { setBusy(false); }
  };

  const open = async (cardId: string) => {
    setBusy(true);
    try {
      const detail = await adminApi.powerCard(cardId);
      if (!detail.working) throw new Error("Carte vide");
      setEditing({ card: { def: detail.working.def, script: detail.working.script, dev: detail.working.dev }, isNew: false, published: detail.published, revision: detail.revision });
    } catch (cause) {
      setNotice({ kind: "error", text: adminErrorText(cause) });
    } finally {
      setBusy(false);
    }
  };

  if (editing) {
    return (
      <PowerCardEditor
        key={editing.card.def.id + (editing.isNew ? ":new" : "")}
        initial={editing.card}
        isNew={editing.isNew}
        published={editing.published}
        revision={editing.revision}
        onClose={() => { setEditing(null); void load(); }}
        onPublished={(revision) => setEditing((current) => (current ? { ...current, isNew: false, published: true, revision } : current))}
      />
    );
  }

  const visible = (rows ?? []).filter((row) => filter === "all"
    || (filter === "archived" ? row.def?.archived : filter === "disabled" ? row.def?.disabled : filter === "draft" ? row.hasDraft || !row.published : row.def?.category === filter));

  return (
    <div>
      <div className={styles.pageHead}>
        <div><h1>Cartes de pouvoir</h1><p>Crée et règle les cartes sans toucher au code : identité, cible, effet (briques), animation, prix.</p></div>
        <button type="button" className={`${styles.btn} ${styles.primary}`} disabled={!seeded} onClick={() => {
          const id = window.prompt("Identifiant de la nouvelle carte (a-z, 0-9, _ ; définitif) :")?.trim().toLowerCase().replace(/[^a-z0-9_]/g, "_");
          if (!id) return;
          if ((rows ?? []).some((row) => row.id === id)) { setNotice({ kind: "error", text: "Identifiant déjà utilisé." }); return; }
          setEditing({ card: blankPowerCard(id), isNew: true, published: false, revision: 0 });
        }}>+ Nouvelle carte</button>
      </div>
      {notice && <div className={`${styles.notice} ${styles[notice.kind]}`}>{notice.text}</div>}
      {!seeded && (
        <section className={styles.panel}>
          <h2>Première mise en route</h2>
          <p className={styles.hint}>Les 21 cartes du jeu sont encore dans le code. Copie-les en base pour pouvoir les modifier ici (rien n’est écrasé, le jeu continue de fonctionner pendant l’opération).</p>
          <button type="button" className={`${styles.btn} ${styles.primary}`} disabled={busy} onClick={() => void act(async () => {
            const result = await adminApi.seedPowerCards();
            return `${result.created} cartes migrées ; catalogue publié (${result.published} cartes).`;
          })}>Migrer les 21 cartes en base</button>
        </section>
      )}
      <div className={styles.filters}>
        {[["all", "Toutes"], ...POWER_CATEGORIES.map((category) => [category, CATEGORY_LABELS[category]]), ["draft", "Brouillons"], ["archived", "Archivées"], ["disabled", "Coupées"]].map(([key, label]) => (
          <button key={key} type="button" className={styles.chip} aria-pressed={filter === key} onClick={() => setFilter(key)}>{label}</button>
        ))}
      </div>
      <section className={styles.panel}>
        {rows === null ? <p className={styles.empty}>Chargement…</p> : visible.length === 0 ? <p className={styles.empty}>Aucune carte.</p> : (
          <div className={styles.library} style={{ gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))", marginTop: 0 }}>
            {visible.map((row) => (
              <div key={row.id} style={{ display: "grid", gap: 6, padding: 8, borderRadius: 12, background: "#21180f", border: "1px solid #3a2b1b" }}>
                {row.def && <PowerCardView card={row.def} compact />}
                <div className={styles.row} style={{ gap: 4 }}>
                  {!row.published && <span className={`${styles.status} ${styles.status_draft}`}>Jamais publiée</span>}
                  {row.hasDraft && row.published && <span className={`${styles.status} ${styles.status_scheduled}`}>Brouillon</span>}
                  {row.def?.archived && <span className={`${styles.status} ${styles.status_ended}`}>Archivée</span>}
                  {row.def?.disabled && <span className={`${styles.status} ${styles.status_archived}`}>Coupée</span>}
                  {row.dev && <span className={`${styles.status} ${styles.status_draft}`}>Test</span>}
                  {row.issues.length > 0 && <span className={`${styles.status} ${styles.status_archived}`}>{row.issues.length} erreur(s)</span>}
                </div>
                <span className={styles.hint}><code>{row.id}</code>{row.revision ? ` · rév. ${row.revision}` : ""}</span>
                <div className={styles.row} style={{ gap: 4 }}>
                  <button type="button" className={`${styles.btn} ${styles.small} ${styles.primary}`} disabled={busy} onClick={() => void open(row.id)}>Modifier</button>
                  <button type="button" className={`${styles.btn} ${styles.small}`} disabled={busy} onClick={() => {
                    const id = window.prompt("Identifiant de la copie :")?.trim().toLowerCase().replace(/[^a-z0-9_]/g, "_");
                    if (id) void act(async () => { await adminApi.duplicatePowerCard(row.id, id); return `Copie « ${id} » créée en brouillon.`; });
                  }}>Dupliquer</button>
                  {row.published && (
                    <>
                      <button type="button" className={`${styles.btn} ${styles.small}`} disabled={busy} onClick={() => void act(async () => {
                        await adminApi.setPowerCardStatus(row.id, { archived: !row.def?.archived });
                        return row.def?.archived ? "Carte remise en boutique et dans les livres." : "Carte archivée : retirée de la boutique et des livres, toujours jouable par ses possesseurs.";
                      })}>{row.def?.archived ? "Désarchiver" : "Archiver"}</button>
                      <button type="button" className={`${styles.btn} ${styles.small} ${styles.danger}`} disabled={busy} onClick={() => {
                        if (row.def?.disabled || window.confirm(`Couper « ${row.def?.name} » pour TOUS les joueurs, immédiatement ?`)) void act(async () => {
                          await adminApi.setPowerCardStatus(row.id, { disabled: !row.def?.disabled });
                          return row.def?.disabled ? "Carte réactivée." : "Carte coupée : son activation est refusée pour tous.";
                        });
                      }}>{row.def?.disabled ? "Réactiver" : "Couper"}</button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export function PowerCardEditor({ initial, isNew, published, revision, onClose, onPublished }: {
  initial: Card; isNew: boolean; published: boolean; revision: number; onClose: () => void; onPublished: (revision: number) => void;
}) {
  const [card, setCard] = useState<Card>(initial);
  const [saved, setSaved] = useState(() => (isNew ? "" : JSON.stringify(initial)));
  const [tab, setTab] = useState<Tab>("identity");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [serverIssues, setServerIssues] = useState<Array<{ path: string; message: string }>>([]);
  const issues = useMemo(() => validatePowerCard(card), [card]);
  const dirty = JSON.stringify(card) !== saved;
  const errorFor = useCallback((path: string) => issues.find((issue) => issue.path === path)?.message, [issues]);
  const tabCount = (key: Tab) => {
    const prefixes = TABS.find((entry) => entry.key === key)?.prefixes ?? [];
    if (key === "animation") return issues.filter((issue) => /^script\.steps\.\d+\.(anim|choreo)/.test(issue.path)).length;
    return issues.filter((issue) => prefixes.some((prefix) => issue.path === prefix || issue.path.startsWith(`${prefix}.`))
      && !(key === "effect" && /^script\.steps\.\d+\.(anim|choreo)/.test(issue.path))).length;
  };
  const def = card.def;
  const patchDef = (next: Partial<PowerCardDef>) => setCard((current) => ({ ...current, def: { ...current.def, ...next } }));
  const setScript = (script: PowerScript) => setCard((current) => ({ ...current, script }));

  const run = async (action: () => Promise<string>) => {
    setBusy(true);
    setNotice(null);
    setServerIssues([]);
    try { setNotice({ kind: "ok", text: await action() }); } catch (cause) { setServerIssues(issuesFromError(cause)); setNotice({ kind: "error", text: adminErrorText(cause) }); } finally { setBusy(false); }
  };
  const save = () => run(async () => {
    const result = await adminApi.savePowerCardDraft(card);
    setSaved(JSON.stringify(card));
    return result.issues.length ? `Brouillon enregistré — ${result.issues.length} point(s) à corriger avant publication.` : "Brouillon enregistré — prêt à publier.";
  });
  const publish = () => run(async () => {
    if (dirty) { await adminApi.savePowerCardDraft(card); setSaved(JSON.stringify(card)); }
    const result = await adminApi.publishPowerCard(def.id);
    onPublished(result.revision);
    return `Révision ${result.revision} publiée : les nouvelles parties l'utilisent (les parties en cours gardent leur version).`;
  });

  const numberField = (label: string, key: "costCauris" | "costNkap") => (
    <label className={`${styles.field} ${errorFor(`def.${key}`) ? styles.invalid : ""}`}>
      <span>{label}</span>
      <input type="number" min={0} value={def[key]} onChange={(e) => patchDef({ [key]: Math.max(0, Math.round(Number(e.target.value) || 0)) } as Partial<PowerCardDef>)} />
      {errorFor(`def.${key}`) && <span className={styles.fieldError}>{errorFor(`def.${key}`)}</span>}
    </label>
  );
  const text = (label: string, key: "name" | "activationTitle" | "activationText" | "description", max: number, area = false) => (
    <label className={`${styles.field} ${area ? styles.full : ""} ${errorFor(`def.${key}`) ? styles.invalid : ""}`}>
      <span>{label} ({def[key].length}/{max})</span>
      {area ? <textarea value={def[key]} maxLength={max} onChange={(e) => patchDef({ [key]: e.target.value } as Partial<PowerCardDef>)} />
        : <input value={def[key]} maxLength={max} onChange={(e) => patchDef({ [key]: e.target.value } as Partial<PowerCardDef>)} />}
      {errorFor(`def.${key}`) && <span className={styles.fieldError}>{errorFor(`def.${key}`)}</span>}
    </label>
  );

  return (
    <div>
      <div className={styles.editorHead}>
        <button type="button" className={styles.btn} onClick={() => { if (!dirty || window.confirm("Quitter sans enregistrer ?")) onClose(); }}>← Cartes</button>
        <h1>{def.name}</h1>
        <span className={styles.hint}><code>{def.id}</code>{published ? ` · en ligne rév. ${revision}` : " · jamais publiée"}</span>
        <span className={styles.spacer} />
        {dirty && <span className={styles.hint}>Modifications non enregistrées</span>}
        <button type="button" className={styles.btn} disabled={busy || !dirty} onClick={() => void save()}>Enregistrer le brouillon</button>
        <button type="button" className={`${styles.btn} ${styles.primary}`} disabled={busy || issues.length > 0} title={issues.length ? "Corrige les erreurs d'abord" : undefined} onClick={() => void publish()}>Publier</button>
      </div>
      {notice && <div className={`${styles.notice} ${styles[notice.kind]}`}>{notice.text}</div>}
      {serverIssues.length > 0 && <div className={`${styles.notice} ${styles.error}`}><ul className={styles.issues}>{serverIssues.map((issue) => <li key={issue.path + issue.message}><code>{issue.path}</code> — {issue.message}</li>)}</ul></div>}

      <div className={styles.previewWrap}>
        <div style={{ flex: "1 1 520px", minWidth: 0 }}>
          <div className={styles.tabs} role="tablist">
            {TABS.map((entry) => {
              const count = tabCount(entry.key);
              return <button key={entry.key} type="button" role="tab" aria-selected={tab === entry.key} className={styles.tab} onClick={() => setTab(entry.key)}>{entry.label}{count > 0 && <span className={styles.badge}>{count}</span>}</button>;
            })}
          </div>

          {tab === "identity" && (
            <section className={styles.panel}>
              <div className={styles.grid2}>
                {text("Nom", "name", 40)}
                <label className={styles.field}><span>Catégorie</span><select value={def.category} onChange={(e) => patchDef({ category: e.target.value as PowerCardDef["category"] })}>{POWER_CATEGORIES.map((key) => <option key={key} value={key}>{CATEGORY_LABELS[key]}</option>)}</select></label>
                <label className={styles.field}><span>Rareté</span><select value={def.rarity} onChange={(e) => patchDef({ rarity: e.target.value as PowerCardDef["rarity"] })}>{POWER_RARITIES.map((key) => <option key={key} value={key}>{RARITY_LABELS[key]}</option>)}</select></label>
                <label className={styles.field}><span>Teinte</span><select value={def.tone} onChange={(e) => patchDef({ tone: e.target.value as PowerCardDef["tone"] })}>{POWER_TONES.map((key) => <option key={key} value={key}>{TONE_LABELS[key]}</option>)}</select></label>
                <label className={styles.field}><span>Icône</span><select value={def.icon} onChange={(e) => patchDef({ icon: e.target.value })}>{[...new Set([def.icon, ...NJAMBO_ICON_NAMES])].map((key) => <option key={key} value={key}>{key}</option>)}</select></label>
                <label className={styles.field}><span>Affichage de la cible (boutique)</span><select value={def.targetMode} onChange={(e) => patchDef({ targetMode: e.target.value as PowerCardDef["targetMode"] })}>{POWER_TARGET_MODES.map((key) => <option key={key} value={key}>{TARGET_MODE_LABELS[key]}</option>)}</select></label>
                {text("Titre d'activation (en grand)", "activationTitle", 24)}
                {text("Texte d'activation", "activationText", 80)}
                {text("Description", "description", 200, true)}
              </div>
              <h3>Visuel</h3>
              <ImageField kind="power" label="Illustration de la carte (portrait)" value={def.art} error={errorFor("def.art")} onChange={(art) => patchDef({ art: art ?? "" })} />
              <h3>Éléments touchés (filtres et repères)</h3>
              <div className={styles.row}>
                {POWER_ANIM_TAGS.map((tag) => (
                  <label key={tag} className={styles.check}><input type="checkbox" checked={def.animTags.includes(tag)} onChange={(e) => patchDef({ animTags: e.target.checked ? [...def.animTags, tag] : def.animTags.filter((item) => item !== tag) })} />{ANIM_TAG_LABELS[tag]}</label>
                ))}
              </div>
            </section>
          )}
          {tab === "target" && <section className={styles.panel}><TargetEditor script={card.script} onChange={setScript} errorFor={errorFor} /></section>}
          {tab === "effect" && <section className={styles.panel}><p className={styles.hint} style={{ marginTop: 0 }}>Chaque étape s’exécute dans l’ordre. Les briques modifient réellement la partie (côté serveur).</p><StepsEditor mode="effect" script={card.script} onChange={setScript} errorFor={errorFor} /></section>}
          {tab === "animation" && <section className={styles.panel}><p className={styles.hint} style={{ marginTop: 0 }}>Mise en scène de chaque étape, rejouée chez tous les joueurs. Pour aller plus loin, ajoute une chorégraphie spatiale à l’étape (repères, trajectoires, effets par élément).</p><StepsEditor mode="animation" script={card.script} onChange={setScript} errorFor={errorFor} tone={def.tone} /></section>}
          {tab === "economy" && (
            <section className={styles.panel}>
              <div className={styles.grid2}>
                {numberField("Prix en cauris", "costCauris")}
                {numberField("Prix en Nkap", "costNkap")}
                <label className={styles.field}><span>Palier de livre</span><select value={def.boosterTier ?? ""} onChange={(e) => patchDef({ boosterTier: (e.target.value || undefined) as PowerCardDef["boosterTier"] })}><option value="">Selon la rareté</option>{POWER_BOOSTER_TIERS.map((key) => <option key={key} value={key}>{BOOSTER_TIER_LABELS[key]}</option>)}</select></label>
              </div>
              <div className={styles.row} style={{ marginTop: 10 }}>
                <label className={styles.check}><input type="checkbox" checked={def.inShop !== false} onChange={(e) => patchDef({ inShop: e.target.checked ? undefined : false })} />Vendue en boutique</label>
                <label className={styles.check}><input type="checkbox" checked={def.inBoosters !== false} onChange={(e) => patchDef({ inBoosters: e.target.checked ? undefined : false })} />Peut tomber dans les livres</label>
                <label className={styles.check}><input type="checkbox" checked={Boolean(card.dev)} onChange={(e) => setCard((current) => ({ ...current, dev: e.target.checked || undefined }))} />Carte de test (jamais proposée aux joueurs)</label>
              </div>
            </section>
          )}

          {issues.length > 0 && (
            <section className={styles.panel}>
              <h2>À corriger avant publication ({issues.length})</h2>
              <ul className={styles.issues}>{issues.map((issue) => <li key={issue.path + issue.message}><code>{issue.path}</code> — {issue.message}</li>)}</ul>
            </section>
          )}
        </div>
        <aside style={{ flex: "0 0 220px", position: "sticky", top: 16 }}>
          <span className={styles.hint}>Aperçu</span>
          <div style={{ marginTop: 6 }}><PowerCardView card={def} /></div>
        </aside>
      </div>
    </div>
  );
}
