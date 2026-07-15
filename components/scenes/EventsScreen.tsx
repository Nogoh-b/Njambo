"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { type EventVersion, type Reward } from "@/domain";
import { useAuth } from "@/hooks/useAuth";
import { useEconomy } from "@/contexts/EconomyContext";
import { useGame } from "@/contexts/GameContext";
import { useLiveOpsContent, usePlayerEventRuns } from "@/hooks/useLiveOpsContent";
import { GameHubLayout } from "@/components/ui/GameHubLayout";
import { GameCard, RewardPreview, StatusBanner, TicketBadge } from "@/components/ui/GamePrimitives";
import { NjamboIcon, type NjamboIconName } from "@/components/ui/Art";
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

export function EventsScreen({ onStart }: { onStart?: (runId: string) => void }) {
  const { navigateTo } = useGame();
  const { user } = useAuth();
  const { inventory, loading: economyLoading, command } = useEconomy();
  const { events, loading: contentLoading, error: contentError } = useLiveOpsContent();
  const { runs, loading: runsLoading, error: runsError } = usePlayerEventRuns(user && !user.isAnonymous ? user.uid : undefined);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ severity: "success" | "warning" | "error"; text: string } | null>(null);
  const tickets = { bronze: 0, argent: 0, or: 0, ...(inventory.tickets ?? {}) };
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const enter = async (eventId: string) => {
    setBusy(eventId);
    setMessage(null);
    try {
      const result = await command<{ runId: string }>("joinEvent", { eventId });
      setMessage({ severity: "success", text: `Ta place est réservée — participation ${result.runId.slice(0, 8)}…` });
      onStart?.(result.runId);
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : "";
      const missingTicket = /ticket|insufficient/i.test(reason);
      setMessage({
        severity: missingTicket ? "warning" : "error",
        text: missingTicket ? "Il te manque le ticket demandé pour entrer dans ce Ter." : /unavailable|not-found/i.test(reason) ? "Ce rendez-vous du Ter n’est plus disponible." : "L’entrée dans le Ter a été refusée. Réessaie dans un instant.",
      });
    } finally {
      setBusy(null);
    }
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
      {message && <StatusBanner severity={message.severity}>{message.text}</StatusBanner>}
      {(contentError || runsError) && <StatusBanner severity="warning">{runsError ?? contentError}</StatusBanner>}
      {(contentLoading || runsLoading || economyLoading) && <StatusBanner severity="info">Mise à jour des affiches et de ta progression…</StatusBanner>}

      <section className={styles.eventGrid} aria-label="Événements disponibles">
        {events.map((event, index) => {
          const availability = eventState(event, now);
          const run = runs.find((candidate) => candidate.eventId === event.eventId && ["active", "matchmaking", "eliminated"].includes(candidate.status));
          const state: EventState = run?.status === "eliminated" ? "eliminated" : availability;
          const status = EVENT_STATES[state];
          const ticketCount = tickets[event.ticketTier] ?? 0;
          const blocked = !user || user.isAnonymous || availability !== "active" || economyLoading;
          const art = EVENT_ART[event.eventId] ?? "/assets/njambo/events/event-fallback.webp";
          return (
            <GameCard
              key={event.eventId}
              variant={index === 0 ? "featured" : "raised"}
              className={`${styles.eventPoster} ${styles[`eventState_${state}`]}`}
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

                <div className={styles.rewardSection}>
                  <span className={styles.sectionLabel}>Récompense finale</span>
                  <div className={styles.rewardRow}>
                    {event.finalReward.map((reward, rewardIndex) => (
                      <RewardPreview
                        key={`${event.eventId}-reward-${rewardIndex}`}
                        icon={rewardIcon(reward)}
                        label={rewardText(reward)}
                      />
                    ))}
                  </div>
                </div>

                <details className={styles.stageDetails}>
                  <summary>
                    <span>Voir le parcours</span>
                    <small>{event.stages.length} tables à franchir</small>
                  </summary>
                  <ol className={styles.stagePath}>
                    {event.stages.map((stage) => (
                      <li key={stage.id}>
                        <span className={styles.stageNumber}>{stage.order}</span>
                        <span className={styles.stageCopy}>
                          <strong>{stage.title}</strong>
                          <small>{stage.difficulty} · {stage.playerCount} joueurs{stage.crownsEnabled ? " · couronnes actives" : ""}</small>
                        </span>
                        <span className={styles.stageReward}>{stage.reward.map(rewardText).join(" + ")}</span>
                      </li>
                    ))}
                  </ol>
                </details>

                <button data-nj-skin="pink"
                  className={styles.eventCta}
                  type="button"
                  disabled={blocked || busy === event.eventId}
                  onClick={() => {
                    if (run && run.status !== "eliminated") onStart?.(run.id);
                    else void enter(event.eventId);
                  }}
                >
                  <span>{busy === event.eventId ? "Réservation…" : run?.status === "eliminated" ? "Recommencer avec un ticket" : run ? "Continuer ma participation" : event.mode === "pvp" ? "Rejoindre la file" : "Entrer dans le défi"}</span>
                  <NjamboIcon name={busy === event.eventId ? "hourglass" : "play"} tone="pink" size={20} />
                </button>
              </div>
            </GameCard>
          );
        })}
      </section>
    </GameHubLayout>
  );
}
