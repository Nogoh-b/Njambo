"use client";

import Image from "next/image";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  countStoredCollectionItems,
  formatEnergyDuration,
  type Reward,
  type StoredPack,
  type TicketTier,
} from "@/domain";
import { useAuth } from "@/hooks/useAuth";
import { useEconomy } from "@/contexts/EconomyContext";
import { useGame } from "@/contexts/GameContext";
import { useLiveOpsContent } from "@/hooks/useLiveOpsContent";
import { useMotionProfile } from "@/lib/motion";
import { POWER_CARDS_BY_ID } from "@/config/powerCards";
import { CATEGORY_MOTIF_PALETTE } from "@/components/power/PowerCardMotif";
import { PowerCardView } from "@/components/power/PowerCardView";
import { GameModal } from "@/components/ui/GameModal";
import { NjamboIcon } from "@/components/ui/Art";
import {
  BOOSTER_RARITY_LABELS,
  TICKET_TIERS_META,
  boosterBookArt,
  boosterBookTitle,
  packArt,
  rewardDeliveryNote,
  rewardIconSrc,
  rewardLabel,
} from "@/lib/shopVisuals";
import type { PowerCardId } from "@/types/game";
import styles from "./CollectionItems.module.css";

type ItemFilter = "all" | "packs" | "books" | "energy" | "tickets";

type SelectedItem =
  | { kind: "pack"; pack: StoredPack }
  | { kind: "book"; boosterId: string; count: number }
  | { kind: "energy"; durationMinutes: number; count: number }
  | { kind: "ticket"; tier: TicketTier; count: number };

interface PackReveal {
  title: string;
  offerId: string;
  rewards: Reward[];
}

interface CardReveal {
  cardId: string;
  rarity: string;
  duplicateCompensation: number;
}

interface EnergyActivated {
  durationMinutes: number;
  unlimitedUntil: number;
}

interface CollectionItemsProps {
  compact?: boolean;
  onNavigateAway?: () => void;
}

const SPARK_POSITIONS = [
  { top: "14%", left: "18%", delay: "0s" },
  { top: "22%", left: "82%", delay: "0.45s" },
  { top: "74%", left: "14%", delay: "0.9s" },
  { top: "70%", left: "86%", delay: "1.35s" },
  { top: "10%", left: "54%", delay: "0.7s" },
  { top: "82%", left: "52%", delay: "1.1s" },
] as const;

const BURST_PARTICLES = Array.from({ length: 12 }, (_, idx) => {
  const angle = (idx * 30 * Math.PI) / 180;
  return {
    id: idx,
    x: Math.round(Math.cos(angle) * 96),
    y: Math.round(Math.sin(angle) * 96),
    size: idx % 2 === 0 ? 8 : 5,
    delay: (idx % 3) * 0.04,
  };
});

