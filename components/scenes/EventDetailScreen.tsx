"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useSfx } from "@gxe/react";
import { canRevive, normalizeEventVersion, type EventStage, type EventVersion } from "@/domain";
import { TICKET_ART, rewardVisual } from "@/lib/eventRewards";
import { useAuth } from "@/hooks/useAuth";
import { useEconomy } from "@/contexts/EconomyContext";
import { useGame } from "@/contexts/GameContext";
import { useLiveOpsContent, usePlayerEventRuns } from "@/hooks/useLiveOpsContent";
import { AuthGate } from "@/components/ui/AuthGate";
import { GameModal } from "@/components/ui/GameModal";
import { GameShell } from "@/components/ui/GameShell";
import { NjamboIcon } from "@/components/ui/Art";
import { resolveEventTheme } from "@/lib/eventTheme";
import { eventArt } from "@/lib/eventArt";
import { eventCountdown } from "@/lib/eventCountdown";
import { useEventLeaderboard } from "@/hooks/useEventLeaderboard";
import { EventLeaderboardPanel } from "./EventLeaderboardPanel";
import { EventBossIntro } from "./EventBossIntro";
import { LOSE_SOUND, WIN_SOUND } from "@/lib/gxeSfx";
import { EventOutcomeOverlay, resolveEventOutcome, type EventOutcome } from "./EventOutcomeOverlay";
import styles from "./EventDetailScreen.module.css";

type StageState = "completed" | "current" | "locked";

const DIFFICULTY_META: Record<
  EventStage["difficulty"],
  { label: string; stars: string; className: string }
> = {
  facile: { label: "Facile", stars: "★", className: "diffEasy" },
  normal: { label: "Normal", stars: "★★", className: "diffNormal" },
  difficile: { label: "Difficile", stars: "★★★", className: "diffHard" },
  elite: { label: "Élite", stars: "★★★★", className: "diffElite" },
};

function eventDates(event: EventVersion) {
  const format = new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "short",
    timeZone: "Africa/Douala",
  });
  const start = event.startsAt <= 0 ? "Dès maintenant" : format.format(event.startsAt);
  return `${start} — ${format.format(event.endsAt)}`;
}

