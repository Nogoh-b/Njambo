"use client";

/* Section Saisons : passe gratuit + premium (XAF), paliers, statistiques. */

import { useCallback, useEffect, useMemo, useState } from "react";
import { normalizeSeason, seasonPhase, validateReward, validateSeason, type SeasonDefinition } from "@/domain";
import { adminApi, adminErrorText } from "./adminApi";
import { ImageField } from "./ImageField";
import { RewardPicker } from "./RewardPicker";
import { toLocalInput } from "./EventEditor";
import { formatDateTime } from "./adminUi";
import styles from "./AdminConsole.module.css";

const PHASE_LABELS = { upcoming: "À venir", live: "En cours", grace: "Réclamations", closed: "Terminée" } as const;
const DAY = 86_400_000;
const fromLocal = (value: string) => (value ? new Date(value).getTime() : 0);

function blankSeason(): SeasonDefinition {
  const start = Date.now() + DAY;
  return normalizeSeason({
    id: "", title: "Nouvelle saison", description: "", startsAt: start, endsAt: start + 30 * DAY, premiumPriceXaf: 1500, claimGraceDays: 7, published: false,
    tiers: [100, 250, 500].map((points, index) => ({ points, freeReward: [{ type: "nkap", amount: 300 * (index + 1) }], premiumReward: [{ type: "cauris", amount: 20 * (index + 1) }] })),
  });
}

