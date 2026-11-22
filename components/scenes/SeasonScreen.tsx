"use client";

/* Écran Saison (phase 6) : progression, passe premium, piste des paliers
   gratuits / premium avec réclamation. */

import Image from "next/image";
import { useState, type CSSProperties } from "react";
import { canClaimTier, reachedTiers, type SeasonTrack } from "@/domain";
import { GameShell } from "@/components/ui/GameShell";
import { useGame } from "@/contexts/GameContext";
import { useEconomy } from "@/contexts/EconomyContext";
import { useSeasons, type SeasonView } from "@/hooks/useSeasons";
import { rewardVisual } from "@/lib/eventRewards";
import { eventCountdown } from "@/lib/eventCountdown";
import styles from "./SeasonScreen.module.css";

export function SeasonScreen() {
  const { goBack, backLabelFor } = useGame();
  const { command, refresh } = useEconomy();
  const { seasons, error, reload, signedIn } = useSeasons();
  const [selected, setSelected] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: "ok" | "warn"; text: string } | null>(null);
  const view: SeasonView | undefined = seasons?.[Math.min(selected, (seasons?.length ?? 1) - 1)];

  const claim = async (tierIndex: number, track: SeasonTrack) => {
    if (!view) return;
    setBusy(`${track}-${tierIndex}`);
    setMessage(null);
    try {
      await command("claimSeasonTier", { seasonId: view.season.id, tierIndex, track });
      setMessage({ kind: "ok", text: `Palier ${tierIndex + 1} récupéré !` });
      void refresh();
      await reload();
    } catch {
      setMessage({ kind: "warn", text: "Ce palier n’a pas pu être récupéré." });
    } finally {
      setBusy(null);
    }
  };

  const buyPremium = async () => {
    if (!view) return;
    setBusy("premium");
    setMessage(null);
    try {
      const intent = await command<{ orderId: string }>("createPaymentIntent", { offerId: `season_premium:${view.season.id}`, provider: "simulated" });
      await command("verifyStorePurchase", { orderId: intent.orderId, simulationOutcome: "success" });
      setMessage({ kind: "ok", text: "Passe premium activé : les paliers premium déjà atteints sont à toi !" });
      await reload();
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : "";
      setMessage({ kind: "warn", text: /ADULT/.test(reason) ? "Confirme d’abord que tu as 18 ans ou plus dans ton profil pour payer en XAF." : "Le paiement n’a pas abouti." });
    } finally {
      setBusy(null);
    }
  };

  const header = (
    <header className={styles.hud}>
      <button data-nj-skin="none" type="button" className="nj-sr-back" onClick={() => goBack("events")}>
        <span className="nj-sr-back-arrow" aria-hidden="true">←</span><span>{backLabelFor("events")}</span>
      </button>
      <div className={styles.hudCenter}><span className={styles.kicker}>PASSE DE SAISON</span><h1>{view?.season.title ?? "Saison"}</h1></div>
      <span />
    </header>
  );

  if (!signedIn || !seasons || !view) {
    return (
      <GameShell active="events" dock={false} scroll={false} contentClassName={styles.shell}>
        {header}
        <p className={styles.empty}>{!signedIn ? "Connecte-toi pour suivre la saison." : error ?? (seasons ? "Aucune saison en cours pour le moment." : "Chargement de la saison…")}</p>
      </GameShell>
    );
  }

  return (
    <GameShell active="events" dock={false} scroll={false} contentClassName={styles.shell}>
      {header}
      {seasons.length > 1 && (
        <div className={styles.switcher}>{seasons.map((item, index) => <button key={item.season.id} data-nj-skin="none" type="button" aria-pressed={index === selected} onClick={() => setSelected(index)}>{item.season.title}</button>)}</div>
      )}
      <SeasonPassBody view={view} busy={busy} message={message} onClaim={(tierIndex, track) => void claim(tierIndex, track)} onBuy={() => void buyPremium()} />
    </GameShell>
  );
}

