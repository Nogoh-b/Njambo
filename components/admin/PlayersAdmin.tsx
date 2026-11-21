"use client";

/* Section Joueurs : recherche, soldes, parcours d'événement, gestes de support. */

import { useEffect, useState } from "react";
import type { CosmeticDefinition } from "@/domain";
import { adminApi, adminErrorText, loadCosmeticCatalog, type AdminPlayerDetail, type AdminPlayerHit } from "./adminApi";
import { formatDateTime } from "./adminUi";
import styles from "./AdminConsole.module.css";

const RUN_STATUS: Record<string, string> = {
  active: "En cours", matchmaking: "En file PvP", completed: "Grand prix", eliminated: "Éliminé", left: "Quitté", abandoned: "Abandonné",
};
const COSMETIC_TYPE_LABELS: Record<CosmeticDefinition["type"], string> = { card_back: "Dos de carte", avatar_frame: "Cadre", badge: "Badge", title: "Titre", anim_style: "Style d'animation" };

export function PlayersAdmin() {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<AdminPlayerHit[] | null>(null);
  const [player, setPlayer] = useState<AdminPlayerDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [grant, setGrant] = useState({ tier: "bronze", amount: 1, reason: "" });
  const [gift, setGift] = useState({ cosmeticId: "", reason: "" });
  const [catalog, setCatalog] = useState<CosmeticDefinition[]>([]);
  useEffect(() => { if (player) void loadCosmeticCatalog().then(setCatalog); }, [player]);

  const act = async (action: () => Promise<string | void>) => {
    setBusy(true);
    setNotice(null);
    try {
      const text = await action();
      if (text) setNotice({ kind: "ok", text });
    } catch (cause) {
      setNotice({ kind: "error", text: adminErrorText(cause) });
    } finally {
      setBusy(false);
    }
  };
  const load = (uid: string) => act(async () => { setPlayer(await adminApi.getPlayer(uid)); });
  const askReason = (label: string) => {
    const reason = window.prompt(`${label}\nMotif (consigné dans l’audit) :`)?.trim();
    return reason ? reason.slice(0, 200) : null;
  };

  return (
    <div>
      <div className={styles.pageHead}><div><h1>Joueurs</h1><p>Support : retrouver un joueur, voir ses parcours, réparer une situation.</p></div></div>
      {notice && <div className={`${styles.notice} ${styles[notice.kind]}`}>{notice.text}</div>}
      <section className={styles.panel}>
        <form className={styles.row} onSubmit={(e) => { e.preventDefault(); if (query.trim()) void act(async () => { setHits((await adminApi.searchPlayers(query.trim())).players); }); }}>
          <label className={styles.field} style={{ flex: 1 }}>
            <span>Nom (début), e-mail ou identifiant</span>
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ex. Mama Ngono, joueur@exemple.com" />
          </label>
          <button type="submit" className={`${styles.btn} ${styles.primary}`} disabled={busy || !query.trim()} style={{ alignSelf: "end" }}>Rechercher</button>
        </form>
        {hits && (hits.length === 0 ? <p className={styles.hint}>Aucun joueur trouvé (la recherche par nom respecte les majuscules).</p> : (
          <div className={styles.row} style={{ marginTop: 12 }}>
            {hits.map((hit) => (
              <button key={hit.uid} type="button" className={styles.chip} aria-pressed={player?.uid === hit.uid} onClick={() => void load(hit.uid)}>
                {hit.emoji} {hit.name}{hit.email ? ` · ${hit.email}` : ""}
              </button>
            ))}
          </div>
        ))}
      </section>

      {player && (
        <>
          <section className={styles.panel}>
            <div className={styles.row}><h2 style={{ margin: 0 }}>{player.emoji} {player.name}</h2><code className={styles.hint}>{player.uid}</code>{player.email && <span className={styles.hint}>{player.email}</span>}<span className={styles.spacer} /><button type="button" className={`${styles.btn} ${styles.small}`} onClick={() => void load(player.uid)}>Actualiser</button></div>
            <div className={styles.kpis} style={{ marginTop: 12 }}>
              <div className={styles.kpi}><span>Nkap</span><strong>{player.nkap.toLocaleString("fr-FR")}</strong></div>
              <div className={styles.kpi}><span>Cauris</span><strong>{player.cauris}</strong></div>
              <div className={styles.kpi}><span>Couronnes</span><strong>{player.crowns}</strong></div>
              <div className={styles.kpi}><span>Tickets bronze / argent / or</span><strong>{player.tickets.bronze} / {player.tickets.argent} / {player.tickets.or}</strong></div>
            </div>
            <h3>Donner des tickets</h3>
            <form className={styles.row} onSubmit={(e) => { e.preventDefault(); void act(async () => {
              const result = await adminApi.grantTicket(player.uid, grant.tier, grant.amount, grant.reason.trim());
              setPlayer({ ...player, tickets: { ...player.tickets, ...result.tickets } });
              setGrant({ ...grant, reason: "" });
              return `${grant.amount} ticket(s) ${grant.tier} crédité(s).`;
            }); }}>
              <label className={styles.field}><span>Palier</span><select value={grant.tier} onChange={(e) => setGrant({ ...grant, tier: e.target.value })}><option value="bronze">Bronze</option><option value="argent">Argent</option><option value="or">Or</option></select></label>
              <label className={styles.field}><span>Nombre</span><input type="number" min={1} max={10} value={grant.amount} onChange={(e) => setGrant({ ...grant, amount: Math.min(10, Math.max(1, Math.floor(Number(e.target.value) || 1))) })} style={{ width: 80 }} /></label>
              <label className={styles.field} style={{ flex: 1 }}><span>Motif</span><input value={grant.reason} maxLength={200} onChange={(e) => setGrant({ ...grant, reason: e.target.value })} placeholder="ex. ticket perdu suite à un bug" /></label>
              <button type="submit" className={styles.btn} disabled={busy || !grant.reason.trim()} style={{ alignSelf: "end" }}>Créditer</button>
            </form>
            <h3>Offrir un cosmétique</h3>
            <p className={styles.hint} style={{ marginTop: 0 }}>
              Il arrive dans la collection du joueur, qui l&apos;équipe lui-même. Même un cosmétique inactif peut être offert (pratique pour tester un style d&apos;animation).
            </p>
            <form className={styles.row} data-testid="grant-cosmetic" onSubmit={(e) => { e.preventDefault(); void act(async () => {
              const result = await adminApi.grantCosmetic(player.uid, gift.cosmeticId, gift.reason.trim());
              const name = catalog.find((item) => item.id === gift.cosmeticId)?.name ?? gift.cosmeticId;
              setPlayer({ ...player, cosmetics: result.cosmetics });
              setGift({ cosmeticId: "", reason: "" });
              return `« ${name} » offert : il est dans la collection du joueur.`;
            }); }}>
              <label className={styles.field} style={{ minWidth: 220 }}><span>Cosmétique</span>
                <select value={gift.cosmeticId} onChange={(e) => setGift({ ...gift, cosmeticId: e.target.value })}>
                  <option value="">Choisir…</option>
                  {(Object.keys(COSMETIC_TYPE_LABELS) as Array<CosmeticDefinition["type"]>).map((type) => {
                    const items = catalog.filter((item) => item.type === type);
                    return items.length ? (
                      <optgroup key={type} label={COSMETIC_TYPE_LABELS[type]}>
                        {items.map((item) => {
                          const owned = player.cosmetics.includes(item.id);
                          return <option key={item.id} value={item.id} disabled={owned}>{item.name}{item.published ? "" : " (inactif)"}{owned ? " · déjà possédé" : ""}</option>;
                        })}
                      </optgroup>
                    ) : null;
                  })}
                </select>
              </label>
              <label className={styles.field} style={{ flex: 1 }}><span>Motif</span><input value={gift.reason} maxLength={200} onChange={(e) => setGift({ ...gift, reason: e.target.value })} placeholder="ex. test du style « Braise »" /></label>
              <button type="submit" className={styles.btn} disabled={busy || !gift.cosmeticId || !gift.reason.trim()} style={{ alignSelf: "end" }}>Offrir</button>
            </form>
            {player.cosmetics.length > 0 && (
              <p className={styles.hint}>Possédés : {player.cosmetics.map((id) => catalog.find((item) => item.id === id)?.name ?? id).join(", ")}</p>
            )}
          </section>
          <section className={styles.panel}>
            <h2>Parcours d’événement</h2>
            {player.runs.length === 0 ? <p className={styles.hint}>Aucun parcours.</p> : (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead><tr><th>Événement</th><th>Statut</th><th>Progression</th><th>Vies perdues</th><th>Mis à jour</th><th aria-label="Actions" /></tr></thead>
                  <tbody>
                    {player.runs.map((run) => (
                      <tr key={run.runId}>
                        <td><strong>{run.eventTitle}</strong><div className={styles.hint}>rév. {run.revision} · {run.runId.slice(0, 10)}…</div></td>
                        <td>{RUN_STATUS[run.status] ?? run.status}{run.inMatch && <div className={styles.hint}>partie en cours</div>}</td>
                        <td>Table {Math.min(run.stageIndex + 1, run.stageCount || run.stageIndex + 1)}{run.stageCount ? ` / ${run.stageCount}` : ""}</td>
                        <td>{run.losses} / {run.allowedLosses}</td>
                        <td className={styles.hint}>{formatDateTime(run.updatedAt)}</td>
                        <td>
                          <div className={styles.row} style={{ justifyContent: "flex-end" }}>
                            <button type="button" className={`${styles.btn} ${styles.small}`} disabled={busy || run.inMatch} title={run.inMatch ? "Partie en cours" : undefined} onClick={() => {
                              const reason = askReason(`Remettre « ${run.eventTitle} » à la table 1 avec toutes ses vies (sans nouveau ticket) ?`);
                              if (reason) void act(async () => { await adminApi.resetRun(run.runId, "restart", reason); await load(player.uid); return "Parcours réinitialisé."; });
                            }}>Réinitialiser</button>
                            {["active", "matchmaking"].includes(run.status) && (
                              <button type="button" className={`${styles.btn} ${styles.small} ${styles.danger}`} disabled={busy || run.inMatch} onClick={() => {
                                const reason = askReason(`Clôturer le parcours « ${run.eventTitle} » ?`);
                                if (reason) void act(async () => { await adminApi.resetRun(run.runId, "close", reason); await load(player.uid); return "Parcours clôturé."; });
                              }}>Clôturer</button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