export function SeasonsAdmin() {
  const [seasons, setSeasons] = useState<SeasonDefinition[] | null>(null);
  const [editing, setEditing] = useState<{ season: SeasonDefinition; isNew: boolean } | null>(null);
  const [stats, setStats] = useState<Awaited<ReturnType<typeof adminApi.seasonStats>> | null>(null);
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setSeasons((await adminApi.seasons()).seasons); } catch (cause) { setNotice({ kind: "error", text: adminErrorText(cause) }); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    setStats(null);
    if (editing && !editing.isNew) adminApi.seasonStats(editing.season.id).then(setStats).catch(() => setStats(null));
  }, [editing?.season.id, editing?.isNew]); // eslint-disable-line react-hooks/exhaustive-deps -- recharger seulement au changement de saison

  const issues = useMemo(() => (editing ? validateSeason(editing.season, validateReward) : []), [editing]);
  const errorFor = useCallback((path: string) => issues.find((issue) => issue.path === path)?.message, [issues]);
  const taken = new Set((seasons ?? []).map((season) => season.id));
  const idError = editing?.isNew && taken.has(editing.season.id) ? "Identifiant déjà utilisé." : errorFor("id");
  const patch = (next: Partial<SeasonDefinition>) => setEditing((current) => (current ? { ...current, season: { ...current.season, ...next } } : current));
  const patchTier = (index: number, next: Partial<SeasonDefinition["tiers"][number]>) =>
    setEditing((current) => (current ? { ...current, season: { ...current.season, tiers: current.season.tiers.map((tier, i) => (i === index ? { ...tier, ...next } : tier)) } } : current));

  const save = async () => {
    if (!editing) return;
    setBusy(true);
    setNotice(null);
    try {
      await adminApi.saveSeason(editing.season);
      setNotice({ kind: "ok", text: `Saison « ${editing.season.title} » enregistrée${editing.season.published ? " et publiée" : " (brouillon)"}. Rattachez-y des événements (onglet Général de l’événement).` });
      setEditing({ season: editing.season, isNew: false });
      await load();
    } catch (cause) {
      setNotice({ kind: "error", text: adminErrorText(cause) });
    } finally {
      setBusy(false);
    }
  };

  if (editing) {
    const s = editing.season;
    return (
      <div>
        <div className={styles.editorHead}>
          <button type="button" className={styles.btn} onClick={() => setEditing(null)}>← Saisons</button>
          <h1>{s.title || "Saison"}</h1>
          <span className={styles.spacer} />
          <button type="button" className={`${styles.btn} ${styles.primary}`} disabled={busy || issues.length > 0 || Boolean(idError)} onClick={() => void save()}>Enregistrer</button>
        </div>
        {notice && <div className={`${styles.notice} ${styles[notice.kind]}`}>{notice.text}</div>}
        <section className={styles.panel}>
          <div className={styles.grid2}>
            <label className={`${styles.field} ${idError ? styles.invalid : ""}`}><span>Identifiant</span>
              <input value={s.id} disabled={!editing.isNew} onChange={(e) => patch({ id: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_") })} placeholder="ex. saison_ndop_2027" />
              {idError && <span className={styles.fieldError}>{idError}</span>}
            </label>
            <label className={`${styles.field} ${errorFor("title") ? styles.invalid : ""}`}><span>Titre</span><input value={s.title} maxLength={60} onChange={(e) => patch({ title: e.target.value })} />{errorFor("title") && <span className={styles.fieldError}>{errorFor("title")}</span>}</label>
            <label className={`${styles.field} ${styles.full}`}><span>Description</span><textarea value={s.description} maxLength={280} onChange={(e) => patch({ description: e.target.value })} /></label>
            <label className={styles.field}><span>Début</span><input type="datetime-local" value={toLocalInput(s.startsAt)} onChange={(e) => patch({ startsAt: fromLocal(e.target.value) })} /></label>
            <label className={`${styles.field} ${errorFor("endsAt") ? styles.invalid : ""}`}><span>Fin</span><input type="datetime-local" value={toLocalInput(s.endsAt)} onChange={(e) => patch({ endsAt: fromLocal(e.target.value) })} />{errorFor("endsAt") && <span className={styles.fieldError}>{errorFor("endsAt")}</span>}</label>
            <label className={`${styles.field} ${errorFor("premiumPriceXaf") ? styles.invalid : ""}`}><span>Prix du passe premium (XAF, 0 = pas de premium)</span><input type="number" min={0} value={s.premiumPriceXaf} onChange={(e) => patch({ premiumPriceXaf: Math.floor(Number(e.target.value) || 0) })} />{errorFor("premiumPriceXaf") && <span className={styles.fieldError}>{errorFor("premiumPriceXaf")}</span>}</label>
            <label className={`${styles.field} ${errorFor("claimGraceDays") ? styles.invalid : ""}`}><span>Jours pour réclamer après la fin</span><input type="number" min={0} max={60} value={s.claimGraceDays} onChange={(e) => patch({ claimGraceDays: Math.floor(Number(e.target.value) || 0) })} /></label>
          </div>
          <h3>Visuel</h3>
          <ImageField kind="season" label="Bannière de la saison" value={s.imageUrl} onChange={(imageUrl) => patch({ imageUrl })} />
          <div className={styles.row} style={{ marginTop: 12 }}>
            <label className={styles.check}><input type="checkbox" checked={s.published} onChange={(e) => patch({ published: e.target.checked })} />Publiée (visible des joueurs pendant la saison)</label>
          </div>
          <p className={styles.hint}>⚠️ Le paiement XAF passe par les fournisseurs actuellement <strong>simulés</strong> : MTN MoMo / Orange Money réels restent à brancher.</p>
        </section>

        <section className={styles.panel}>
          <h2>Paliers ({s.tiers.length})</h2>
          {errorFor("tiers") && <div className={`${styles.notice} ${styles.error}`}>{errorFor("tiers")}</div>}
          {s.tiers.map((tier, index) => (
            <div key={index} className={styles.stageCard}>
              <div className={styles.stageHead}>
                <span className={styles.stageNum}>{index + 1}</span>
                <label className={`${styles.field} ${errorFor(`tiers.${index}.points`) ? styles.invalid : ""}`} style={{ maxWidth: 200 }}><span>Points requis</span><input type="number" min={1} value={tier.points} onChange={(e) => patchTier(index, { points: Math.floor(Number(e.target.value) || 0) })} />{errorFor(`tiers.${index}.points`) && <span className={styles.fieldError}>{errorFor(`tiers.${index}.points`)}</span>}</label>
                {stats?.tiers[index] && <span className={styles.hint}>{stats.tiers[index].reached} atteint · {stats.tiers[index].claimedFree} + {stats.tiers[index].claimedPremium} réclamés</span>}
                <span className={styles.spacer} />
                <button type="button" className={`${styles.btn} ${styles.small} ${styles.danger}`} onClick={() => patch({ tiers: s.tiers.filter((_, i) => i !== index) })}>Supprimer</button>
              </div>
              {errorFor(`tiers.${index}`) && <span className={styles.fieldError}>{errorFor(`tiers.${index}`)}</span>}
              <div className={styles.grid2}>
                <div><h3>Gratuit</h3><RewardPicker path={`tiers.${index}.freeReward`} value={tier.freeReward} errorFor={errorFor} onChange={(freeReward) => patchTier(index, { freeReward })} /></div>
                <div><h3>Premium 👑</h3><RewardPicker path={`tiers.${index}.premiumReward`} value={tier.premiumReward} errorFor={errorFor} onChange={(premiumReward) => patchTier(index, { premiumReward })} /></div>
              </div>
            </div>
          ))}
          <button type="button" className={styles.btn} style={{ marginTop: 10 }} onClick={() => {
            const last = s.tiers.at(-1);
            patch({ tiers: [...s.tiers, { points: (last?.points ?? 0) + 150, freeReward: [{ type: "nkap", amount: 500 }], premiumReward: [{ type: "cauris", amount: 25 }] }] });
          }}>+ Palier</button>
        </section>

        {stats && (
          <section className={styles.panel}>
            <h2>Statistiques</h2>
            <div className={styles.kpis}>
              <div className={styles.kpi}><span>Joueurs</span><strong>{stats.players}</strong></div>
              <div className={styles.kpi}><span>Passes premium</span><strong>{stats.premium}</strong></div>
              <div className={styles.kpi}><span>Revenus premium (XAF)</span><strong>{stats.premiumRevenueXaf.toLocaleString("fr-FR")}</strong></div>
              <div className={styles.kpi}><span>Points moyens</span><strong>{stats.averagePoints}</strong></div>
            </div>
          </section>
        )}
      </div>
    );
  }

  const now = Date.now();
  return (
    <div>
      <div className={styles.pageHead}>
        <div><h1>Saisons</h1><p>Les tables validées dans les événements rattachés rapportent des points de saison (réglés table par table dans l’éditeur d’événement).</p></div>
        <button type="button" className={`${styles.btn} ${styles.primary}`} onClick={() => setEditing({ season: blankSeason(), isNew: true })}>+ Nouvelle saison</button>
      </div>
      {notice && <div className={`${styles.notice} ${styles[notice.kind]}`}>{notice.text}</div>}
      <section className={styles.panel}>
        {seasons === null ? <p className={styles.empty}>Chargement…</p> : seasons.length === 0 ? <p className={styles.empty}>Aucune saison.</p> : (
          <table className={styles.table}>
            <thead><tr><th>Saison</th><th>Statut</th><th>Période</th><th>Premium</th><th aria-label="Actions" /></tr></thead>
            <tbody>
              {seasons.map((season) => (
                <tr key={season.id}>
                  <td><strong>{season.title}</strong><div className={styles.hint}><code>{season.id}</code> · {season.tiers.length} paliers</div></td>
                  <td>{season.published ? PHASE_LABELS[seasonPhase(season, now)] : "Brouillon"}</td>
                  <td className={styles.hint}>{formatDateTime(season.startsAt)}<br />→ {formatDateTime(season.endsAt)}</td>
                  <td>{season.premiumPriceXaf > 0 ? `${season.premiumPriceXaf.toLocaleString("fr-FR")} XAF` : "—"}</td>
                  <td><button type="button" className={`${styles.btn} ${styles.small} ${styles.primary}`} onClick={() => setEditing({ season, isNew: false })}>Modifier</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
