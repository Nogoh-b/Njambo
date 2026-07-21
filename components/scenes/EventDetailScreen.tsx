"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { type EventStage, type EventVersion, type Reward } from "@/domain";
import { useAuth } from "@/hooks/useAuth";
import { useEconomy } from "@/contexts/EconomyContext";
import { useGame } from "@/contexts/GameContext";
import { useLiveOpsContent, usePlayerEventRuns } from "@/hooks/useLiveOpsContent";
import { GameHubLayout } from "@/components/ui/GameHubLayout";
import { GameCard, RewardPreview, StatusBanner, TicketBadge } from "@/components/ui/GamePrimitives";
import { NjamboIcon, type NjamboIconName } from "@/components/ui/Art";
import { resolveEventTheme } from "@/lib/eventTheme";
import styles from "./EventDetailScreen.module.css";

type StageState = "completed" | "current" | "locked";

const EVENT_ART: Record<string, string> = {
  defi_du_mboa: "/assets/njambo/events/defi-du-mboa.webp",
  tournoi_du_ter: "/assets/njambo/events/tournoi-du-ter.webp",
};

const DIFFICULTY_LABEL: Record<EventStage["difficulty"], string> = {
  facile: "Facile",
  normal: "Normal",
  difficile: "Difficile",
  elite: "Élite",
};

function rewardText(reward: Reward) {
  if (reward.type === "nkap") return `${reward.amount.toLocaleString("fr-FR")} Nkap`;
  if (reward.type === "cauris") return `${reward.amount} cauris`;
  if (reward.type === "ticket") return `${reward.amount} ticket ${reward.tier}`;
  if (reward.type === "energy_pass") return `Énergie illimitée ${reward.durationMinutes / 60} h`;
  if (reward.type === "booster_book") return `${reward.amount} livre ${reward.boosterId}`;
  return `Carte ${reward.rarity}`;
}

function rewardIcon(reward: Reward): NjamboIconName {
  if (reward.type === "nkap") return "coin";
  if (reward.type === "cauris") return "sparkle";
  if (reward.type === "ticket" || reward.type === "booster_book" || reward.type === "card") return "cards";
  return "hourglass";
}

function eventDates(event: EventVersion) {
  const format = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric", timeZone: "Africa/Douala" });
  const start = event.startsAt <= 0 ? "Dès maintenant" : format.format(event.startsAt);
  return `${start} — ${format.format(event.endsAt)}`;
}

