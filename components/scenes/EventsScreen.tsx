"use client";

import Image from "next/image";
import { eventArt } from "@/lib/eventArt";
import { eventCountdown } from "@/lib/eventCountdown";
import { useSeasons } from "@/hooks/useSeasons";
import { canClaimTier, reachedTiers } from "@/domain";
import { useEffect, useState } from "react";
import { type EventVersion, type Reward } from "@/domain";
import { useAuth } from "@/hooks/useAuth";
import { useEconomy } from "@/contexts/EconomyContext";
import { useGame } from "@/contexts/GameContext";
import { useLiveOpsContent, usePlayerEventRuns } from "@/hooks/useLiveOpsContent";
import { AuthGate } from "@/components/ui/AuthGate";
import { GameModal } from "@/components/ui/GameModal";
import { GameShell } from "@/components/ui/GameShell";
import { NjamboIcon } from "@/components/ui/Art";
import { t } from "@/lib/i18n";
import styles from "./EventsScreen.module.css";

type EventState = "active" | "upcoming" | "ended" | "full" | "eliminated";

const EVENT_STATES: Record<EventState, { label: string; className: string }> = {
  active: { label: "En direct", className: "stateLive" },
  upcoming: { label: "Bientôt", className: "stateSoon" },
  ended: { label: "Terminé", className: "stateEnded" },
  full: { label: "Complet", className: "stateEnded" },
  eliminated: { label: "Éliminé", className: "stateEliminated" },
};

const TICKET_ART: Record<"bronze" | "argent" | "or", string> = {
  bronze: "/assets/njambo/tickets/ticket-bronze-64.webp",
  argent: "/assets/njambo/tickets/ticket-argent-64.webp",
  or: "/assets/njambo/tickets/ticket-or-64.webp",
};

function rewardVisual(reward: Reward): { src: string; label: string } {
  if (reward.type === "nkap") {
    return {
      src: "/assets/njambo/economy/nkap-stack-64.webp",
      label: `${reward.amount.toLocaleString("fr-FR")} Nkap`,
    };
  }
  if (reward.type === "cauris") {
    return {
      src: "/assets/njambo/economy/cauris-pouch-64.webp",
      label: `${reward.amount} cauris`,
    };
  }
  if (reward.type === "booster_book") {
    const bookId = ["normal", "rare", "exceptionnel"].includes(reward.boosterId)
      ? reward.boosterId
      : "normal";
    return {
      src: `/assets/njambo/books/book-${bookId}-128.webp`,
      label: `Livre ${reward.boosterId}`,
    };
  }
  if (reward.type === "ticket") {
    return {
      src: TICKET_ART[reward.tier] ?? TICKET_ART.bronze,
      label: `Ticket ${reward.tier}`,
    };
  }
  if (reward.type === "energy_pass") {
    return {
      src: "/assets/njambo/economy/energy-flask-64.webp",
      label: `Énergie ${reward.durationMinutes / 60}h`,
    };
  }
  return {
    src: "/assets/njambo/books/card-back-128.webp",
    label: `Carte ${reward.rarity}`,
  };
}

function eventState(event: EventVersion, now: number): EventState {
  const capacity = event as EventVersion & { full?: boolean; capacityReached?: boolean };
  if (event.startsAt > now) return "upcoming";
  if (event.endsAt <= now || !event.published) return "ended";
  if (capacity.full || capacity.capacityReached) return "full";
  return "active";
}

function eventDates(event: EventVersion) {
  const format = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", timeZone: "Africa/Douala" });
  const start = event.startsAt <= 0 ? "Maintenant" : format.format(event.startsAt);
  return `${start} – ${format.format(event.endsAt)}`;
}