export function EventDetailScreen({
  onStart,
  previewEvent,
}: {
  /** Aperçu admin : affiche cette fiche (brouillon) au lieu des données en ligne ; actions désactivées. */
  previewEvent?: EventVersion | null;
  onStart?: (
    runId: string,
    mode: "pve" | "pvp",
    eventId: string,
    stage0?: { title: string; playerCount: number },
  ) => void;
}) {
  const { navigateTo, eventDetailId, eventReturn, setEventReturn } = useGame();
  const gxeSfx = useSfx();
  const { user } = useAuth();
  const { economy, inventory, loading: economyLoading, command, refresh: refreshEconomy } = useEconomy();
  const { events, loading: contentLoading, error: contentError } = useLiveOpsContent();
  const { runs, error: runsError } = usePlayerEventRuns(
    user && !user.isAnonymous ? user.uid : undefined,
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{
    severity: "success" | "warning" | "error";
    text: string;
  } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [selectedStageIndex, setSelectedStageIndex] = useState<number>(0);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [boardView, setBoardView] = useState<"path" | "ranking">("path");
  /** Gemme qui se reforme après un rachat de vie (phase 4). */
  const [revivedGemIndex, setRevivedGemIndex] = useState<number | null>(null);
  const [bossIntro, setBossIntro] = useState<{ stage: EventStage; start: () => void } | null>(null);
  const [leaderboardRefresh, setLeaderboardRefresh] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const preview = Boolean(previewEvent);
  const event = previewEvent ?? events.find((candidate) => candidate.eventId === eventDetailId) ?? null;
  const theme = resolveEventTheme(event);
  const rankingEnabled = Boolean(event?.leaderboard.enabled);
  const { data: leaderboard, error: leaderboardError, reload: reloadLeaderboard } = useEventLeaderboard(
    event?.eventId,
    rankingEnabled && !preview && Boolean(user),
    leaderboardRefresh,
  );
  const countdown = event ? eventCountdown(event, now) : null;
  const tickets = { bronze: 0, argent: 0, or: 0, ...(inventory.tickets ?? {}) };

  /* Parcours affiché : d'abord un parcours en cours (active/matchmaking),
     sinon le plus récent terminé (éliminé ou grand prix) pour afficher son
     bilan. L'ordre des documents n'est pas garanti : on trie explicitement. */
  const run = useMemo(() => {
    if (!event || preview) return undefined;
    const mine = runs
      .filter((candidate) => candidate.eventId === event.eventId)
      .sort((a, b) => Number(b.updatedAt ?? 0) - Number(a.updatedAt ?? 0));
    return (
      mine.find((candidate) => candidate.status === "active" || candidate.status === "matchmaking")
      ?? mine.find((candidate) => candidate.status === "eliminated" || candidate.status === "completed")
    );
  }, [event, runs, preview]);

  /* Compte à rebours du rachat de vie : rafraîchi chaque seconde tant qu'il court. */
  const eliminatedAt = run?.status === "eliminated" ? run.eliminatedAt ?? null : null;
  useEffect(() => {
    if (!eliminatedAt) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [eliminatedAt]);

  /* ── Conséquences de la dernière partie ──────────────────────────────
     eventReturn = photo du run prise avant la partie. Dès que le run à jour
     diffère (règlement serveur), on joue l'animation correspondante.
     Sans changement au bout de 8 s (partie annulée, abandon avant la
     donne…), la photo est simplement oubliée. */
  const [outcome, setOutcome] = useState<EventOutcome | null>(null);
  const [rankBefore, setRankBefore] = useState<number | null>(null);
  const [freshUnlockIndex, setFreshUnlockIndex] = useState<number | null>(null);
  const [breakingLifeIndex, setBreakingLifeIndex] = useState<number | null>(null);
  const outcomeTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!eventReturn || !event || eventReturn.eventId !== event.eventId) return;
    const updated = runs.find((candidate) => candidate.id === eventReturn.runId);
    const result = updated ? resolveEventOutcome(event, eventReturn, updated) : null;
    if (result) {
      if (outcomeTimerRef.current !== null) {
        window.clearTimeout(outcomeTimerRef.current);
        outcomeTimerRef.current = null;
      }
      setEventReturn(null);
      setOutcome(result);
      setRankBefore(eventReturn.rank ?? null);
      if (rankingEnabled) setLeaderboardRefresh((key) => key + 1);
      if (result.kind === "advance") setFreshUnlockIndex(result.stageIndex + 1);
      if (result.kind === "life_lost" || result.kind === "eliminated") {
        setBreakingLifeIndex(Math.max(0, event.allowedLosses - result.losses));
      }
      gxeSfx.playChime(result.kind === "advance" || result.kind === "completed" ? WIN_SOUND : LOSE_SOUND);
      return;
    }
    if (outcomeTimerRef.current === null) {
      const remaining = Math.max(0, 8_000 - (Date.now() - eventReturn.takenAt));
      outcomeTimerRef.current = window.setTimeout(() => {
        outcomeTimerRef.current = null;
        setEventReturn(null);
      }, remaining);
    }
  }, [event, eventReturn, gxeSfx, rankingEnabled, runs, setEventReturn]);

  useEffect(() => () => {
    if (outcomeTimerRef.current !== null) window.clearTimeout(outcomeTimerRef.current);
  }, []);

  /* Les marqueurs d'animation sur le plateau / le HUD s'effacent seuls. */
  useEffect(() => {
    if (freshUnlockIndex === null && breakingLifeIndex === null) return;
    const timer = window.setTimeout(() => {
      setFreshUnlockIndex(null);
      setBreakingLifeIndex(null);
    }, 2_600);
    return () => window.clearTimeout(timer);
  }, [freshUnlockIndex, breakingLifeIndex]);

  const rememberRunBeforeMatch = (runId: string, stageIndex: number, losses: number, score = 0) => {
    if (!event) return;
    if (outcomeTimerRef.current !== null) {
      window.clearTimeout(outcomeTimerRef.current);
      outcomeTimerRef.current = null;
    }
    setEventReturn({ runId, eventId: event.eventId, stageIndex, losses, score, rank: leaderboard?.me?.rank ?? null, takenAt: Date.now() });
  };

  const isGuest = !user || user.isAnonymous;

  /** Table de boss : présentation du boss, puis entrée à la table. */
  const withBossIntro = (stage: EventStage | undefined, start: () => void) => {
    if (stage?.boss) setBossIntro({ stage, start });
    else start();
  };

  useEffect(() => {
    if (!isGuest && authModalOpen) setAuthModalOpen(false);
  }, [isGuest, authModalOpen]);

  /* Sélectionner par défaut l'étape active du joueur (ou la table 1) */
  useEffect(() => {
    if (!event) return;
    if (run && run.status === "completed") {
      setSelectedStageIndex(Math.max(0, event.stages.length - 1));
    } else if (run && run.status !== "eliminated") {
      setSelectedStageIndex(Math.min(run.stageIndex, Math.max(0, event.stages.length - 1)));
    } else {
      setSelectedStageIndex(0);
    }
  }, [event, run]);

  const availability = (() => {
    if (!event) return "loading";
    if (event.startsAt > now) return "upcoming";
    if (event.endsAt <= now || !event.published) return "ended";
    return "active";
  })();

  const ticketTier = event?.ticketTier ?? "bronze";
  const ticketCount = tickets[ticketTier] ?? 0;
  const hasTicket = ticketCount >= 1;
  const hasActiveRun = Boolean(run && (run.status === "active" || run.status === "matchmaking"));
  const canEnter = availability === "active" && !isGuest && !economyLoading && (hasActiveRun || hasTicket);

  const enter = async () => {
    if (!event) return;
    setBusy(true);
    setMessage(null);
    try {
      const result = await command<{ runId: string }>("joinEvent", { eventId: event.eventId });
      setMessage({
        severity: "success",
        text: `Ta place est réservée — participation ${result.runId.slice(0, 8)}…`,
      });
      const stage0 = event.stages[0];
      rememberRunBeforeMatch(result.runId, 0, 0);
      withBossIntro(stage0, () => onStart?.(
        result.runId,
        event.mode,
        event.eventId,
        stage0 ? { title: stage0.title, playerCount: stage0.playerCount } : undefined,
      ));
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : "";
      const missingTicket = /ticket|insufficient/i.test(reason);
      setMessage({
        severity: missingTicket ? "warning" : "error",
        text: missingTicket
          ? "Il te manque le ticket demandé pour entrer dans ce Ter."
          : /unavailable|not-found/i.test(reason)
          ? "Ce rendez-vous du Ter n’est plus disponible."
          : "L’entrée dans le Ter a été refusée. Réessaie dans un instant.",
      });
    } finally {
      setBusy(false);
    }
  };

  const handlePrimaryAction = () => {
    if (!event) return;
    if (preview) {
      setMessage({ severity: "warning", text: "Aperçu admin : les actions sont désactivées." });
      return;
    }
    if (availability !== "active") return;
    if (isGuest) {
      setAuthModalOpen(true);
      return;
    }
    if (reviveOk) {
      void reviveRun();
      return;
    }
    if (hasActiveRun && run) {
      /* « matchmaking » = le run attend une table PvP : on (re)lance la
         recherche — startMatch remet le joueur dans la file de l'étape.
         Aucun ticket n'est redemandé tant que le parcours n'est pas fini. */
      const stage = event.stages[run.stageIndex] ?? event.stages[0];
      rememberRunBeforeMatch(run.id, run.stageIndex, run.losses, Number(run.score ?? 0));
      withBossIntro(stage, () => onStart?.(
        run.id,
        event.mode,
        event.eventId,
        stage ? { title: stage.title, playerCount: stage.playerCount } : undefined,
      ));
      return;
    }
    if (!hasTicket) {
      navigateTo("shop");
      return;
    }
    void enter();
  };

  /* État chargement ou introuvable */
  if ((contentLoading && !preview) || !event) {
    return (
      <GameShell active="events" dock={false} scroll={false} className={styles.scene} contentClassName={styles.frame}>
        <header className={styles.hudBar}>
          <div className={styles.hudLeft}>
            <button
              data-nj-skin="none"
              type="button"
              className={styles.backBtn}
              onClick={() => navigateTo("events")}
            >
              <span aria-hidden="true">←</span>
              <span>Événements</span>
            </button>
            <div className={styles.hudCopy}>
              <span className={styles.hudKicker}>Le Ter</span>
              <h1>{contentLoading ? "Chargement…" : "Événement introuvable"}</h1>
            </div>
          </div>
        </header>

        <div className={styles.fallbackCard}>
          <NjamboIcon name="trophy" tone="gold" size={44} />
          <strong>{contentLoading ? "Préparation du plateau de campagne…" : "Ce rendez-vous n’est plus disponible."}</strong>
          {(contentError || runsError) && <p>{runsError ?? contentError}</p>}
          {!contentLoading && (
            <button
              data-nj-skin="none"
              type="button"
              className={styles.fallbackBtn}
              onClick={() => navigateTo("events")}
            >
              Retour aux événements
            </button>
          )}
        </div>
      </GameShell>
    );
  }

  const art = eventArt(event).src;
  const isPvp = event.mode === "pvp";
  const lossesUsed = run?.losses ?? 0;
  const lossesLeft = Math.max(0, event.allowedLosses - lossesUsed);
  const activeStageIndex = run?.status === "eliminated" ? -1 : (run?.stageIndex ?? 0);
  const runCompleted = run?.status === "completed";

  /* Sauver une vie (phase 4) : règles du parcours (version figée à l'inscription). */
  const runVersion = run?.versionSnapshot ? normalizeEventVersion(run.versionSnapshot) : event;
  const reviveCheck = run && !preview ? canRevive(run, runVersion.revive, now) : null;
  const reviveOk = Boolean(reviveCheck?.ok) && availability === "active" && !isGuest;
  const caurisBalance = economy?.cauris ?? 0;
  const reviveCountdown = reviveCheck?.ok ? Math.max(0, reviveCheck.expiresAt - now) : 0;
  const reviveClock = `${Math.floor(reviveCountdown / 60_000)}:${String(Math.floor((reviveCountdown % 60_000) / 1000)).padStart(2, "0")}`;

  const reviveRun = async () => {
    if (!run || !reviveCheck?.ok) return;
    if (caurisBalance < reviveCheck.price) {
      setMessage({ severity: "warning", text: `Il te faut ${reviveCheck.price} cauris pour sauver une vie.` });
      navigateTo("shop");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      await command("reviveEventRun", { runId: run.id });
      setOutcome(null);
      setRevivedGemIndex(Math.max(0, event.allowedLosses - run.losses));
      window.setTimeout(() => setRevivedGemIndex(null), 1_800);
      setMessage({ severity: "success", text: `Une vie sauvée pour ${reviveCheck.price} cauris — ton parcours continue !` });
      void refreshEconomy();
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : "";
      setMessage({
        severity: "error",
        text: /WINDOW/.test(reason) ? "Trop tard : le délai pour sauver une vie est passé."
          : /LIMIT/.test(reason) ? "Tu as déjà utilisé tous les rachats de ce parcours."
          : /CAURIS/.test(reason) ? "Pas assez de cauris."
          : "Le rachat a échoué. Réessaie dans un instant.",
      });
    } finally {
      setBusy(false);
    }
  };

  const stageState = (idx: number): StageState => {
    if (!run) return idx === 0 ? "current" : "locked";
    if (runCompleted) return "completed";
    if (run.status === "eliminated") return idx < run.stageIndex ? "completed" : "locked";
    if (idx < run.stageIndex) return "completed";
    if (idx === run.stageIndex) return "current";
    return "locked";
  };

  const inspectedIndex = Math.min(selectedStageIndex, Math.max(0, event.stages.length - 1));
  const inspectedStage = event.stages[inspectedIndex] ?? event.stages[0];
  const inspectedState = stageState(inspectedIndex);
  const inspectedDiff = DIFFICULTY_META[inspectedStage.difficulty];

  const ctaContent = (() => {
    if (busy) return { title: "RÉSERVATION…", sub: "Validation du billet en cours" };
    if (availability === "upcoming") return { title: "BIENTÔT OUVERT", sub: eventDates(event) };
    if (availability === "ended") return { title: "ÉVÉNEMENT TERMINÉ", sub: "Rendez-vous au prochain tournoi" };
    if (isGuest) return { title: "SE CONNECTER", sub: "Sauvegarde ton parcours et utilise tes tickets" };
    if (reviveOk && reviveCheck) {
      return {
        title: `SAUVER UNE VIE · ${reviveCheck.price} CAURIS`,
        sub: `Encore ${reviveClock} · ${reviveCheck.remaining} rachat${reviveCheck.remaining > 1 ? "s" : ""} possible${reviveCheck.remaining > 1 ? "s" : ""}`,
      };
    }
    if (hasActiveRun && run) {
      const lives = `${lossesLeft} vie${lossesLeft > 1 ? "s" : ""} restante${lossesLeft > 1 ? "s" : ""}`;
      return {
        title: `CONTINUER · TABLE ${Math.min(activeStageIndex + 1, event.stages.length)}`,
        sub: isPvp ? `${lives} · file PvP · sans nouveau ticket` : `${lives} · sans nouveau ticket`,
      };
    }
    if (!hasTicket) {
      return {
        title: `OBTENIR UN TICKET ${ticketTier.toUpperCase()}`,
        sub: "Ouvrir la boutique du quartier",
      };
    }
    if (run?.status === "eliminated") {
      return {
        title: "RECOMMENCER · 1 TICKET",
        sub: `Nouveau parcours complet (${event.allowedLosses} vies)`,
      };
    }
    if (runCompleted) {
      return {
        title: "REJOUER LE PARCOURS · 1 TICKET",
        sub: "Grand prix déjà remporté — tente un nouveau parcours",
      };
    }
    return {
      title: isPvp ? "COMPOSTER 1 TICKET · FILE PvP" : "COMPOSTER 1 TICKET · ENTRER",
      sub: `1 ticket = tout le parcours · ${event.stages.length} tables · ${event.allowedLosses} vies`,
    };
  })();

  const ctaDisabled =
    busy ||
    Boolean(outcome) ||
    availability !== "active" ||
    (!isGuest && hasTicket && !canEnter && !reviveOk);

  const themeClass = isPvp ? styles.themeTeal : styles.themeGold;
  const mapBgStyle = { "--event-art": `url(${art})` } as CSSProperties;

  return (
    <GameShell
      active="events"
      dock={false}
      scroll={false}
      className={`${styles.scene} ${themeClass}`}
      contentClassName={styles.frame}
    >
      {/* ═══ 1. HUD HAUT COMPACT ═══ */}
      <header className={styles.hudBar}>
        <div className={styles.hudLeft}>
          <button
            data-nj-skin="none"
            type="button"
            className={styles.backBtn}
            onClick={() => navigateTo("events")}
            aria-label="Retour aux événements"
          >
            <span aria-hidden="true">←</span>
            <span className={styles.backLabel}>Événements</span>
          </button>

          <div className={styles.hudCopy}>
            <span className={styles.hudKicker}>{theme.label}</span>
            <h1>{event.title}</h1>
          </div>
        </div>

        <div className={styles.hudRight}>
          {/* Jetons de vies physiques */}
          <div className={styles.livesHudPill} title={`${lossesLeft} vie${lossesLeft > 1 ? "s" : ""} sur ${event.allowedLosses}`}>
            {Array.from({ length: event.allowedLosses }, (_, i) => (
              <span
                key={i}
                className={`${styles.lifeGem}${i < lossesLeft ? ` ${styles.lifeGemOn}` : ` ${styles.lifeGemOff}`}${i === breakingLifeIndex ? ` ${styles.lifeGemBreaking}` : ""}${i === revivedGemIndex ? ` ${styles.lifeGemReviving}` : ""}`}
                aria-hidden="true"
              >
                ♦
              </span>
            ))}
            <span className={styles.livesHudLabel}>{lossesLeft}/{event.allowedLosses}</span>
          </div>

          {/* Billet requis en stock */}
          <button
            data-nj-skin="none"
            type="button"
            className={`${styles.ticketHudPill} ${styles[`tier_${ticketTier}`]}`}
            onClick={() => navigateTo("shop")}
            aria-label={`Ticket ${ticketTier} en stock : ${ticketCount}`}
          >
            <Image src={TICKET_ART[ticketTier]} alt="" width={20} height={20} />
            <strong>×{ticketCount}</strong>
          </button>
        </div>
      </header>

      {/* Alertes ponctuelles */}
      {(message || contentError || runsError) && (
        <div
          className={`${styles.bannerToast} ${styles[`toast_${message?.severity ?? "warning"}`]}`}
          role="alert"
        >
          {message?.text ?? runsError ?? contentError}
        </div>
      )}

      {/* ═══ 2. ARÈNE CAMPAGNE : PLATEAU DE MINI-TABLES + CONSOLE INSPECTEUR ═══ */}
      <div className={styles.campaignGrid}>
        {/* ─── GAUCHE (DESKTOP) / HAUT (MOBILE) : PLATEAU DE MINI-TABLES RELIÉES ─── */}
        <section className={styles.mapBoard} style={mapBgStyle} aria-label="Plateau de campagne des tables">
          <div className={styles.mapArtLayer} aria-hidden="true" />
          <div className={styles.mapVignette} aria-hidden="true" />

          {/* En-tête du plateau */}
          <div className={styles.mapHeader}>
            <span className={styles.mapModePill}>
              <NjamboIcon name={isPvp ? "users" : "bot"} tone={isPvp ? "teal" : "gold"} size={15} />
              <span>{isPvp ? "Tournoi PvP" : "Campagne IA"} · {countdown && countdown.phase !== "ended" ? countdown.label : eventDates(event)}</span>
            </span>
            {countdown?.endingSoon && <span className={styles.endingSoonPill} role="status">Dernières heures !</span>}
            {rankingEnabled ? (
              <span className={styles.viewSwitch} role="tablist" aria-label="Affichage">
                <button data-nj-skin="none" type="button" role="tab" aria-selected={boardView === "path"} onClick={() => setBoardView("path")}>Parcours</button>
                <button data-nj-skin="none" type="button" role="tab" aria-selected={boardView === "ranking"} onClick={() => setBoardView("ranking")}>
                  Classement{leaderboard?.me ? ` · ${leaderboard.me.rank}e` : ""}
                </button>
              </span>
            ) : (
              <span className={styles.mapHintPill}>Touche une table pour l&apos;inspecter</span>
            )}
          </div>

          {boardView === "ranking" && rankingEnabled ? (
            <EventLeaderboardPanel
              event={event}
              uid={user?.uid ?? null}
              data={leaderboard}
              error={leaderboardError}
              reload={() => void reloadLeaderboard()}
              preview={preview}
            />
          ) : (
          /* Sentier sinueux (Desktop) / Frise horizontale (Mobile) des mini-tables ovales */
          <div className={styles.trailViewport}>
            <ol className={styles.trailList} aria-label="Étapes du parcours">
              {event.stages.map((stage, idx) => {
                const state = stageState(idx);
                const selected = idx === inspectedIndex;
                const diff = DIFFICULTY_META[stage.difficulty];
                const isBoss = Boolean(stage.boss) || idx === event.stages.length - 1;
                const laneClass = idx % 2 === 0 ? styles.laneLeft : styles.laneRight;
                const firstReward = stage.reward[0] ? rewardVisual(stage.reward[0]) : null;

                return (
                  <li
                    key={stage.id}
                    className={`${styles.trailItem} ${laneClass}`}
                    aria-current={state === "current" ? "step" : undefined}
                  >
                    <button
                      data-nj-skin="none"
                      type="button"
                      aria-pressed={selected}
                      className={`${styles.tableNodeBtn} ${styles[`state_${state}`]}${selected ? ` ${styles.nodeSelected}` : ""}${isBoss ? ` ${styles.nodeBoss}` : ""}${idx === freshUnlockIndex ? ` ${styles.nodeJustUnlocked}` : ""}`}
                      onClick={() => setSelectedStageIndex(idx)}
                      aria-label={`Table ${stage.order} : ${stage.title}, ${diff.label}, ${stage.playerCount} joueurs`}
                    >
                      {/* Étiquette flottante "PROCHAINE" sur l'étape active */}
                      {state === "current" && (
                        <span className={styles.nextBadge}>
                          {run ? "EN COURS" : "DÉPART"}
                        </span>
                      )}

                      {/* Mini table ovale 3D acajou & émeraude */}
                      <span className={styles.miniTableShell}>
                        {/* Sièges lumineux autour de la mini-table */}
                        <span className={`${styles.miniSeatDot} ${styles.msN}`} aria-hidden="true" />
                        <span className={`${styles.miniSeatDot} ${styles.msS}`} aria-hidden="true" />
                        {stage.playerCount >= 3 && (
                          <span className={`${styles.miniSeatDot} ${styles.msW}`} aria-hidden="true" />
                        )}
                        {stage.playerCount >= 4 && (
                          <span className={`${styles.miniSeatDot} ${styles.msE}`} aria-hidden="true" />
                        )}

                        <span className={styles.miniTableFelt}>
                          <span className={styles.miniFeltCards} aria-hidden="true">
                            <span className={styles.miniCardChip} />
                            <span className={styles.miniCardChip} />
                          </span>
                          <span className={styles.miniStageMedal}>
                            {state === "completed" ? "✓" : isBoss ? "👑" : stage.order}
                          </span>
                        </span>
                      </span>

                      {/* Légende compacte sous la mini-table */}
                      <span className={styles.nodeCaption}>
                        <strong className={styles.nodeTitle}>{stage.title}</strong>
                        <span className={styles.nodeSubRow}>
                          <span className={`${styles.nodeStars} ${styles[diff.className]}`}>
                            {diff.stars}
                          </span>
                          {firstReward && (
                            <span className={styles.nodeLoot}>+{firstReward.label}</span>
                          )}
                        </span>
                      </span>
                    </button>

                    {/* Connecteur doré vers l'étape suivante */}
                    <span
                      className={`${styles.goldenWire}${state === "completed" ? ` ${styles.goldenWireLit}` : ""}${freshUnlockIndex !== null && idx === freshUnlockIndex - 1 ? ` ${styles.goldenWireIgnite}` : ""}`}
                      aria-hidden="true"
                    />
                  </li>
                );
              })}

              {/* ── SOMMET DU SENTIER : PIÉDESTAL DU COFFRE GRAND PRIX ── */}
              <li className={`${styles.trailItem} ${styles.laneCenter}`}>
                <div className={styles.grandPrizePedestal} aria-label="Coffre du Grand Prix final">
                  <span className={styles.pedestalGlow} aria-hidden="true" />
                  <span className={styles.pedestalCrown}>GRAND PRIX</span>
                  <div className={styles.pedestalLootIcons}>
                    {event.finalReward.map((reward, rIdx) => {
                      const vis = rewardVisual(reward);
                      return (
                        <span key={rIdx} className={styles.pedestalLootItem}>
                          <Image src={vis.src} unoptimized={vis.src.startsWith("http")} alt="" width={30} height={30} />
                          <strong>{vis.label}</strong>
                        </span>
                      );
                    })}
                  </div>
                </div>
              </li>
            </ol>
          </div>
          )}
        </section>

        {/* ─── DROITE (DESKTOP) / BAS (MOBILE) : CONSOLE INSPECTEUR + BILLET + CTA ─── */}
        <section className={styles.consolePane} aria-label="Détail de la table et participation">
          {/* 1. INSPECTEUR DE LA TABLE SÉLECTIONNÉE */}
          <article className={styles.inspectorCard}>
            <div className={styles.inspectorTop}>
              <span className={styles.inspectorStepTag}>
                Table {inspectedStage.order} / {event.stages.length}
              </span>
              <span className={`${styles.inspectorStatePill} ${styles[`pill_${inspectedState}`]}`}>
                {inspectedState === "completed"
                  ? "Validée ✓"
                  : inspectedState === "current"
                  ? "Prochaine table"
                  : "À débloquer"}
              </span>
            </div>

            <h2 className={styles.inspectorTitle}>{inspectedStage.title}</h2>

            {/* Éléments physiques de cette étape */}
            <div className={styles.inspectorSpecs}>
              <span className={`${styles.specCrest} ${styles[inspectedDiff.className]}`}>
                <span className={styles.specStars}>{inspectedDiff.stars}</span>
                <strong>{inspectedDiff.label}</strong>
              </span>

              <span className={styles.specPill}>
                <NjamboIcon name={isPvp ? "users" : "bot"} tone={isPvp ? "teal" : "gold"} size={15} />
                <span>{inspectedStage.playerCount} joueurs</span>
              </span>

              {inspectedStage.crownsEnabled && (
                <span className={`${styles.specPill} ${styles.specGold}`}>
                  <NjamboIcon name="crown" tone="gold" size={14} />
                  <span>Couronnes</span>
                </span>
              )}

              {inspectedStage.powersAllowed && !inspectedStage.modifiers.includes("no_powers") && (
                <span className={styles.specPill}>
                  <NjamboIcon name="sparkle" tone="cobalt" size={14} />
                  <span>Pouvoirs</span>
                </span>
              )}
              {(inspectedStage.modifiers.includes("no_powers") || !inspectedStage.powersAllowed) && (
                <span className={`${styles.specPill} ${styles.specRule}`}>🚫 Sans pouvoirs</span>
              )}
              {inspectedStage.modifiers.includes("double_stake") && (
                <span className={`${styles.specPill} ${styles.specRule}`}>×2 Mise doublée</span>
              )}
              {inspectedStage.modifiers.includes("turn_timer") && (
                <span className={`${styles.specPill} ${styles.specRule}`}>⏱ {inspectedStage.turnTimerSeconds ?? 15} s par tour</span>
              )}
              {inspectedStage.boss && (
                <span className={`${styles.specPill} ${styles.specBoss}`}>👑 Boss : {inspectedStage.boss.name}</span>
              )}
            </div>

            {/* Récompense de l'étape inspectée */}
            <div className={styles.stageLootBox}>
              <small>Récompense de cette table</small>
              <div className={styles.stageLootChips}>
                {inspectedStage.reward.map((reward, rIdx) => {
                  const vis = rewardVisual(reward);
                  return (
                    <span key={rIdx} className={styles.lootChip}>
                      <Image src={vis.src} unoptimized={vis.src.startsWith("http")} alt="" width={22} height={22} />
                      <strong>{vis.label}</strong>
                    </span>
                  );
                })}
              </div>
            </div>
          </article>

          {/* 2. SOUCHE DE BILLET PERFORÉ + VIES & PROGRESSION */}
          <div className={`${styles.ticketStubCard} ${styles[`stub_${ticketTier}`]}`}>
            <span className={styles.stubNotchL} aria-hidden="true" />
            <span className={styles.stubNotchR} aria-hidden="true" />

            <div className={styles.stubLeft}>
              <Image src={TICKET_ART[ticketTier]} alt="" width={34} height={34} />
              <div className={styles.stubCopy}>
                <small>Droit d&apos;entrée</small>
                <strong>Ticket {ticketTier}</strong>
                <span className={hasTicket ? styles.stockOk : styles.stockLow}>
                  {isGuest
                    ? "Compte requis"
                    : hasTicket
                    ? `En stock : ×${ticketCount}`
                    : "Aucun en stock"}
                </span>
              </div>
            </div>

            <div className={styles.stubRight}>
              {run ? (
                <div className={styles.runMiniStatus}>
                  <small>Ta série</small>
                  <strong>
                    {run.status === "eliminated"
                      ? "Éliminé"
                      : runCompleted
                      ? "Grand prix ✓"
                      : `Étape ${Math.min(activeStageIndex + 1, event.stages.length)}/${event.stages.length}`}
                  </strong>
                  <span className={styles.runMiniTrack}>
                    <span
                      style={{
                        width: runCompleted ? "100%" : `${Math.min(100, (Math.max(0, activeStageIndex) / event.stages.length) * 100)}%`,
                      }}
                    />
                  </span>
                </div>
              ) : !isGuest && !hasTicket ? (
                <button
                  data-nj-skin="none"
                  type="button"
                  className={styles.buyStubBtn}
                  onClick={() => navigateTo("shop")}
                >
                  + Boutique
                </button>
              ) : (
                <div className={styles.livesStubSummary}>
                  <small>Tolérance</small>
                  <strong>{event.allowedLosses} vies</strong>
                  <span>avant élimination</span>
                </div>
              )}
            </div>
          </div>

          {/* 3. GROS BOUTON 3D D'ACTION */}
          <button
            data-nj-skin="none"
            type="button"
            disabled={ctaDisabled}
            className={styles.actionCta}
            onClick={handlePrimaryAction}
          >
            <span className={styles.ctaSheen} aria-hidden="true" />
            <span className={styles.ctaIcon} aria-hidden="true">
              <NjamboIcon
                name={busy ? "hourglass" : isGuest ? "profile" : !hasTicket && !hasActiveRun ? "coin" : "play"}
                tone={isPvp ? "teal" : "gold"}
                size={24}
              />
            </span>
            <span className={styles.ctaCopy}>
              <strong>{ctaContent.title}</strong>
              <small>{ctaContent.sub}</small>
            </span>
            <span className={styles.ctaArrow} aria-hidden="true">→</span>
          </button>
        </section>
      </div>

      {bossIntro && (
        <EventBossIntro
          stage={bossIntro.stage}
          onDone={() => { const start = bossIntro.start; setBossIntro(null); start(); }}
        />
      )}

      {outcome && (
        <EventOutcomeOverlay
          outcome={outcome}
          event={event}
          tone={isPvp ? "teal" : "gold"}
          ranking={rankingEnabled ? { rank: leaderboard?.me?.rank ?? null, previousRank: rankBefore } : undefined}
          revive={outcome.kind === "eliminated" && reviveOk && reviveCheck ? {
            price: reviveCheck.price,
            clock: reviveClock,
            remaining: reviveCheck.remaining,
            affordable: caurisBalance >= reviveCheck.price,
            busy,
            onRevive: () => void reviveRun(),
          } : undefined}
          onClose={() => setOutcome(null)}
          onContinue={outcome.kind === "advance" || outcome.kind === "life_lost"
            ? () => { setOutcome(null); handlePrimaryAction(); }
            : undefined}
        />
      )}

      {/* Modale connexion en place (zéro sortie du plateau) */}
      <GameModal
        open={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        kicker={event.title}
        title="Connecte-toi pour entrer"
        tone={isPvp ? "teal" : "gold"}
      >
        <AuthGate tone={isPvp ? "teal" : "gold"} accountBar="none">
          <div className={styles.authDone}>Compte connecté ! Tu peux composter ton billet.</div>
        </AuthGate>
      </GameModal>
    </GameShell>
  );
}