export function EventDetailScreen({ onStart }: { onStart?: (runId: string, mode: "pve" | "pvp", eventId: string, stage0?: { title: string; playerCount: number }) => void }) {
  const { navigateTo, eventDetailId } = useGame();
  const { user } = useAuth();
  const { inventory, loading: economyLoading, command } = useEconomy();
  const { events, loading: contentLoading, error: contentError } = useLiveOpsContent();
  const { runs, error: runsError } = usePlayerEventRuns(user && !user.isAnonymous ? user.uid : undefined);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ severity: "success" | "warning" | "error"; text: string } | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const event = events.find((candidate) => candidate.eventId === eventDetailId) ?? null;
  const theme = resolveEventTheme(event?.eventId);
  const tickets = { bronze: 0, argent: 0, or: 0, ...(inventory.tickets ?? {}) };

  const run = event
    ? runs.find((candidate) => candidate.eventId === event.eventId && ["active", "matchmaking", "eliminated"].includes(candidate.status))
    : undefined;

  // Bornes temporelles : un événement à venir ou terminé ne se lance pas.
  const availability = (() => {
    if (!event) return "loading";
    if (event.startsAt > now) return "upcoming";
    if (event.endsAt <= now || !event.published) return "ended";
    return "active";
  })();
  const isGuest = !user || user.isAnonymous;
  const ticketTier = event?.ticketTier;
  const ticketCount = ticketTier ? (tickets[ticketTier] ?? 0) : 0;
  const hasTicket = ticketCount >= 1;
  const canEnter = availability === "active" && !isGuest && !economyLoading && hasTicket;

  const enter = async () => {
    if (!event) return;
    setBusy(true);
    setMessage(null);
    try {
      const result = await command<{ runId: string }>("joinEvent", { eventId: event.eventId });
      setMessage({ severity: "success", text: `Ta place est réservée — participation ${result.runId.slice(0, 8)}…` });
      const stage0 = event.stages[0];
      onStart?.(result.runId, event.mode, event.eventId, stage0 ? { title: stage0.title, playerCount: stage0.playerCount } : undefined);
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : "";
      const missingTicket = /ticket|insufficient/i.test(reason);
      setMessage({
        severity: missingTicket ? "warning" : "error",
        text: missingTicket ? "Il te manque le ticket demandé pour entrer dans ce Ter." : /unavailable|not-found/i.test(reason) ? "Ce rendez-vous du Ter n’est plus disponible." : "L’entrée dans le Ter a été refusée. Réessaie dans un instant.",
      });
    } finally {
      setBusy(false);
    }
  };

  const handleCta = () => {
    if (!event) return;
    if (run && run.status !== "eliminated") {
      const stage = event.stages[run.stageIndex] ?? event.stages[0];
      onStart?.(run.id, event.mode, event.eventId, stage ? { title: stage.title, playerCount: stage.playerCount } : undefined);
    } else {
      void enter();
    }
  };

  const ctaLabel = (() => {
    if (busy) return "Réservation…";
    if (availability === "upcoming") return "Pas encore ouvert";
    if (availability === "ended") return "Terminé";
    if (isGuest) return "Compte requis";
    if (!hasTicket) return "Ticket requis";
    if (run?.status === "eliminated") return "Recommencer avec un ticket";
    if (run) return "Continuer ma participation";
    return event?.mode === "pvp" ? "Rejoindre la file" : "Entrer dans le défi";
  })();

  if (contentLoading || !event) {
    return (
      <GameHubLayout tone={theme.tone} active="events" title={contentLoading ? "Événement" : "Événement introuvable"}>
        {(contentError || runsError) && <StatusBanner severity="warning">{runsError ?? contentError}</StatusBanner>}
        {contentLoading && <StatusBanner severity="info">Chargement du défi…</StatusBanner>}
        {!contentLoading && !event && (
          <StatusBanner severity="warning" action={<button data-nj-skin="gold" type="button" className={styles.backBtn} onClick={() => navigateTo("events")}>Retour aux événements</button>}>
            Ce rendez-vous du Ter n’est plus disponible.
          </StatusBanner>
        )}
      </GameHubLayout>
    );
  }

  const art = EVENT_ART[event.eventId] ?? "/assets/njambo/events/event-fallback.webp";
  const lossesLeft = Math.max(0, event.allowedLosses - (run?.losses ?? 0));
  const currentStageIndex = run?.status === "eliminated" ? -1 : run?.stageIndex ?? -1;
  const stageState = (stage: EventStage): StageState => {
    if (run?.status === "eliminated") return stage.order - 1 <= currentStageIndex ? "completed" : "locked";
    if (stage.order - 1 < currentStageIndex) return "completed";
    if (stage.order - 1 === currentStageIndex) return "current";
    return "locked";
  };

  const themeVars = {
    "--event-art": `url(${art})`,
    "--event-accent": theme.accent,
    "--event-accent-soft": theme.accentSoft,
  } as CSSProperties;

  return (
    <GameHubLayout
      tone={theme.tone}
      kicker={theme.label}
      title={event.title}
      subtitle={event.description}
      active="events"
      headerAction={
        <div className={styles.ticketWallet} aria-label="Tes tickets">
          <TicketBadge kind="bronze" count={tickets.bronze} />
          <TicketBadge kind="argent" count={tickets.argent} />
          <TicketBadge kind="or" count={tickets.or} />
        </div>
      }
    >
      <button data-nj-skin="none" type="button" className={styles.backBtn} onClick={() => navigateTo("events")}>
        <NjamboIcon name="history" tone="light" size={18} /> Retour aux événements
      </button>

      {message && <StatusBanner severity={message.severity}>{message.text}</StatusBanner>}
      {(contentError || runsError) && <StatusBanner severity="warning">{runsError ?? contentError}</StatusBanner>}
      {isGuest && (
        <StatusBanner severity="warning" action={<button data-nj-skin="gold" type="button" className={styles.backBtn} onClick={() => navigateTo("profile")}>Créer mon compte</button>}>
          Crée un compte permanent pour prendre un ticket et garder ta progression.
        </StatusBanner>
      )}
      {!isGuest && !hasTicket && ticketTier && (
        <StatusBanner severity="warning" action={<button data-nj-skin="pink" type="button" className={styles.backBtn} onClick={() => navigateTo("shop")}>Obtenir un ticket</button>}>
          <strong>Ticket {ticketTier} requis.</strong> Achète-le à la boutique puis reviens défier le Ter.
        </StatusBanner>
      )}

      {/* HÉROS */}
      <GameCard variant="featured" className={styles.heroCard} tone={theme.tone === "events" ? "pink" : theme.tone === "gold" ? "gold" : theme.tone === "teal" ? "teal" : "pink"}>
        <div className={styles.hero} style={themeVars}>
          <span className={styles.heroShade} aria-hidden="true" />
          <div className={styles.heroTop}>
            <span className={styles.modeBadge}>
              <NjamboIcon name={event.mode === "pve" ? "bot" : "users"} tone={event.mode === "pve" ? "gold" : "teal"} size={18} />
              {event.mode === "pve" ? "Défi contre l’IA" : "Tournoi entre joueurs"}
            </span>
            <TicketBadge kind={event.ticketTier} count={ticketCount} />
          </div>
          <div className={styles.heroFacts}>
            <span><NjamboIcon name="history" tone="light" size={16} />{eventDates(event)}</span>
            <span><NjamboIcon name="cards" tone="pink" size={16} />{event.stages.length} étapes</span>
            <span><NjamboIcon name="trophy" tone="gold" size={16} />{event.allowedLosses} défaites max.</span>
          </div>
        </div>
      </GameCard>

      {/* RÉCAP JOUEUR */}
      {run && (
        <section className={styles.recap} aria-label="Ta progression">
          <div className={styles.recapHead}>
            <span className={styles.recapKicker}>Ta participation</span>
            <strong className={styles.recapTitle}>
              {run.status === "matchmaking" ? "Recherche d’adversaires" : run.status === "eliminated" ? "Éliminé — nouveau ticket requis" : `Étape ${Math.min(currentStageIndex + 1, event.stages.length)} sur ${event.stages.length}`}
            </strong>
          </div>
          <div className={styles.recapMeta}>
            <span>{lossesLeft} défaite{lossesLeft > 1 ? "s" : ""} restante{lossesLeft > 1 ? "s" : ""}</span>
          </div>
          <span className={styles.recapTrack} role="progressbar" aria-label="Progression dans l’événement" aria-valuemin={0} aria-valuemax={event.stages.length} aria-valuenow={Math.min(currentStageIndex, event.stages.length)}>
            <span style={{ width: `${Math.min(100, (currentStageIndex / event.stages.length) * 100)}%` }} />
          </span>
        </section>
      )}

      {/* PARCOURS — chemin illustré */}
      <section className={styles.pathSection} aria-label="Parcours des tables">
        <h3 className={styles.pathTitle}>Le parcours</h3>
        <ol className={styles.path}>
          {event.stages.map((stage) => {
            const state = stageState(stage);
            return (
              <li key={stage.id} className={`${styles.pathNode} ${styles[`node_${state}`]}`} aria-current={state === "current" ? "step" : undefined}>
                <span className={styles.pathMarker} aria-hidden="true">
                  {state === "completed" ? <NjamboIcon name="check" tone="teal" size={22} /> : <span className={styles.pathOrder}>{stage.order}</span>}
                </span>
                <div className={styles.pathCopy}>
                  <strong>{stage.title}</strong>
                  <small>{DIFFICULTY_LABEL[stage.difficulty]} · {stage.playerCount} joueurs{stage.crownsEnabled ? " · couronnes actives" : ""}</small>
                  <span className={styles.pathReward}>
                    <NjamboIcon name="sparkle" tone="gold" size={15} />
                    {stage.reward.map(rewardText).join(" + ")}
                  </span>
                </div>
              </li>
            );
          })}
        </ol>
      </section>

      {/* RÉCOMPENSE FINALE */}
      <section className={styles.finalReward} aria-label="Récompense finale">
        <span className={styles.finalLabel}>Récompense finale</span>
        <div className={styles.finalRow}>
          {event.finalReward.map((reward, rewardIndex) => (
            <RewardPreview
              key={`${event.eventId}-final-${rewardIndex}`}
              icon={rewardIcon(reward)}
              label={rewardText(reward)}
            />
          ))}
        </div>
      </section>

      {/* CTA */}
      <button
        data-nj-skin="pink"
        type="button"
        className={styles.cta}
        disabled={!canEnter || busy || (!!run && run.status !== "eliminated" && run.status === "matchmaking")}
        onClick={handleCta}
      >
        <span>{ctaLabel}</span>
        <NjamboIcon name={busy ? "hourglass" : "play"} tone="pink" size={20} />
      </button>
    </GameHubLayout>
  );
}