function formatRemaining(until: number, now: number): string {
  const diffMin = Math.max(1, Math.ceil((until - now) / 60_000));
  if (diffMin < 60) return `${diffMin} min`;
  const h = Math.floor(diffMin / 60);
  const m = diffMin % 60;
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, "0")}`;
}

function waitMs(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function rewardToneClass(reward: Reward): string {
  if (reward.type === "nkap") return styles.lotGold;
  if (reward.type === "cauris") return styles.lotPink;
  if (reward.type === "energy_pass") return styles.lotTeal;
  if (reward.type === "ticket") return styles.lotOrange;
  if (reward.type === "booster_book") return styles.lotPurple;
  return styles.lotGold;
}

function rewardTargetTag(reward: Reward): string {
  if (reward.type === "nkap" || reward.type === "cauris") return "Portefeuille";
  if (reward.type === "cosmetic") return "Cosmétiques";
  if (reward.type === "card") return "Cartes Pouvoir";
  return "Ma collection";
}

export function CollectionItems({ compact = false, onNavigateAway }: CollectionItemsProps) {
  const { user } = useAuth();
  const { economy, inventory, command, pendingBoosterOpening } = useEconomy();
  const { navigateTo, setEventDetailId } = useGame();
  const { boosters, events } = useLiveOpsContent();
  const motionProfile = useMotionProfile();

  const [filter, setFilter] = useState<ItemFilter>("all");
  const [selected, setSelected] = useState<SelectedItem | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [openingCharge, setOpeningCharge] = useState<"pack" | "book" | "energy" | null>(null);
  const [notice, setNotice] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [packReveal, setPackReveal] = useState<PackReveal | null>(null);
  const [bookOpening, setBookOpening] = useState<{ openingId: string; boosterId: string; positions: number[] } | null>(null);
  const [cardReveal, setCardReveal] = useState<CardReveal | null>(null);
  const [energyActivated, setEnergyActivated] = useState<EnergyActivated | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const isGuest = !user || user.isAnonymous === true;
  const cascadeOn = motionProfile.allowEntranceCascade;
  const loopsOn = motionProfile.allowDecorativeLoop;

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const counts = useMemo(() => countStoredCollectionItems(inventory), [inventory]);

  const packs = useMemo<StoredPack[]>(
    () => (Array.isArray(inventory.packs) ? inventory.packs : []),
    [inventory.packs],
  );

  const ownedBooks = useMemo(
    () =>
      Object.entries(inventory.boosterBooks ?? {})
        .map(([boosterId, count]) => ({ boosterId, count: Number(count ?? 0) }))
        .filter((entry) => entry.count > 0),
    [inventory.boosterBooks],
  );

  const ownedEnergyPasses = useMemo(
    () =>
      Object.entries(inventory.energyPasses ?? {})
        .map(([minutesKey, count]) => ({
          durationMinutes: Number(minutesKey),
          count: Number(count ?? 0),
        }))
        .filter((entry) => Number.isFinite(entry.durationMinutes) && entry.durationMinutes > 0 && entry.count > 0)
        .sort((a, b) => a.durationMinutes - b.durationMinutes),
    [inventory.energyPasses],
  );

  const ownedTickets = useMemo(
    () =>
      (["bronze", "argent", "or"] as const)
        .map((tier) => ({ tier, count: Number(inventory.tickets?.[tier] ?? 0) }))
        .filter((entry) => entry.count > 0),
    [inventory.tickets],
  );

  const liveEvents = useMemo(
    () => events.filter((event) => event.published && event.startsAt <= now && event.endsAt > now),
    [events, now],
  );

  const goShop = () => {
    onNavigateAway?.();
    navigateTo("shop");
  };

  const goEvents = (eventId?: string) => {
    if (eventId) setEventDetailId(eventId);
    onNavigateAway?.();
    navigateTo(eventId ? "event_detail" : "events");
  };

  const handleOpenPack = async (pack: StoredPack) => {
    setBusy(`pack:${pack.packInstanceId}`);
    setOpeningCharge("pack");
    setNotice(null);
    try {
      const [result] = await Promise.all([
        command<{ title: string; rewards: Reward[] }>("openPack", {
          packInstanceId: pack.packInstanceId,
        }),
        waitMs(motionProfile.enabled ? 820 : 0),
      ]);
      setOpeningCharge(null);
      setSelected(null);
      setPackReveal({
        title: result.title || pack.title,
        offerId: pack.offerId,
        rewards: result.rewards ?? [],
      });
      setNotice({ kind: "success", text: `${pack.title} ouvert ! Tes objets sont prêts dans Ma collection.` });
    } catch (cause) {
      setOpeningCharge(null);
      const msg = cause instanceof Error ? cause.message : "";
      setNotice({
        kind: "error",
        text: /PACK_ALREADY_OPENED/i.test(msg)
          ? "Ce pack a déjà été ouvert."
          : "Impossible d’ouvrir ce pack pour le moment.",
      });
    } finally {
      setBusy(null);
    }
  };

  const handleOpenBook = async (boosterId: string) => {
    setBusy(`book:${boosterId}`);
    setOpeningCharge("book");
    setNotice(null);
    try {
      const [result] = await Promise.all([
        command<{ openingId: string; positions: number[] }>("openBoosterBook", {
          boosterId,
          requireOwned: true,
        }),
        waitMs(motionProfile.enabled ? 680 : 0),
      ]);
      setOpeningCharge(null);
      setSelected(null);
      setBookOpening({
        openingId: result.openingId,
        boosterId,
        positions: result.positions ?? Array.from({ length: 9 }, (_, i) => i),
      });
    } catch (cause) {
      setOpeningCharge(null);
      const msg = cause instanceof Error ? cause.message : "";
      setNotice({
        kind: "error",
        text: /BOOSTER_NOT_OWNED/i.test(msg)
          ? "Tu n’as plus ce livre en stock."
          : "Impossible d’ouvrir ce livre pour le moment.",
      });
    } finally {
      setBusy(null);
    }
  };

  const handleChooseBookCard = async (position: number) => {
    if (!bookOpening) return;
    setBusy(`pick:${position}`);
    setNotice(null);
    try {
      const [result] = await Promise.all([
        command<{ reward: { cardId: string; rarity: string }; duplicateCompensation: number }>(
          "chooseBoosterCard",
          { openingId: bookOpening.openingId, position },
        ),
        waitMs(motionProfile.enabled ? 360 : 0),
      ]);
      setBookOpening(null);
      setCardReveal({
        cardId: result.reward.cardId,
        rarity: result.reward.rarity,
        duplicateCompensation: Number(result.duplicateCompensation ?? 0),
      });
    } catch {
      setNotice({ kind: "error", text: "Impossible de révéler cette carte. Réessaie." });
    } finally {
      setBusy(null);
    }
  };

  const handleUseEnergyPass = async (durationMinutes: number) => {
    setBusy(`energy:${durationMinutes}`);
    setOpeningCharge("energy");
    setNotice(null);
    try {
      const [result] = await Promise.all([
        command<{ durationMinutes: number; unlimitedUntil: number }>("useEnergyPass", { durationMinutes }),
        waitMs(motionProfile.enabled ? 620 : 0),
      ]);
      setOpeningCharge(null);
      setSelected(null);
      setEnergyActivated({
        durationMinutes,
        unlimitedUntil: Number(result.unlimitedUntil ?? Date.now() + durationMinutes * 60_000),
      });
      setNotice({
        kind: "success",
        text: `Pass Énergie ${formatEnergyDuration(durationMinutes)} activé ! Ton énergie est illimitée.`,
      });
    } catch (cause) {
      setOpeningCharge(null);
      const msg = cause instanceof Error ? cause.message : "";
      setNotice({
        kind: "error",
        text: /ENERGY_PASS_NOT_OWNED/i.test(msg)
          ? "Tu n’as plus ce pass énergie en stock."
          : "Impossible d’activer ce pass pour le moment.",
      });
    } finally {
      setBusy(null);
    }
  };

  const selectedBoosterDef = useMemo(() => {
    if (selected?.kind !== "book") return undefined;
    return boosters.find((b) => b.id === selected.boosterId);
  }, [boosters, selected]);

  const revealedPowerCard = cardReveal ? POWER_CARDS_BY_ID[cardReveal.cardId as PowerCardId] : undefined;

  if (isGuest) {
    return (
      <div className={`${styles.wrap}${compact ? ` ${styles.compact}` : ""}`}>
        <div className={styles.emptyState}>
          <NjamboIcon name="profile" tone="teal" size={32} />
          <strong>Connecte ton compte pour gérer tes objets</strong>
          <p>
            Tes packs scellés, livres, pass énergie et tickets du Ter sont sauvegardés dans Ma collection dès que tu es connecté.
          </p>
        </div>
      </div>
    );
  }

  const showPacks = filter === "all" || filter === "packs";
  const showBooks = filter === "all" || filter === "books";
  const showEnergy = filter === "all" || filter === "energy";
  const showTickets = filter === "all" || filter === "tickets";

  const visibleCount =
    (showPacks ? packs.length : 0) +
    (showBooks ? ownedBooks.length : 0) +
    (showEnergy ? ownedEnergyPasses.length : 0) +
    (showTickets ? ownedTickets.length : 0);

  let cardIndex = 0;

  return (
    <div className={`${styles.wrap}${compact ? ` ${styles.compact}` : ""}${!loopsOn ? ` ${styles.motionReduced}` : ""}`}>
      {pendingBoosterOpening && !bookOpening && (
        <motion.div
          initial={cascadeOn ? { opacity: 0, y: -8 } : false}
          animate={{ opacity: 1, y: 0 }}
          className={styles.pendingBanner}
          role="status"
        >
          <span>Un {boosterBookTitle(pendingBoosterOpening.boosterId, boosters)} attend ton choix de carte !</span>
          <button
            data-nj-skin="none"
            type="button"
            className={styles.pendingBtn}
            onClick={() => setBookOpening(pendingBoosterOpening)}
          >
            Choisir ma carte
          </button>
        </motion.div>
      )}

      <AnimatePresence>
        {notice && (
          <motion.div
            key={notice.text}
            initial={cascadeOn ? { opacity: 0, y: -6, scale: 0.97 } : false}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6 }}
            className={`${styles.notice} ${styles[`notice_${notice.kind}`]}`}
            role="status"
          >
            <span>{notice.text}</span>
            <button data-nj-skin="none" type="button" onClick={() => setNotice(null)} aria-label="Fermer">✕</button>
          </motion.div>
        )}
      </AnimatePresence>

      <nav className={styles.filterRow} role="tablist" aria-label="Catégories d'objets">
        {(
          [
            { id: "all", label: "Tout", count: counts.total },
            { id: "packs", label: "Packs", count: counts.packs },
            { id: "books", label: "Livres", count: counts.books },
            { id: "energy", label: "Énergie", count: counts.energy },
            { id: "tickets", label: "Tickets", count: counts.tickets },
          ] as Array<{ id: ItemFilter; label: string; count: number }>
        ).map((pill) => {
          const active = filter === pill.id;
          return (
            <button
              key={pill.id}
              data-nj-skin="none"
              type="button"
              role="tab"
              aria-selected={active}
              className={`${styles.filterPill}${active ? ` ${styles.filterPillActive}` : ""}`}
              onClick={() => setFilter(pill.id)}
            >
              <span>{pill.label}</span>
              <span className={styles.filterCount}>{pill.count}</span>
            </button>
          );
        })}
      </nav>

      <div className={styles.scrollArea}>
        {visibleCount === 0 ? (
          <motion.div
            initial={cascadeOn ? { opacity: 0, scale: 0.96 } : false}
            animate={{ opacity: 1, scale: 1 }}
            className={styles.emptyState}
          >
            <NjamboIcon name="coin" tone="gold" size={34} />
            <strong>
              {counts.total === 0 ? "Aucun objet en réserve" : "Aucun objet dans cette catégorie"}
            </strong>
            <p>
              Les packs, livres, pass énergie et tickets achetés en boutique ou gagnés en jeu apparaissent ici. Clique dessus quand tu veux les ouvrir ou les activer.
            </p>
            <button data-nj-skin="none" type="button" className={styles.emptyCta} onClick={goShop}>
              Aller à la boutique →
            </button>
          </motion.div>
        ) : (
          <div className={styles.grid}>
            {/* PACKS SCELLÉS */}
            {showPacks &&
              packs.map((pack) => {
                const idx = cardIndex++;
                return (
                  <motion.button
                    key={pack.packInstanceId}
                    data-nj-skin="none"
                    type="button"
                    initial={cascadeOn ? { opacity: 0, y: 14, scale: 0.94 } : false}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ type: "spring", stiffness: 340, damping: 25, delay: cascadeOn ? Math.min(idx * 0.035, 0.25) : 0 }}
                    className={`${styles.itemCard} ${styles.tonePack}`}
                    onClick={() => setSelected({ kind: "pack", pack })}
                  >
                    <span className={styles.cardSheen} aria-hidden="true" />
                    <div className={styles.cardTop}>
                      <span className={styles.kindChip}>Pack</span>
                      <span className={styles.qtyBadge}>Scellé</span>
                    </div>
                    <div className={styles.artWrap}>
                      <span className={styles.artHalo} aria-hidden="true" />
                      <Image src={packArt(pack.offerId, 256)} alt={pack.title} width={74} height={74} className={styles.artImg} />
                      <span className={styles.artPedestal} aria-hidden="true" />
                    </div>
                    <strong className={styles.itemTitle}>{pack.title}</strong>
                    <span className={styles.itemActionPill}>Ouvrir ✦</span>
                  </motion.button>
                );
              })}

            {/* LIVRES DE BOOSTERS */}
            {showBooks &&
              ownedBooks.map(({ boosterId, count }) => {
                const idx = cardIndex++;
                return (
                  <motion.button
                    key={`book-${boosterId}`}
                    data-nj-skin="none"
                    type="button"
                    initial={cascadeOn ? { opacity: 0, y: 14, scale: 0.94 } : false}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ type: "spring", stiffness: 340, damping: 25, delay: cascadeOn ? Math.min(idx * 0.035, 0.25) : 0 }}
                    className={`${styles.itemCard} ${boosterId === "exceptionnel" ? styles.toneBookGold : styles.toneBook}`}
                    onClick={() => setSelected({ kind: "book", boosterId, count })}
                  >
                    <span className={styles.cardSheen} aria-hidden="true" />
                    <div className={styles.cardTop}>
                      <span className={styles.kindChip}>Livre</span>
                      <span className={styles.qtyBadge}>×{count}</span>
                    </div>
                    <div className={styles.artWrap}>
                      <span className={styles.artHalo} aria-hidden="true" />
                      <Image src={boosterBookArt(boosterId, 256)} alt={boosterBookTitle(boosterId, boosters)} width={74} height={74} className={styles.artImg} />
                      <span className={styles.artPedestal} aria-hidden="true" />
                    </div>
                    <strong className={styles.itemTitle}>{boosterBookTitle(boosterId, boosters)}</strong>
                    <span className={styles.itemActionPill}>Ouvrir ✦</span>
                  </motion.button>
                );
              })}

            {/* PASS ÉNERGIE */}
            {showEnergy &&
              ownedEnergyPasses.map(({ durationMinutes, count }) => {
                const idx = cardIndex++;
                return (
                  <motion.button
                    key={`energy-${durationMinutes}`}
                    data-nj-skin="none"
                    type="button"
                    initial={cascadeOn ? { opacity: 0, y: 14, scale: 0.94 } : false}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ type: "spring", stiffness: 340, damping: 25, delay: cascadeOn ? Math.min(idx * 0.035, 0.25) : 0 }}
                    className={`${styles.itemCard} ${styles.toneEnergy}`}
                    onClick={() => setSelected({ kind: "energy", durationMinutes, count })}
                  >
                    <span className={styles.cardSheen} aria-hidden="true" />
                    <div className={styles.cardTop}>
                      <span className={styles.kindChip}>Énergie</span>
                      <span className={styles.qtyBadge}>×{count}</span>
                    </div>
                    <div className={styles.artWrap}>
                      <span className={styles.artHalo} aria-hidden="true" />
                      <Image src="/assets/njambo/economy/energy-flask-256.webp" alt="" width={74} height={74} className={styles.artImg} />
                      <span className={styles.artPedestal} aria-hidden="true" />
                    </div>
                    <strong className={styles.itemTitle}>Énergie {formatEnergyDuration(durationMinutes)}</strong>
                    <span className={styles.itemActionPill}>Activer ⚡</span>
                  </motion.button>
                );
              })}

            {/* TICKETS DU TER */}
            {showTickets &&
              ownedTickets.map(({ tier, count }) => {
                const idx = cardIndex++;
                const meta = TICKET_TIERS_META[tier];
                return (
                  <motion.button
                    key={`ticket-${tier}`}
                    data-nj-skin="none"
                    type="button"
                    initial={cascadeOn ? { opacity: 0, y: 14, scale: 0.94 } : false}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ type: "spring", stiffness: 340, damping: 25, delay: cascadeOn ? Math.min(idx * 0.035, 0.25) : 0 }}
                    className={`${styles.itemCard} ${styles.toneTicket}`}
                    onClick={() => setSelected({ kind: "ticket", tier, count })}
                  >
                    <span className={styles.cardSheen} aria-hidden="true" />
                    <div className={styles.cardTop}>
                      <span className={styles.kindChip}>Ticket</span>
                      <span className={styles.qtyBadge}>×{count}</span>
                    </div>
                    <div className={styles.artWrap}>
                      <span className={styles.artHalo} aria-hidden="true" />
                      <Image src={meta.art256} alt={meta.label} width={74} height={74} className={styles.artImg} />
                      <span className={styles.artPedestal} aria-hidden="true" />
                    </div>
                    <strong className={styles.itemTitle}>{meta.label}</strong>
                    <span className={styles.itemActionPill}>Utiliser →</span>
                  </motion.button>
                );
              })}
          </div>
        )}
      </div>

      {/* ═══ MODALE DÉTAIL & OUVERTURE ANIMÉE DE L'OBJET SÉLECTIONNÉ ═══ */}
      <GameModal
        open={selected !== null}
        onClose={() => {
          if (!openingCharge) setSelected(null);
        }}
        size="md"
        className={!loopsOn ? styles.motionReduced : undefined}
        kicker={
          selected?.kind === "pack"
            ? "Pack scellé · Ma collection"
            : selected?.kind === "book"
            ? "Livre de Pouvoirs · Ma collection"
            : selected?.kind === "energy"
            ? "Pass Énergie · Ma collection"
            : selected?.kind === "ticket"
            ? "Ticket du Ter · Ma collection"
            : ""
        }
        title={
          selected?.kind === "pack"
            ? selected.pack.title
            : selected?.kind === "book"
            ? boosterBookTitle(selected.boosterId, boosters)
            : selected?.kind === "energy"
            ? `Énergie illimitée ${formatEnergyDuration(selected.durationMinutes)}`
            : selected?.kind === "ticket"
            ? TICKET_TIERS_META[selected.tier].label
            : ""
        }
        tone={selected?.kind === "energy" ? "teal" : "gold"}
        footer={
          selected?.kind === "pack" ? (
            <button
              data-nj-skin="none"
              type="button"
              disabled={busy !== null}
              className={styles.primaryActionBtn}
              onClick={() => void handleOpenPack(selected.pack)}
            >
              <span className={styles.btnSheen} aria-hidden="true" />
              <span>{busy === `pack:${selected.pack.packInstanceId}` ? "Ouverture du pack…" : "Ouvrir le pack maintenant"}</span>
            </button>
          ) : selected?.kind === "book" ? (
            <button
              data-nj-skin="none"
              type="button"
              disabled={busy !== null}
              className={styles.primaryActionBtn}
              onClick={() => void handleOpenBook(selected.boosterId)}
            >
              <span className={styles.btnSheen} aria-hidden="true" />
              <span>{busy === `book:${selected.boosterId}` ? "Invocation du grimoire…" : "Ouvrir 1 livre (choisir 1 carte / 9)"}</span>
            </button>
          ) : selected?.kind === "energy" ? (
            <button
              data-nj-skin="none"
              type="button"
              disabled={busy !== null}
              className={`${styles.primaryActionBtn} ${styles.primaryActionTeal}`}
              onClick={() => void handleUseEnergyPass(selected.durationMinutes)}
            >
              <span className={styles.btnSheen} aria-hidden="true" />
              <span>
                {busy === `energy:${selected.durationMinutes}`
                  ? "Activation de l’énergie…"
                  : `Activer Énergie ${formatEnergyDuration(selected.durationMinutes)}`}
              </span>
            </button>
          ) : selected?.kind === "ticket" ? (
            <button
              data-nj-skin="none"
              type="button"
              className={styles.primaryActionBtn}
              onClick={() => {
                setSelected(null);
                goEvents();
              }}
            >
              <span className={styles.btnSheen} aria-hidden="true" />
              <span>Voir les événements du Ter →</span>
            </button>
          ) : undefined
        }
      >
        {/* CONTENU DÉTAIL : PACK */}
        {selected?.kind === "pack" && (
          <div className={`${styles.detailBox}${!loopsOn ? ` ${styles.motionReduced}` : ""}`}>
            <div
              className={`${styles.detailHeroStage} ${styles.stagePack}${openingCharge === "pack" ? ` ${styles.stageCharging}` : ""}`}
            >
              <span className={styles.heroSunburst} aria-hidden="true" />
              {openingCharge === "pack" && (
                <>
                  <span className={styles.shockwaveRing} aria-hidden="true" />
                  <span className={`${styles.shockwaveRing} ${styles.shockwaveDelay}`} aria-hidden="true" />
                </>
              )}
              {SPARK_POSITIONS.map((sp, i) => (
                <span
                  key={i}
                  className={styles.heroSpark}
                  style={{ top: sp.top, left: sp.left, animationDelay: sp.delay } as CSSProperties}
                  aria-hidden="true"
                />
              ))}
              <motion.div
                key={selected.pack.packInstanceId}
                initial={cascadeOn ? { scale: 0.45, y: 20, rotate: -10, opacity: 0 } : false}
                animate={
                  openingCharge === "pack"
                    ? { scale: [1, 1.14, 1.05, 1.24], rotate: [0, -7, 7, -5, 5, 0], opacity: 1, y: 0 }
                    : { scale: 1, y: 0, rotate: 0, opacity: 1 }
                }
                transition={
                  openingCharge === "pack"
                    ? { duration: 0.72, ease: "easeInOut" }
                    : { type: "spring", stiffness: 280, damping: 18 }
                }
                className={styles.heroVisualWrap}
              >
                <Image
                  src={packArt(selected.pack.offerId, 256)}
                  alt={selected.pack.title}
                  width={116}
                  height={116}
                  className={`${styles.detailHeroImg}${openingCharge !== "pack" ? ` ${styles.heroLevitate}` : ""}`}
                />
                <span className={styles.heroPedestalDisc} aria-hidden="true" />
              </motion.div>
              <div className={styles.heroCaption}>
                <span className={styles.detailStockPill}>
                  {openingCharge === "pack" ? "Ouverture en cours…" : "Pack scellé"}
                </span>
                <p>{selected.pack.description ?? "Ouvre ce pack pour recevoir toutes ses récompenses."}</p>
              </div>
            </div>

            {selected.pack.guaranteedRewards && selected.pack.guaranteedRewards.length > 0 && (
              <motion.div
                initial={cascadeOn ? { opacity: 0, y: 10 } : false}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.24, delay: 0.08 }}
                className={styles.detailSection}
              >
                <h3>Contenu garanti</h3>
                <div className={styles.rewardList}>
                  {selected.pack.guaranteedRewards.map((reward, idx) => (
                    <motion.div
                      key={idx}
                      initial={cascadeOn ? { opacity: 0, x: -10 } : false}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.22, delay: 0.1 + idx * 0.05 }}
                      className={styles.rewardRow}
                    >
                      <Image src={rewardIconSrc(reward)} alt="" width={30} height={30} />
                      <div className={styles.rewardRowCopy}>
                        <strong>{rewardLabel(reward)}</strong>
                        <small>{rewardDeliveryNote(reward)}</small>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            )}

            {selected.pack.hasRandomRewards && (
              <motion.p
                initial={cascadeOn ? { opacity: 0, y: 8 } : false}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.24, delay: 0.16 }}
                className={styles.infoBanner}
              >
                ✦ Inclut aussi des bonus aléatoires révélés au moment exact de l’ouverture. Les livres, pass énergie et tickets obtenus resteront disponibles ici dans Ma collection.
              </motion.p>
            )}
          </div>
        )}

        {/* CONTENU DÉTAIL : LIVRE */}
        {selected?.kind === "book" && (
          <div className={styles.detailBox}>
            <div
              className={`${styles.detailHeroStage} ${selected.boosterId === "exceptionnel" ? styles.stageBookGold : styles.stageBook}${openingCharge === "book" ? ` ${styles.stageCharging}` : ""}`}
            >
              <span className={styles.heroRuneRing} aria-hidden="true" />
              <span className={styles.heroSunburst} aria-hidden="true" />
              {openingCharge === "book" && <span className={styles.shockwaveRing} aria-hidden="true" />}
              {SPARK_POSITIONS.map((sp, i) => (
                <span
                  key={i}
                  className={styles.heroSpark}
                  style={{ top: sp.top, left: sp.left, animationDelay: sp.delay } as CSSProperties}
                  aria-hidden="true"
                />
              ))}
              <motion.div
                key={selected.boosterId}
                initial={cascadeOn ? { scale: 0.45, y: 20, rotate: -8, opacity: 0 } : false}
                animate={
                  openingCharge === "book"
                    ? { scale: [1, 1.15, 1.24], rotate: [0, -5, 5, 0], opacity: 1, y: -6 }
                    : { scale: 1, y: 0, rotate: 0, opacity: 1 }
                }
                transition={
                  openingCharge === "book"
                    ? { duration: 0.62, ease: "easeInOut" }
                    : { type: "spring", stiffness: 280, damping: 18 }
                }
                className={styles.heroVisualWrap}
              >
                <Image
                  src={boosterBookArt(selected.boosterId, 256)}
                  alt={boosterBookTitle(selected.boosterId, boosters)}
                  width={116}
                  height={116}
                  className={`${styles.detailHeroImg}${openingCharge !== "book" ? ` ${styles.heroLevitate}` : ""}`}
                />
                <span className={styles.heroPedestalDisc} aria-hidden="true" />
              </motion.div>
              <div className={styles.heroCaption}>
                <span className={styles.detailStockPill}>
                  {openingCharge === "book" ? "Préparation des 9 cartes…" : `×${selected.count} en stock`}
                </span>
                <p>Ouvre ce grimoire pour dévoiler 9 cartes face cachée et choisir la Carte Pouvoir de ton choix.</p>
              </div>
            </div>

            {selectedBoosterDef && (
              <motion.div
                initial={cascadeOn ? { opacity: 0, y: 10 } : false}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.24, delay: 0.08 }}
                className={styles.detailSection}
              >
                <h3>Chances par rareté</h3>
                <div className={styles.rarityBar} aria-hidden="true">
                  {selectedBoosterDef.rarityWeights.map((entry, idx) => (
                    <motion.span
                      key={entry.value}
                      initial={cascadeOn ? { width: "0%" } : false}
                      animate={{ width: `${entry.weight}%` }}
                      transition={{ duration: 0.45, delay: 0.1 + idx * 0.06, ease: [0.22, 1, 0.36, 1] }}
                      className={styles[`bar_${entry.value}`]}
                    />
                  ))}
                </div>
                <div className={styles.oddsRows}>
                  {selectedBoosterDef.rarityWeights.map((entry, idx) => (
                    <motion.div
                      key={entry.value}
                      initial={cascadeOn ? { opacity: 0, x: -8 } : false}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.2, delay: 0.12 + idx * 0.04 }}
                      className={styles.oddsRow}
                    >
                      <span>{BOOSTER_RARITY_LABELS[entry.value] ?? entry.value}</span>
                      <strong>{entry.weight} %</strong>
                    </motion.div>
                  ))}
                </div>
                <p className={styles.infoBanner}>
                  Garantie : {BOOSTER_RARITY_LABELS[selectedBoosterDef.pity.minimumRarity]} ou mieux au {selectedBoosterDef.pity.threshold}e livre sans obtention. En cas de doublon, tu reçois automatiquement des cauris.
                </p>
              </motion.div>
            )}
          </div>
        )}

        {/* CONTENU DÉTAIL : PASS ÉNERGIE */}
        {selected?.kind === "energy" && (
          <div className={styles.detailBox}>
            <div
              className={`${styles.detailHeroStage} ${styles.stageEnergy}${openingCharge === "energy" ? ` ${styles.stageCharging}` : ""}`}
            >
              <span className={styles.energyWave} aria-hidden="true" />
              <span className={`${styles.energyWave} ${styles.energyWave2}`} aria-hidden="true" />
              {openingCharge === "energy" && <span className={styles.shockwaveRing} aria-hidden="true" />}
              {SPARK_POSITIONS.map((sp, i) => (
                <span
                  key={i}
                  className={styles.heroSpark}
                  style={{ top: sp.top, left: sp.left, animationDelay: sp.delay } as CSSProperties}
                  aria-hidden="true"
                />
              ))}
              <motion.div
                key={selected.durationMinutes}
                initial={cascadeOn ? { scale: 0.45, y: 20, opacity: 0 } : false}
                animate={
                  openingCharge === "energy"
                    ? { scale: [1, 1.18, 1.08, 1.25], opacity: 1, y: 0 }
                    : { scale: 1, y: 0, opacity: 1 }
                }
                transition={
                  openingCharge === "energy"
                    ? { duration: 0.56, ease: "easeInOut" }
                    : { type: "spring", stiffness: 280, damping: 18 }
                }
                className={styles.heroVisualWrap}
              >
                <Image
                  src="/assets/njambo/economy/energy-flask-256.webp"
                  alt=""
                  width={116}
                  height={116}
                  className={`${styles.detailHeroImg}${openingCharge !== "energy" ? ` ${styles.heroLevitate}` : ""}`}
                />
                <span className={styles.heroPedestalDisc} aria-hidden="true" />
              </motion.div>
              <div className={styles.heroCaption}>
                <span className={styles.detailStockPill}>
                  {openingCharge === "energy" ? "Activation en cours…" : `×${selected.count} en stock`}
                </span>
                <p>
                  Joue autant de parties que tu veux sans dépenser d’énergie pendant {formatEnergyDuration(selected.durationMinutes)}. La régénération normale continue en parallèle.
                </p>
              </div>
            </div>

            <motion.p
              initial={cascadeOn ? { opacity: 0, y: 8 } : false}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.24, delay: 0.1 }}
              className={styles.infoBanner}
            >
              {economy?.energy.unlimited
                ? `Un pass illimité est déjà actif (encore ${formatRemaining(economy.energy.unlimitedUntil, now)}). Activer ce pass ajoutera +${formatEnergyDuration(selected.durationMinutes)} à la suite.`
                : `Jauge actuelle : ${economy?.energy.available ?? 0}/100. Le compteur ne démarre qu’au moment où tu cliques sur Activer.`}
            </motion.p>
          </div>
        )}

        {/* CONTENU DÉTAIL : TICKET TER */}
        {selected?.kind === "ticket" && (
          <div className={styles.detailBox}>
            <div className={`${styles.detailHeroStage} ${styles.stageTicket}`}>
              <span className={styles.heroSunburst} aria-hidden="true" />
              {SPARK_POSITIONS.map((sp, i) => (
                <span
                  key={i}
                  className={styles.heroSpark}
                  style={{ top: sp.top, left: sp.left, animationDelay: sp.delay } as CSSProperties}
                  aria-hidden="true"
                />
              ))}
              <motion.div
                key={selected.tier}
                initial={cascadeOn ? { scale: 0.45, rotate: -12, y: 18, opacity: 0 } : false}
                animate={{ scale: 1, rotate: 0, y: 0, opacity: 1 }}
                transition={{ type: "spring", stiffness: 280, damping: 18 }}
                className={styles.heroVisualWrap}
              >
                <Image
                  src={TICKET_TIERS_META[selected.tier].art256}
                  alt={TICKET_TIERS_META[selected.tier].label}
                  width={116}
                  height={116}
                  className={`${styles.detailHeroImg} ${styles.heroLevitate}`}
                />
                <span className={styles.heroPedestalDisc} aria-hidden="true" />
              </motion.div>
              <div className={styles.heroCaption}>
                <span className={styles.detailStockPill}>×{selected.count} en stock</span>
                <p>{TICKET_TIERS_META[selected.tier].description}</p>
              </div>
            </div>

            <motion.div
              initial={cascadeOn ? { opacity: 0, y: 10 } : false}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.24, delay: 0.08 }}
              className={styles.detailSection}
            >
              <h3>Événements compatibles en cours</h3>
              {liveEvents.filter((event) => event.ticketTier === selected.tier).length === 0 ? (
                <p className={styles.infoBanner}>
                  Aucun événement {TICKET_TIERS_META[selected.tier].shortLabel} en direct à cet instant. Ton ticket reste conservé sans expiration dans Ma collection.
                </p>
              ) : (
                <div className={styles.eventList}>
                  {liveEvents
                    .filter((event) => event.ticketTier === selected.tier)
                    .map((event, idx) => (
                      <motion.button
                        key={event.eventId}
                        data-nj-skin="none"
                        type="button"
                        initial={cascadeOn ? { opacity: 0, x: -10 } : false}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.22, delay: 0.1 + idx * 0.05 }}
                        className={styles.eventBtn}
                        onClick={() => {
                          setSelected(null);
                          goEvents(event.eventId);
                        }}
                      >
                        <div>
                          <span>{event.title}</span>
                          <small>{event.mode === "pvp" ? "Tournoi PvP" : "Parcours PvE"} · {event.stages.length} tables</small>
                        </div>
                        <span aria-hidden="true">→</span>
                      </motion.button>
                    ))}
                </div>
              )}
            </motion.div>
          </div>
        )}
      </GameModal>

      {/* ═══ MODALE TIRAGE 3×3 D'UN LIVRE OUVERT DEPUIS MA COLLECTION ═══ */}
      <GameModal
        open={bookOpening !== null}
        onClose={() => {
          if (!busy) setBookOpening(null);
        }}
        size="md"
        kicker="Tirage du Grimoire"
        title={bookOpening ? boosterBookTitle(bookOpening.boosterId, boosters) : "Choisis ta carte"}
        tone="gold"
      >
        {bookOpening && (
          <div className={styles.pickArena}>
            <p className={styles.pickHint}>Touche 1 des 9 cartes face cachée pour révéler ta Carte Pouvoir.</p>
            <div className={styles.pickFeltFrame}>
              <span className={styles.pickFeltStitch} aria-hidden="true" />
              <div className={styles.pickGrid}>
                {bookOpening.positions.map((pos, idx) => (
                  <motion.button
                    key={pos}
                    data-nj-skin="none"
                    type="button"
                    disabled={busy !== null}
                    initial={cascadeOn ? { opacity: 0, rotateY: 90, scale: 0.72 } : false}
                    animate={{ opacity: 1, rotateY: 0, scale: 1 }}
                    whileHover={cascadeOn ? { y: -5, scale: 1.05 } : undefined}
                    whileTap={{ scale: 0.94 }}
                    transition={{ type: "spring", stiffness: 320, damping: 22, delay: cascadeOn ? idx * 0.045 : 0 }}
                    className={`${styles.pickCardBtn}${busy === `pick:${pos}` ? ` ${styles.cardCharging}` : ""}`}
                    onClick={() => void handleChooseBookCard(pos)}
                  >
                    <Image src="/assets/njambo/books/card-back-256.webp" alt="Carte cachée" fill sizes="110px" />
                    <span className={styles.pickGlint} aria-hidden="true" />
                    <span className={styles.pickOrb}>{busy === `pick:${pos}` ? "✦" : "?"}</span>
                  </motion.button>
                ))}
              </div>
            </div>
          </div>
        )}
      </GameModal>

      {/* ═══ MODALE RÉVÉLATION 3D DE CARTE POUVOIR ═══ */}
      <GameModal
        open={cardReveal !== null}
        onClose={() => setCardReveal(null)}
        size="md"
        className={!loopsOn ? styles.motionReduced : undefined}
        kicker={cardReveal ? (BOOSTER_RARITY_LABELS[cardReveal.rarity] ?? cardReveal.rarity) : ""}
        title={cardReveal?.duplicateCompensation ? "Doublon converti !" : "Nouvelle Carte Pouvoir !"}
        tone="gold"
        footer={
          <button data-nj-skin="none" type="button" className={styles.primaryActionBtn} onClick={() => setCardReveal(null)}>
            <span className={styles.btnSheen} aria-hidden="true" />
            <span>
              {cardReveal?.duplicateCompensation
                ? `Récupérer +${cardReveal.duplicateCompensation} cauris`
                : "Super, merci !"}
            </span>
          </button>
        }
      >
        {cardReveal && (
          <div className={styles.revealBox}>
            <div
              className={styles.revealStage}
              style={
                revealedPowerCard
                  ? ({ "--rev-tone": CATEGORY_MOTIF_PALETTE[revealedPowerCard.category].primary } as CSSProperties)
                  : undefined
              }
            >
              <span className={styles.revealBurstRays} aria-hidden="true" />
              {cascadeOn && (
                <div className={styles.burstParticles} aria-hidden="true">
                  {BURST_PARTICLES.map((p) => (
                    <motion.span
                      key={p.id}
                      className={styles.burstDot}
                      style={{ width: p.size, height: p.size }}
                      initial={{ x: 0, y: 0, scale: 0, opacity: 1 }}
                      animate={{ x: p.x, y: p.y, scale: [0, 1.25, 0], opacity: [1, 1, 0] }}
                      transition={{ duration: 0.78, delay: 0.08 + p.delay, ease: "easeOut" }}
                    />
                  ))}
                </div>
              )}
              {revealedPowerCard && (
                <motion.div
                  initial={cascadeOn ? { rotateY: 180, scale: 0.48, opacity: 0 } : false}
                  animate={{ rotateY: 0, scale: 1, opacity: 1 }}
                  transition={{ type: "spring", stiffness: 210, damping: 18 }}
                  className={styles.revealCardFrame}
                >
                  <PowerCardView card={revealedPowerCard} showMeta className={styles.revealCardArtifact} />
                </motion.div>
              )}
            </div>
            <motion.strong
              initial={cascadeOn ? { opacity: 0, y: 8 } : false}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.16 }}
            >
              {revealedPowerCard?.name ?? cardReveal.cardId}
            </motion.strong>
            <motion.p
              initial={cascadeOn ? { opacity: 0, y: 8 } : false}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.22 }}
            >
              {revealedPowerCard?.description ?? "Cette carte a rejoint ta collection permanente."}
            </motion.p>
          </div>
        )}
      </GameModal>

      {/* ═══ MODALE RÉVÉLATION SPECTACULAIRE D'UN PACK OUVERT ═══ */}
      <GameModal
        open={packReveal !== null}
        onClose={() => setPackReveal(null)}
        size="md"
        className={!loopsOn ? styles.motionReduced : undefined}
        kicker="Trésor débloqué !"
        title={packReveal?.title ?? "Pack ouvert"}
        tone="gold"
        footer={
          <button data-nj-skin="none" type="button" className={styles.primaryActionBtn} onClick={() => setPackReveal(null)}>
            <span className={styles.btnSheen} aria-hidden="true" />
            <span>Récupérer mes lots</span>
          </button>
        }
      >
        {packReveal && (
          <div className={styles.packRevealWrap}>
            <div className={styles.packBurstBanner}>
              <span className={styles.revealBurstRays} aria-hidden="true" />
              {cascadeOn && (
                <div className={styles.burstParticles} aria-hidden="true">
                  {BURST_PARTICLES.map((p) => (
                    <motion.span
                      key={p.id}
                      className={styles.burstDot}
                      style={{ width: p.size, height: p.size }}
                      initial={{ x: 0, y: 0, scale: 0, opacity: 1 }}
                      animate={{ x: p.x, y: p.y * 0.65, scale: [0, 1.3, 0], opacity: [1, 1, 0] }}
                      transition={{ duration: 0.8, delay: p.delay, ease: "easeOut" }}
                    />
                  ))}
                </div>
              )}
              <motion.div
                initial={cascadeOn ? { scale: 0.35, rotate: -14, opacity: 0 } : false}
                animate={{ scale: 1, rotate: 0, opacity: 1 }}
                transition={{ type: "spring", stiffness: 250, damping: 16 }}
                className={styles.packBurstOrb}
              >
                <Image src={packArt(packReveal.offerId, 256)} alt="" width={78} height={78} />
              </motion.div>
              <span className={styles.packBurstTag}>
                {packReveal.rewards.length} récompense{packReveal.rewards.length > 1 ? "s" : ""} obtenue{packReveal.rewards.length > 1 ? "s" : ""}
              </span>
            </div>

            <div className={`${styles.lotGrid}${packReveal.rewards.length === 1 ? ` ${styles.lotGridSingle}` : ""}`}>
              {packReveal.rewards.map((reward, idx) => (
                <motion.div
                  key={idx}
                  initial={cascadeOn ? { opacity: 0, scale: 0.58, y: 20, rotateY: 60 } : false}
                  animate={{ opacity: 1, scale: 1, y: 0, rotateY: 0 }}
                  transition={{
                    type: "spring",
                    stiffness: 280,
                    damping: 20,
                    delay: cascadeOn ? 0.12 + idx * 0.11 : 0,
                  }}
                  className={`${styles.lotCard} ${rewardToneClass(reward)}`}
                >
                  <span className={styles.lotTargetPill}>{rewardTargetTag(reward)}</span>
                  <div className={styles.lotIconWrap}>
                    <Image src={rewardIconSrc(reward)} alt="" width={48} height={48} className={styles.lotIcon} />
                  </div>
                  <strong>{rewardLabel(reward)}</strong>
                  <small>{rewardDeliveryNote(reward)}</small>
                </motion.div>
              ))}
            </div>
          </div>
        )}
      </GameModal>

      {/* ═══ MODALE CÉLÉBRATION ACTIVATION PASS ÉNERGIE ═══ */}
      <GameModal
        open={energyActivated !== null}
        onClose={() => setEnergyActivated(null)}
        size="sm"
        className={!loopsOn ? styles.motionReduced : undefined}
        kicker="Énergie surchargée !"
        title="Énergie illimitée activée"
        tone="teal"
        footer={
          <button
            data-nj-skin="none"
            type="button"
            className={`${styles.primaryActionBtn} ${styles.primaryActionTeal}`}
            onClick={() => setEnergyActivated(null)}
          >
            <span className={styles.btnSheen} aria-hidden="true" />
            <span>C’est parti !</span>
          </button>
        }
      >
        {energyActivated && (
          <div className={styles.revealBox}>
            <div className={`${styles.revealStage} ${styles.revealStageEnergy}`}>
              <span className={styles.energyWave} aria-hidden="true" />
              <span className={`${styles.energyWave} ${styles.energyWave2}`} aria-hidden="true" />
              {cascadeOn && (
                <div className={styles.burstParticles} aria-hidden="true">
                  {BURST_PARTICLES.map((p) => (
                    <motion.span
                      key={p.id}
                      className={`${styles.burstDot} ${styles.burstDotTeal}`}
                      style={{ width: p.size, height: p.size }}
                      initial={{ x: 0, y: 0, scale: 0, opacity: 1 }}
                      animate={{ x: p.x * 0.85, y: p.y * 0.85, scale: [0, 1.3, 0], opacity: [1, 1, 0] }}
                      transition={{ duration: 0.78, delay: p.delay, ease: "easeOut" }}
                    />
                  ))}
                </div>
              )}
              <motion.div
                initial={cascadeOn ? { scale: 0.35, rotate: -14, opacity: 0 } : false}
                animate={{ scale: 1, rotate: 0, opacity: 1 }}
                transition={{ type: "spring", stiffness: 250, damping: 16 }}
                className={styles.energyWinOrb}
              >
                <Image src="/assets/njambo/economy/energy-flask-256.webp" alt="" width={96} height={96} className={styles.heroLevitate} />
              </motion.div>
            </div>
            <strong className={styles.energyWinDuration}>+{formatEnergyDuration(energyActivated.durationMinutes)}</strong>
            <p>
              Ton énergie est illimitée pendant encore <b>{formatRemaining(energyActivated.unlimitedUntil, now)}</b>. Joue librement sans consommer ta jauge !
            </p>
          </div>
        )}
      </GameModal>
    </div>
  );
}