export function EventsScreen() {
  const { navigateTo, setEventDetailId } = useGame();
  const { user } = useAuth();
  const { inventory } = useEconomy();
  const { events, error: contentError } = useLiveOpsContent();
  const { runs, error: runsError } = usePlayerEventRuns(user && !user.isAnonymous ? user.uid : undefined);
  const tickets = { bronze: 0, argent: 0, or: 0, ...(inventory.tickets ?? {}) };
  const [now, setNow] = useState(() => Date.now());
  const { seasons } = useSeasons();
  const activeSeason = seasons?.[0] ?? null;
  const seasonClaimable = Boolean(activeSeason && activeSeason.season.tiers.some((_, index) =>
    canClaimTier(activeSeason.season, activeSeason.progress, index, "free", now).ok
    || canClaimTier(activeSeason.season, activeSeason.progress, index, "premium", now).ok));
  const [authOpen, setAuthOpen] = useState(false);
  const isGuest = !user || user.isAnonymous;

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!isGuest && authOpen) setAuthOpen(false);
  }, [isGuest, authOpen]);

  const openDetail = (eventId: string) => {
    setEventDetailId(eventId);
    navigateTo("event_detail");
  };

  return (
    <GameShell active="events" dock={false} scroll={false} className={styles.scene} contentClassName={styles.frame}>
      {/* ═══ HUD HAUT : RETOUR + TITRE + PORTE-BILLETS PHYSIQUES ═══ */}
      <header className={styles.hudBar}>
        <div className={styles.hudLeft}>
          <button
            data-nj-skin="none"
            type="button"
            className={styles.backBtn}
            onClick={() => navigateTo("menu")}
            aria-label="Retour au salon"
          >
            <span aria-hidden="true">←</span>
            <span className={styles.backLabel}>Salon</span>
          </button>

          <div className={styles.hudCopy}>
            <span className={styles.hudKicker}>{t("events.kicker")}</span>
            <h1>{t("events.title")}</h1>
          </div>
        </div>

        <div className={styles.hudRight}>
          {isGuest && (
            <button
              data-nj-skin="none"
              type="button"
              className={styles.guestMiniBtn}
              onClick={() => setAuthOpen(true)}
            >
              <NjamboIcon name="profile" tone="teal" size={15} />
              <span>Connexion</span>
            </button>
          )}

          <div className={styles.ticketRack} aria-label="Tes billets d'entrée">
            {(["bronze", "argent", "or"] as const).map((tier) => (
              <button
                key={tier}
                data-nj-skin="none"
                type="button"
                className={`${styles.ticketStubPill} ${styles[`tier_${tier}`]}`}
                onClick={() => navigateTo("shop")}
                title={`Tickets ${tier} : ${tickets[tier]} — Ouvrir la boutique`}
              >
                <Image src={TICKET_ART[tier]} alt="" width={19} height={19} />
                <strong>{tickets[tier]}</strong>
              </button>
            ))}
          </div>
        </div>
      </header>

      {(contentError || runsError) && (
        <div className={styles.errorStrip} role="alert">{runsError ?? contentError}</div>
      )}

      {/* ═══ PASSE DE SAISON (phase 6) ═══ */}
      {activeSeason && (
        <button data-nj-skin="none" type="button" className={styles.seasonBanner} onClick={() => navigateTo("season")}>
          <span className={styles.seasonIcon} aria-hidden="true">🏵️</span>
          <span className={styles.seasonCopy}>
            <small>Passe de saison{activeSeason.progress.premium ? " · Premium 👑" : ""}</small>
            <strong>{activeSeason.season.title}</strong>
          </span>
          <span className={styles.seasonPoints}>
            <strong>{activeSeason.progress.points} pts</strong>
            <small>Palier {reachedTiers(activeSeason.season, activeSeason.progress.points)}/{activeSeason.season.tiers.length}{seasonClaimable ? " · à récupérer !" : ""}</small>
          </span>
          <span aria-hidden="true">›</span>
        </button>
      )}

      {/* ═══ VITRINE DES BILLETS & AFFICHES DE GALA ═══ */}
      <section className={styles.galaStage} aria-label="Événements et tournois disponibles">
        <div className={styles.galaGrid}>
          {events.map((event, index) => {
            const availability = eventState(event, now);
            const run = runs.find(
              (candidate) =>
                candidate.eventId === event.eventId &&
                ["active", "matchmaking", "eliminated"].includes(candidate.status),
            );
            const state: EventState = run?.status === "eliminated" ? "eliminated" : availability;
            const status = EVENT_STATES[state];
            const ticketCount = tickets[event.ticketTier] ?? 0;
            const art = eventArt(event);
            const isPvp = event.mode === "pvp";
            const stageCount = event.stages.length;
            const completedStages = run?.status === "eliminated" ? 0 : (run?.stageIndex ?? 0);
            const lossesUsed = run?.losses ?? 0;
            const livesLeft = Math.max(0, event.allowedLosses - lossesUsed);

            return (
              <article
                key={event.eventId}
                className={`${styles.galaTicket} ${isPvp ? styles.themeTeal : styles.themeGold}`}
                onClick={() => openDetail(event.eventId)}
              >
                {/* ─── PARTIE HAUTE : AFFICHE ILLUSTRÉE + SENTIER MINI-TABLES ─── */}
                <div className={styles.posterTopZone}>
                  <Image
                    src={art.src}
                    unoptimized={art.remote}
                    alt=""
                    fill
                    priority={index === 0}
                    sizes="(min-width: 780px) 48vw, 96vw"
                    className={styles.posterArt}
                  />
                  <span className={styles.posterShade} aria-hidden="true" />
                  <span className={styles.posterInnerRim} aria-hidden="true" />

                  {/* Sceau de statut + Souche de billet physique */}
                  <div className={styles.posterBadgesRow}>
                    <span className={`${styles.statusSeal} ${styles[status.className]}`}>
                      <span className={styles.statusDot} aria-hidden="true" />
                      {status.label}
                    </span>

                    <div className={`${styles.entryPassTag} ${styles[`tier_${event.ticketTier}`]}`}>
                      <Image src={TICKET_ART[event.ticketTier]} alt="" width={20} height={20} />
                      <div className={styles.entryPassCopy}>
                        <small>Ticket {event.ticketTier}</small>
                        <strong>{ticketCount > 0 ? `×${ticketCount} prêt` : "Boutique"}</strong>
                      </div>
                    </div>
                  </div>

                  {/* Bandeau milieu : titre + mode + vies en médaillons */}
                  <div className={styles.posterTitleBlock}>
                    <div className={styles.modeMetaRow}>
                      <span className={styles.modePill}>
                        <NjamboIcon name={isPvp ? "users" : "bot"} tone={isPvp ? "teal" : "gold"} size={14} />
                        {isPvp ? "Tournoi PvP" : "Défi IA"}
                      </span>
                      {(() => {
                        const countdown = eventCountdown(event, now);
                        if (!countdown || countdown.phase === "ended") return <span className={styles.datePill}>{eventDates(event)}</span>;
                        return <span className={`${styles.datePill}${countdown.endingSoon ? ` ${styles.datePillSoon}` : ""}`}>{countdown.endingSoon ? "⏳ " : ""}{countdown.label}</span>;
                      })()}
                    </div>
                    <h2>{event.title}</h2>
                    <p className={styles.posterDesc}>{event.description}</p>
                  </div>

                  {/* Mini-sentier de tables ovales en aperçu vivant sur l'affiche */}
                  <div className={styles.miniTrailBar} aria-label={`Parcours de ${stageCount} tables`}>
                    <div className={styles.miniTrailNodes}>
                      {event.stages.map((stage, sIdx) => {
                        const done = Boolean(run && run.status !== "eliminated" && sIdx < completedStages);
                        const current = Boolean(
                          (run && run.status !== "eliminated" && sIdx === completedStages) ||
                            (!run && sIdx === 0),
                        );
                        return (
                          <div key={stage.id} className={styles.miniTrailStep}>
                            <span
                              className={`${styles.miniOvalNode}${done ? ` ${styles.miniOvalDone}` : ""}${current ? ` ${styles.miniOvalNow}` : ""}`}
                              title={stage.title}
                            >
                              {done ? "✓" : stage.order}
                            </span>
                            <span className={styles.miniTrailWire} aria-hidden="true" />
                          </div>
                        );
                      })}
                      <span className={styles.miniTrophyGoal} aria-hidden="true">
                        <NjamboIcon name="trophy" tone="gold" size={16} />
                      </span>
                    </div>

                    {/* Jetons de vies physiques */}
                    <div className={styles.livesPips} title={`${livesLeft}/${event.allowedLosses} vies`}>
                      {Array.from({ length: event.allowedLosses }, (_, lIdx) => {
                        const alive = lIdx < livesLeft;
                        return (
                          <span
                            key={lIdx}
                            className={`${styles.lifePip}${alive ? ` ${styles.lifeAlive}` : ` ${styles.lifeSpent}`}`}
                            aria-hidden="true"
                          >
                            ♦
                          </span>
                        );
                      })}
                      <span className={styles.livesCaption}>{event.allowedLosses} vies</span>
                    </div>
                  </div>
                </div>

                {/* ─── PERFORATION DE BILLET AVEC ENCOCHES SEMI-CIRCULAIRES ─── */}
                <div className={styles.ticketPerforation} aria-hidden="true">
                  <span className={styles.notchLeft} />
                  <span className={styles.perfDashes} />
                  <span className={styles.notchRight} />
                </div>

                {/* ─── SOUCHE BASSE : TRÉSOR FINAL 2,5D + BOUTON 3D ─── */}
                <div className={styles.ticketStubBody}>
                  <div className={styles.prizeShowcase}>
                    <span className={styles.prizeEyebrow}>Grand Prix final</span>
                    <div className={styles.prizeItemsRow}>
                      {event.finalReward.map((reward, rIdx) => {
                        const vis = rewardVisual(reward);
                        return (
                          <span key={rIdx} className={styles.prizeItemChip}>
                            <Image src={vis.src} unoptimized={vis.src.startsWith("http")} alt="" width={24} height={24} />
                            <strong>{vis.label}</strong>
                          </span>
                        );
                      })}
                    </div>
                  </div>

                  <button
                    data-nj-skin="none"
                    type="button"
                    className={styles.galaCta}
                    onClick={(e) => {
                      e.stopPropagation();
                      openDetail(event.eventId);
                    }}
                  >
                    <span className={styles.ctaSheen} aria-hidden="true" />
                    <span className={styles.ctaCopy}>
                      <strong>
                        {run && run.status !== "eliminated"
                          ? `REPRENDRE · ÉTAPE ${Math.min(completedStages + 1, stageCount)}`
                          : "OUVRIR LE PLATEAU"}
                      </strong>
                      <small>{stageCount} tables à conquérir</small>
                    </span>
                    <span className={styles.ctaArrow} aria-hidden="true">→</span>
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {/* Modale de connexion sans quitter la vitrine */}
      <GameModal
        open={authOpen}
        onClose={() => setAuthOpen(false)}
        kicker="Événements du Ter"
        title="Connecte ton compte"
        tone="gold"
      >
        <AuthGate tone="gold" accountBar="none">
          <div className={styles.authDone}>Compte connecté ! Choisis ton événement.</div>
        </AuthGate>
      </GameModal>
    </GameShell>
  );
}