/** Affichage de la saison (séparé des données pour pouvoir le prévisualiser). */
export function SeasonPassBody({ view, busy, message, onClaim, onBuy }: {
  view: SeasonView;
  busy: string | null;
  message: { kind: "ok" | "warn"; text: string } | null;
  onClaim: (tierIndex: number, track: SeasonTrack) => void;
  onBuy: () => void;
}) {
  const { season, progress, phase } = view;
  const now = Date.now();
  const reached = reachedTiers(season, progress.points);
  const next = season.tiers[reached];
  const previousPoints = reached > 0 ? season.tiers[reached - 1].points : 0;
  const toNext = next ? Math.min(1, (progress.points - previousPoints) / Math.max(1, next.points - previousPoints)) : 1;
  const countdown = phase === "live" ? eventCountdown(season, now) : null;
  const graceEnds = season.endsAt + season.claimGraceDays * 86_400_000;

  return (
      <div className={styles.body}>
      <section className={styles.hero} style={season.imageUrl ? ({ "--season-art": `url(${season.imageUrl})` } as CSSProperties) : undefined}>
        <div className={styles.heroShade} aria-hidden="true" />
        <div className={styles.heroCopy}>
          <span className={styles.phase}>{phase === "live" ? countdown?.label ?? "En cours" : `Saison terminée · récompenses jusqu’au ${new Date(graceEnds).toLocaleDateString("fr-FR")}`}</span>
          {season.description && <p>{season.description}</p>}
          <div className={styles.pointsRow}>
            <strong>{progress.points.toLocaleString("fr-FR")} pts</strong>
            <span>Palier {reached} / {season.tiers.length}</span>
          </div>
          <div className={styles.bar} aria-hidden="true"><span style={{ width: `${Math.round(toNext * 100)}%` }} /></div>
          <small>{next ? `${next.points - progress.points} pts avant le palier ${reached + 1} · gagne des points en validant les tables des événements de la saison` : "Tous les paliers sont atteints !"}</small>
        </div>
        {season.premiumPriceXaf > 0 && (
          <div className={`${styles.premiumCard}${progress.premium ? ` ${styles.premiumOn}` : ""}`}>
            <span className={styles.crown} aria-hidden="true">👑</span>
            <div>
              <strong>{progress.premium ? "Passe premium actif" : "Passe premium"}</strong>
              <small>{progress.premium ? "Récupère aussi la colonne dorée" : "Débloque la colonne dorée, même pour les paliers déjà atteints"}</small>
            </div>
            {!progress.premium && phase === "live" && (
              <button data-nj-skin="none" type="button" className={styles.buy} disabled={busy === "premium"} onClick={onBuy}>
                {busy === "premium" ? "Paiement…" : `${season.premiumPriceXaf.toLocaleString("fr-FR")} XAF`}
              </button>
            )}
          </div>
        )}
      </section>

      {message && <div className={`${styles.toast} ${styles[message.kind]}`} role="status">{message.text}</div>}

      <ol className={styles.track} aria-label="Paliers de la saison">
        <li className={styles.trackHead} aria-hidden="true"><span /><span>Gratuit</span><span>Premium 👑</span></li>
        {season.tiers.map((tier, index) => {
          const unlocked = progress.points >= tier.points;
          const cell = (track: SeasonTrack) => {
            const rewards = track === "free" ? tier.freeReward : tier.premiumReward;
            if (rewards.length === 0) return <div className={`${styles.cell} ${styles.cellEmpty}`} />;
            const claimed = (track === "free" ? progress.claimedFree : progress.claimedPremium).includes(index);
            const check = canClaimTier(season, progress, index, track, now);
            return (
              <div className={`${styles.cell} ${track === "premium" ? styles.cellPremium : ""}${claimed ? ` ${styles.cellClaimed}` : ""}${check.ok ? ` ${styles.cellReady}` : ""}`}>
                <div className={styles.loot}>
                  {rewards.map((reward, r) => {
                    const visual = rewardVisual(reward);
                    return <span key={r}><Image src={visual.src} unoptimized={visual.src.startsWith("http")} alt="" width={28} height={28} />{visual.label}</span>;
                  })}
                </div>
                {claimed ? <span className={styles.state}>✓ Récupéré</span>
                  : check.ok ? <button data-nj-skin="none" type="button" className={styles.claim} disabled={busy !== null} onClick={() => onClaim(index, track)}>{busy === `${track}-${index}` ? "…" : "Récupérer"}</button>
                  : <span className={styles.state}>{track === "premium" && !progress.premium && unlocked ? "🔒 Premium" : "🔒"}</span>}
              </div>
            );
          };
          return (
            <li key={index} className={`${styles.tier}${unlocked ? ` ${styles.tierUnlocked}` : ""}${index === reached ? ` ${styles.tierNext}` : ""}`}>
              <span className={styles.tierBadge}><b>{index + 1}</b><small>{tier.points} pts</small></span>
              {cell("free")}
              {cell("premium")}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
