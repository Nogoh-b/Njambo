"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { type EventVersion } from "@/domain";
import { useAuth } from "@/hooks/useAuth";
import { useEconomy } from "@/contexts/EconomyContext";
import { useGame } from "@/contexts/GameContext";
import { useLiveOpsContent, usePlayerEventRuns } from "@/hooks/useLiveOpsContent";
import { GameHubLayout } from "@/components/ui/GameHubLayout";
import { GameCard, StatusBanner, TicketBadge } from "@/components/ui/GamePrimitives";
import { NjamboIcon } from "@/components/ui/Art";
import { t } from "@/lib/i18n";
import styles from "./GameHubs.module.css";

type EventState = "active" | "upcoming" | "ended" | "full" | "eliminated";

const EVENT_STATES: Record<EventState, { label: string; severity: "success" | "info" | "warning" | "error" }> = {
  active: { label: "En cours", severity: "success" },
  upcoming: { label: "Bientôt", severity: "info" },
  ended: { label: "Terminé", severity: "warning" },
  full: { label: "Complet", severity: "warning" },
  eliminated: { label: "Éliminé", severity: "error" },
};

const EVENT_ART: Record<string, string> = {
  defi_du_mboa: "/assets/njambo/events/defi-du-mboa.webp",
  tournoi_du_ter: "/assets/njambo/events/tournoi-du-ter.webp",
};

function eventState(event: EventVersion, now: number): EventState {
  const capacity = event as EventVersion & { full?: boolean; capacityReached?: boolean };
  if (event.startsAt > now) return "upcoming";
  if (event.endsAt <= now || !event.published) return "ended";
  if (capacity.full || capacity.capacityReached) return "full";
  return "active";
}

function eventDates(event: EventVersion) {
  const format = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric", timeZone: "Africa/Douala" });
  const start = event.startsAt <= 0 ? "Dès maintenant" : format.format(event.startsAt);
  return `${start} — ${format.format(event.endsAt)}`;
}

export function EventsScreen() {
  const { navigateTo, setEventDetailId } = useGame();
  const { user } = useAuth();
  const { inventory, loading: economyLoading } = useEconomy();
  const { events, loading: contentLoading, error: contentError } = useLiveOpsContent();
  const { runs, loading: runsLoading, error: runsError } = usePlayerEventRuns(user && !user.isAnonymous ? user.uid : undefined);
  const tickets = { bronze: 0, argent: 0, or: 0, ...(inventory.tickets ?? {}) };
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const openDetail = (eventId: string) => {
    setEventDetailId(eventId);
    navigateTo("event_detail");
  };

  return (
    <GameHubLayout
      tone="events"
      kicker={t("events.kicker")}
      title={t("events.title")}
      subtitle={t("events.subtitle")}
      active="events"
      headerAction={
        <div className={styles.ticketWallet} aria-label="Tes tickets">
          <TicketBadge kind="bronze" count={tickets.bronze} />
          <TicketBadge kind="argent" count={tickets.argent} />
          <TicketBadge kind="or" count={tickets.or} />
        </div>
      }
    >
      {(!user || user.isAnonymous) && (
        <StatusBanner severity="warning" action={<button data-nj-skin="gold" type="button" className={styles.bannerButton} onClick={() => navigateTo("profile")}>Créer mon compte</button>}>
          <strong>Le Ter garde ta progression.</strong> Crée un compte permanent avant de prendre un ticket.
        </StatusBanner>
      )}
      {(contentError || runsError) && <StatusBanner severity="warning">{runsError ?? contentError}</StatusBanner>}
      {(contentLoading || runsLoading || economyLoading) && <StatusBanner severity="info">Mise à jour des affiches et de ta progression…</StatusBanner>}

      <section className={styles.eventGrid} aria-label="Événements disponibles">
        {events.map((event, index) => {
          const availability = eventState(event, now);
          const run = runs.find((candidate) => candidate.eventId === event.eventId && ["active", "matchmaking", "eliminated"].includes(candidate.status));
          const state: EventState = run?.status === "eliminated" ? "eliminated" : availability;
          const status = EVENT_STATES[state];
          const ticketCount = tickets[event.ticketTier] ?? 0;
          const art = EVENT_ART[event.eventId] ?? "/assets/njambo/events/event-fallback.webp";
          return (
            <GameCard
              key={event.eventId}
              variant={index === 0 ? "featured" : "raised"}
              className={`${styles.eventPoster} ${styles[`eventState_${state}`]}`}
              interactive
              onClick={() => openDetail(event.eventId)}
              ariaLabel={`Ouvrir le détail : ${event.title}`}
            >
              <div
                className={styles.eventHero}
                style={{ "--event-art": `url(${art})` } as CSSProperties}
              >
                <span className={styles.eventHeroShade} aria-hidden="true" />
                <div className={styles.eventHeroTop}>
                  <span className={`${styles.eventStatus} ${styles[`status_${status.severity}`]}`}>
                    <span aria-hidden="true" />{status.label}
                  </span>
                  <TicketBadge kind={event.ticketTier} count={ticketCount} />
                </div>
                <div className={styles.eventHeading}>
                  <span className={styles.eventMode}>
                    <NjamboIcon name={event.mode === "pve" ? "bot" : "users"} tone={event.mode === "pve" ? "gold" : "teal"} size={18} />
                    {event.mode === "pve" ? "Défi contre l’IA" : "Tournoi entre joueurs"}
                  </span>
                  <h2>{event.title}</h2>
                  <p>{event.description}</p>
                </div>
              </div>

              <div className={styles.eventBody}>
                <div className={styles.eventFacts}>
                  <span><NjamboIcon name="history" tone="light" size={17} />{eventDates(event)}</span>
                  <span><NjamboIcon name="cards" tone="pink" size={17} />{event.stages.length} étapes</span>
                  <span><NjamboIcon name="trophy" tone="gold" size={17} />{event.allowedLosses} défaites max.</span>
                </div>

                {run && (
                  <div className={`${styles.eventProgress} ${run.status === "eliminated" ? styles.eventProgressEliminated : ""}`}>
                    <div>
                      <span>Ta participation</span>
                      <strong>{run.status === "matchmaking" ? "Recherche d’adversaires" : run.status === "eliminated" ? "Éliminé — nouveau ticket requis" : `Étape ${Math.min(run.stageIndex + 1, event.stages.length)} sur ${event.stages.length}`}</strong>
                    </div>
                    <span>{Math.max(0, event.allowedLosses - run.losses)} défaite{Math.max(0, event.allowedLosses - run.losses) > 1 ? "s" : ""} restante{Math.max(0, event.allowedLosses - run.losses) > 1 ? "s" : ""}</span>
                    <span className={styles.eventProgressTrack} role="progressbar" aria-label="Progression dans l’événement" aria-valuemin={0} aria-valuemax={event.stages.length} aria-valuenow={Math.min(run.stageIndex, event.stages.length)}>
                      <span style={{ width: `${Math.min(100, (run.stageIndex / event.stages.length) * 100)}%` }} />
                    </span>
                  </div>
                )}

                <span className={styles.eventOpenHint}>
                  Voir le défi <NjamboIcon name="play" tone="pink" size={18} />
                </span>
              </div>
            </GameCard>
          );
        })}
      </section>
    </GameHubLayout>
  );
}
