"use client";

import Image from "next/image";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  countStoredCollectionItems,
  formatEnergyDuration,
  isStoredPackOffer,
  type BoosterDefinition,
  type OfferDefinition,
  type Reward,
  type TicketTier,
} from "@/domain";
import { useAuth } from "@/hooks/useAuth";
import { useEconomy } from "@/contexts/EconomyContext";
import { useGame } from "@/contexts/GameContext";
import { useDailyGrid, useLiveOpsContent } from "@/hooks/useLiveOpsContent";
import { useMotionProfile } from "@/lib/motion";
import { t } from "@/lib/i18n";
import { AuthGate } from "@/components/ui/AuthGate";
import { GameShell } from "@/components/ui/GameShell";
import { GameModal } from "@/components/ui/GameModal";
import { NjamboIcon, type NjamboIconName } from "@/components/ui/Art";
import { POWER_CARDS_BY_ID } from "@/config/powerCards";
import { CATEGORY_MOTIF_PALETTE, PowerCardMotif } from "@/components/power/PowerCardMotif";
import { PowerCardView } from "@/components/power/PowerCardView";
import {
  BOOSTER_RARITY_LABELS as RARITY_LABELS,
  OFFER_KIND_LABELS as OFFER_KIND_LABEL,
  boosterBookArt,
  offerArt,
  offerDeliverySummary,
  priceLabel,
  rewardDeliveryNote,
  rewardIconSrc,
  rewardLabel,
} from "@/lib/shopVisuals";
import type { PowerCardDef, PowerCardId } from "@/types/game";
import styles from "./ShopScreen.module.css";

type ShopTab = "offers" | "boosters" | "grid" | "wheel";
type OfferCategory = "featured" | OfferDefinition["type"];
type CardReveal = {
  source: "booster" | "daily-grid";
  cardId: string;
  rarity: string;
  duplicateCompensation: number;
};

type DailyGridResult = {
  reward: Reward;
  duplicateCompensation: number;
};

type OddsModalData = {
  title: string;
  kicker: string;
  rows: Array<{ label: string; weight: number }>;
  note?: string;
};

const SHOP_TABS: Array<{ id: ShopTab; label: string; icon: NjamboIconName; toneClass: string }> = [
  { id: "offers", label: t("shop.offers"), icon: "coin", toneClass: "tabGold" },
  { id: "boosters", label: t("shop.boosters"), icon: "cards", toneClass: "tabPurple" },
  { id: "grid", label: t("shop.dailyGrid"), icon: "sparkle", toneClass: "tabTeal" },
  { id: "wheel", label: t("shop.wheel"), icon: "trophy", toneClass: "tabPink" },
];

const OFFER_CATEGORIES: Array<{ id: OfferCategory; label: string }> = [
  { id: "featured", label: t("shop.category.featured") },
  { id: "cauris_pack", label: t("shop.category.cauris") },
  { id: "nkap_conversion", label: t("shop.category.nkap") },
  { id: "energy_pass", label: t("shop.category.energy") },
  { id: "ticket", label: t("shop.category.tickets") },
  { id: "element_pack", label: t("shop.category.packs") },
];

const FEATURED_OFFER_IDS = ["pack_mboa", "cauris_110", "nkap_3000", "energy_120", "ticket_bronze"];

const OFFER_TONE_CLASS: Record<OfferDefinition["type"], string> = {
  cauris_pack: "cardPink",
  nkap_conversion: "cardGold",
  energy_pass: "cardTeal",
  ticket: "cardOrange",
  element_pack: "cardPurple",
};

const WHEEL_ODDS = [
  { label: "100 Nkap", weight: 35, icon: "/assets/njambo/economy/nkap-stack-64.webp" },
  { label: "250 Nkap", weight: 25, icon: "/assets/njambo/economy/nkap-stack-64.webp" },
  { label: "5 cauris", weight: 20, icon: "/assets/njambo/economy/cauris-pouch-64.webp" },
  { label: "Ticket Bronze", weight: 10, icon: "/assets/njambo/tickets/ticket-bronze-64.webp" },
  { label: "Énergie 1 h", weight: 7, icon: "/assets/njambo/economy/energy-flask-64.webp" },
  { label: "Livre Normal", weight: 3, icon: "/assets/njambo/books/book-normal-128.webp" },
];

const GRID_ODDS = [
  { label: "Village", weight: 55 },
  { label: "Notable", weight: 32 },
  { label: "Chef", weight: 11 },
  { label: "Ancêtre", weight: 2 },
];

export function ShopScreen() {
  const { navigateTo, goBack, backLabelFor, setCollectionTab } = useGame();
  const { user } = useAuth();
  const { economy, inventory, loading: economyLoading, command, pendingBoosterOpening } = useEconomy();
  const { offers: publishedOffers, boosters, error: contentError } = useLiveOpsContent();
  const motionProfile = useMotionProfile();
  const {
    day: gridDay,
    purchased: gridRewards,
    duplicateCompensations: gridDuplicateCompensations,
    loading: gridLoading,
  } = useDailyGrid(user && !user.isAnonymous ? user.uid : undefined);

  const [tab, setTab] = useState<ShopTab>("offers");
  const [offerCategory, setOfferCategory] = useState<OfferCategory>("featured");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ severity: "success" | "warning" | "error"; text: string; openCollection?: boolean } | null>(null);
  const [opening, setOpening] = useState<{ openingId: string; positions: number[] } | null>(null);
  const [cardReveal, setCardReveal] = useState<CardReveal | null>(null);
  const [wheelReward, setWheelReward] = useState<Reward | null>(null);
  const [wheelRotation, setWheelRotation] = useState(0);
  const [gridSelectingPosition, setGridSelectingPosition] = useState<number | null>(null);
  const [gridPayment, setGridPayment] = useState<"cauris" | "xaf">("cauris");
  const [oddsModal, setOddsModal] = useState<OddsModalData | null>(null);
  const [selectedOffer, setSelectedOffer] = useState<OfferDefinition | null>(null);
  const [selectedBooster, setSelectedBooster] = useState<BoosterDefinition | null>(null);
  const [selectedGridCard, setSelectedGridCard] = useState<PowerCardDef | null>(null);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [walletPulse, setWalletPulse] = useState(false);

  const guestBlocked = !user || user.isAnonymous;
  const blocked = guestBlocked || economyLoading || Boolean(economy?.spendingBlocked);
  const cascadeOn = motionProfile.allowEntranceCascade;
  const loopsOn = motionProfile.allowDecorativeLoop;

  const openCollectionItems = () => {
    setCollectionTab("items");
    navigateTo("power_collection");
  };

  useEffect(() => {
    if (!guestBlocked && authModalOpen) setAuthModalOpen(false);
  }, [guestBlocked, authModalOpen]);

  useEffect(() => {
    setOpening(
      pendingBoosterOpening
        ? { openingId: pendingBoosterOpening.openingId, positions: pendingBoosterOpening.positions }
        : null,
    );
  }, [pendingBoosterOpening]);

  const triggerWalletPulse = () => {
    setWalletPulse(true);
    window.setTimeout(() => setWalletPulse(false), 680);
  };

  const offers = useMemo(
    () => publishedOffers.filter((offer) => offer.published && offer.id !== "daily_grid_slot_xaf"),
    [publishedOffers],
  );

  const visibleOffers = useMemo(() => {
    if (offerCategory !== "featured") return offers.filter((offer) => offer.type === offerCategory);
    const configuredSelection = FEATURED_OFFER_IDS
      .map((id) => offers.find((offer) => offer.id === id))
      .filter((offer): offer is OfferDefinition => Boolean(offer));
    if (configuredSelection.length >= 3) return configuredSelection;
    return OFFER_CATEGORIES
      .filter((category) => category.id !== "featured")
      .map((category) => offers.find((offer) => offer.type === category.id))
      .filter((offer): offer is OfferDefinition => Boolean(offer));
  }, [offerCategory, offers]);

  const storedObjects = useMemo(() => countStoredCollectionItems(inventory), [inventory]);
  const totalOwnedBooks = storedObjects.books;

  const availableSpins = economy?.daily.availableSpins ?? 0;
  const loyaltyPoints = economy?.daily.loyaltyPoints ?? 0;

  const ownedStockForOffer = (offer: OfferDefinition): string | null => {
    if (guestBlocked) return null;
    if (offer.type === "cauris_pack") return `Solde actuel : ${(economy?.cauris ?? 0).toLocaleString("fr-FR")} cauris`;
    if (offer.type === "nkap_conversion") return `Solde actuel : ${(economy?.nkap ?? 0).toLocaleString("fr-FR")} Nkap`;
    if (offer.type === "ticket") {
      const tier = offer.id.replace("ticket_", "") as TicketTier;
      const count = Number(inventory.tickets?.[tier] ?? 0);
      return `En stock dans Ma collection : ${count}`;
    }
    if (offer.type === "energy_pass") {
      const minutes = offer.rewards.find((r) => r.type === "energy_pass")?.durationMinutes;
      if (minutes) {
        const count = Number(inventory.energyPasses?.[String(minutes)] ?? 0);
        return `En stock (${formatEnergyDuration(minutes)}) : ${count}`;
      }
      return `Pass énergie en stock : ${storedObjects.energy}`;
    }
    if (offer.id.startsWith("booster_")) {
      const bId = offer.id.replace("booster_", "").replace("_xaf", "");
      const count = Number(inventory.boosterBooks?.[bId] ?? 0);
      return `En stock dans Ma collection : ${count}`;
    }
    if (isStoredPackOffer(offer)) {
      const count = (inventory.packs ?? []).filter((p) => p.offerId === offer.id).length;
      return `Packs scellés en stock : ${count}`;
    }
    return null;
  };

  const run = async (key: string, action: () => Promise<{ text: string; openCollection?: boolean } | string | void>) => {
    if (guestBlocked) {
      setAuthModalOpen(true);
      return;
    }
    setBusy(key);
    setMessage(null);
    try {
      const confirmation = await action();
      triggerWalletPulse();
      if (typeof confirmation === "string" && confirmation) {
        setMessage({ severity: "success", text: confirmation });
      } else if (confirmation && typeof confirmation === "object" && confirmation.text) {
        setMessage({ severity: "success", text: confirmation.text, openCollection: confirmation.openCollection });
      }
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : "";
      const insufficient = /insufficient|solde|balance/i.test(reason);
      const adultConfirmation = /CHECKOUT_REQUIRES_ADULT_CONFIRMATION/i.test(reason);
      setMessage({
        severity: insufficient || adultConfirmation ? "warning" : "error",
        text: insufficient
          ? "Ton solde est insuffisant pour cet achat."
          : adultConfirmation
            ? "Confirme d’abord que tu as 18 ans ou plus dans ton profil pour payer en XAF."
            : /unavailable|not-found/i.test(reason)
              ? "Cette offre n’est plus disponible."
              : "L’opération a été refusée. Réessaie dans un instant.",
      });
    } finally {
      setBusy(null);
    }
  };

  const purchase = async (offerId: string): Promise<{ text: string; openCollection?: boolean } | void> => {
    const offer = offers.find((candidate) => candidate.id === offerId);
    if (!offer) return;
    const delivery = offerDeliverySummary(offer);
    if (offer.prices.some((price) => price.currency === "cauris")) {
      await command("purchaseOffer", { offerId });
      setSelectedOffer(null);
      return {
        text: delivery.storedInCollection
          ? `${offer.title} ajouté à Ma collection ! Clique dessus pour l’utiliser.`
          : `${offer.title} crédité sur ton portefeuille !`,
        openCollection: delivery.storedInCollection,
      };
    }
    const intent = await command<{ orderId: string }>("createPaymentIntent", { offerId, provider: "simulated" });
    await command("verifyStorePurchase", { orderId: intent.orderId, simulationOutcome: "success" });
    setSelectedOffer(null);
    return {
      text: delivery.storedInCollection
        ? `Achat confirmé : ${offer.title} t’attend dans Ma collection !`
        : `Paiement simulé confirmé : ${offer.title} crédité !`,
      openCollection: delivery.storedInCollection,
    };
  };

  const buyBookWithCauris = async (booster: BoosterDefinition): Promise<{ text: string; openCollection?: boolean }> => {
    await command("buyBoosterBook", { boosterId: booster.id });
    setSelectedBooster(null);
    return {
      text: `${booster.title} ajouté à Ma collection ! Ouvre-le quand tu veux.`,
      openCollection: true,
    };
  };

  const buyGridWithXaf = async (position: number): Promise<DailyGridResult> => {
    const intent = await command<{ orderId: string }>("createPaymentIntent", { offerId: "daily_grid_slot_xaf", provider: "simulated" });
    await command("verifyStorePurchase", { orderId: intent.orderId, simulationOutcome: "success" });
    return command<DailyGridResult>("buyDailyGridSlot", { position, orderId: intent.orderId });
  };

  const revealBoosterCard = async (position: number) => {
    if (!opening) return;
    setBusy(`slot-${position}`);
    setMessage(null);
    try {
      const result = await command<{ reward: { cardId: string; rarity: string }; duplicateCompensation: number }>("chooseBoosterCard", {
        openingId: opening.openingId,
        position,
      });
      setCardReveal({
        source: "booster",
        cardId: result.reward.cardId,
        rarity: result.reward.rarity,
        duplicateCompensation: result.duplicateCompensation,
      });
      setOpening(null);
      triggerWalletPulse();
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : "";
      setMessage({ severity: "error", text: reason || "Impossible de révéler cette carte." });
    } finally {
      setBusy(null);
    }
  };

  const purchaseDailyGridCard = async (position: number, payment: "cauris" | "xaf") => {
    if (guestBlocked) {
      setAuthModalOpen(true);
      return;
    }
    const key = payment === "xaf" ? `grid-xaf-${position}` : `grid-${position}`;
    setBusy(key);
    setGridSelectingPosition(position);
    setMessage(null);
    try {
      const result = payment === "xaf"
        ? await buyGridWithXaf(position)
        : await command<DailyGridResult>("buyDailyGridSlot", { position });
      if (result.reward.type !== "card") throw new Error("INVALID_DAILY_GRID_REWARD");
      setCardReveal({
        source: "daily-grid",
        cardId: result.reward.cardId,
        rarity: result.reward.rarity,
        duplicateCompensation: Number(result.duplicateCompensation ?? 0),
      });
      triggerWalletPulse();
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : "";
      const insufficient = /insufficient|solde|balance/i.test(reason);
      const adultConfirmation = /CHECKOUT_REQUIRES_ADULT_CONFIRMATION/i.test(reason);
      setMessage({
        severity: insufficient || adultConfirmation ? "warning" : "error",
        text: insufficient
          ? "Tu n’as pas assez de cauris pour révéler cette case."
          : adultConfirmation
            ? "Confirme d’abord que tu as 18 ans ou plus dans ton profil pour payer en XAF."
            : "La carte n’a pas pu être révélée.",
      });
    } finally {
      setBusy(null);
      setGridSelectingPosition(null);
    }
  };

  const spinWheel = async () => {
    if (guestBlocked) {
      setAuthModalOpen(true);
      return;
    }
    setWheelRotation((prev) => prev + 1440 + Math.floor(Math.random() * 360));
    await run("wheel", async () => {
      const result = await command<{ reward: Reward }>("spinLoyaltyWheel");
      setWheelReward(result.reward);
      const stored = result.reward.type !== "nkap" && result.reward.type !== "cauris";
      return {
        text: stored
          ? `La roue t’offre ${rewardLabel(result.reward)} (ajouté à Ma collection) !`
          : `La roue t’offre ${rewardLabel(result.reward)} !`,
        openCollection: stored,
      };
    });
  };

  const openOfferOdds = (offer: OfferDefinition) => {
    const rows: Array<{ label: string; weight: number }> = [];
    offer.randomRewards?.forEach((entry) => rows.push({ label: rewardLabel(entry.value), weight: entry.weight }));
    offer.rewardGroups?.forEach((group, idx) => {
      group.forEach((entry) => rows.push({ label: `Lot ${idx + 1} · ${rewardLabel(entry.value)}`, weight: entry.weight }));
    });
    setOddsModal({ title: offer.title, kicker: "Probabilités du tirage", rows });
  };

  const openBoosterOdds = (booster: BoosterDefinition) => {
    setOddsModal({
      title: booster.title,
      kicker: "Chances par rareté",
      rows: booster.rarityWeights.map((entry) => ({ label: RARITY_LABELS[entry.value] ?? entry.value, weight: entry.weight })),
      note: `Garantie : ${RARITY_LABELS[booster.pity.minimumRarity]} ou mieux au ${booster.pity.threshold}e livre sans obtention.`,
    });
  };

  const gridRevealedCount = Object.keys(gridRewards).length;
  const revealedCard = cardReveal ? POWER_CARDS_BY_ID[cardReveal.cardId as PowerCardId] : undefined;

  return (
    <GameShell
      active="shop"
      dock={false}
      scroll={false}
      className={`${styles.scene}${!loopsOn ? ` ${styles.motionReduced}` : ""}`}
      contentClassName={styles.frame}
    >
      {/* ═══ HUD HAUT COMPACT & PORTEFEUILLE ANIMÉ ═══ */}
      <header className={styles.hudBar}>
        <div className={styles.hudLeft}>
          <button
            data-nj-skin="none"
            type="button"
            className={styles.backBtn}
            onClick={() => goBack("menu")}
            aria-label={`Retour à ${backLabelFor("menu")}`}
          >
            <span aria-hidden="true">←</span>
            <span className={styles.backLabel}>{backLabelFor("menu")}</span>
          </button>
          <div className={styles.hudCopy}>
            <span className={styles.hudKicker}>{t("shop.kicker")}</span>
            <h1>{t("shop.title")}</h1>
          </div>
        </div>

        <div className={styles.hudWallet}>
          {guestBlocked && (
            <button
              data-nj-skin="none"
              type="button"
              className={styles.guestHudBtn}
              onClick={() => setAuthModalOpen(true)}
            >
              <NjamboIcon name="profile" tone="teal" size={15} />
              <span>Connexion</span>
            </button>
          )}
          <button
            data-nj-skin="none"
            type="button"
            className={`${styles.walletPill} ${styles.pillCollection}`}
            onClick={openCollectionItems}
            aria-label={`Ouvrir Ma collection (${storedObjects.total} objet${storedObjects.total > 1 ? "s" : ""})`}
          >
            <NjamboIcon name="cards" tone="teal" size={16} />
            <span className={styles.collectionLabel}>Collection</span>
            {storedObjects.total > 0 && (
              <span className={styles.collectionBadge}>{storedObjects.total}</span>
            )}
          </button>
          <button
            data-nj-skin="none"
            type="button"
            className={`${styles.walletPill} ${styles.pillGold}${walletPulse ? ` ${styles.walletPop}` : ""}`}
            onClick={() => navigateTo("wallet")}
          >
            <Image src="/assets/njambo/economy/nkap-stack-64.webp" alt="" width={19} height={19} />
            <strong>{economy?.nkap.toLocaleString("fr-FR") ?? "—"}</strong>
          </button>
          <button
            data-nj-skin="none"
            type="button"
            className={`${styles.walletPill} ${styles.pillPink}${walletPulse ? ` ${styles.walletPop}` : ""}`}
            onClick={() => navigateTo("wallet")}
          >
            <Image src="/assets/njambo/economy/cauris-pouch-64.webp" alt="" width={19} height={19} />
            <strong>{economy?.cauris ?? "—"}</strong>
          </button>
        </div>
      </header>

      {/* ═══ 4 ONGLETS ÉMAILLÉS 3D AVEC PASTILLES LIVE ═══ */}
      <nav className={styles.shopTabs} role="tablist" aria-label="Rayons de la boutique">
        {SHOP_TABS.map((entry) => {
          const active = tab === entry.id;
          const badge =
            entry.id === "boosters" && totalOwnedBooks > 0
              ? String(totalOwnedBooks)
              : entry.id === "wheel" && availableSpins > 0
              ? String(availableSpins)
              : null;
          return (
            <button
              key={entry.id}
              data-nj-skin="none"
              type="button"
              role="tab"
              aria-selected={active}
              className={`${styles.shopTab} ${styles[entry.toneClass]}${active ? ` ${styles.shopTabActive}` : ""}`}
              onClick={() => setTab(entry.id)}
            >
              <NjamboIcon
                name={entry.icon}
                tone={entry.id === "offers" ? "gold" : entry.id === "grid" ? "teal" : entry.id === "wheel" ? "pink" : "cobalt"}
                size={18}
              />
              <span>{entry.label}</span>
              {badge && <span className={styles.tabLiveBadge}>{badge}</span>}
            </button>
          );
        })}
      </nav>

      {/* Notifications flottantes */}
      {contentError && <div className={styles.toastWarn} role="alert">{contentError}</div>}
      <AnimatePresence>
        {message && (
          <motion.div
            key={message.text}
            initial={cascadeOn ? { opacity: 0, y: -8, scale: 0.96 } : false}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.96 }}
            transition={{ duration: 0.22 }}
            className={`${styles.toastMsg} ${styles[`toast_${message.severity}`]}`}
            role="status"
          >
            <span>{message.text}</span>
            <div className={styles.toastActions}>
              {message.openCollection && (
                <button
                  data-nj-skin="none"
                  type="button"
                  className={styles.toastCollectionBtn}
                  onClick={openCollectionItems}
                >
                  Ma collection →
                </button>
              )}
              <button data-nj-skin="none" type="button" onClick={() => setMessage(null)} aria-label="Fermer">✕</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══ ZONE PRINCIPALE ANIMÉE DES 4 RAYONS ═══ */}
      <div className={styles.stageViewport}>
        <AnimatePresence mode="wait" initial={false}>
          {/* ─── RAYON 1 : À LA UNE & VITRINE D'OFFRES ─── */}
          {tab === "offers" && (
            <motion.section
              key="tab-offers"
              className={styles.tabStage}
              aria-label="Offres de la boutique"
              initial={cascadeOn ? { opacity: 0, y: 12 } : false}
              animate={{ opacity: 1, y: 0 }}
              exit={cascadeOn ? { opacity: 0, y: -10 } : undefined}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            >
              <nav className={styles.catStrip} role="tablist" aria-label="Catégories d’offres">
                {OFFER_CATEGORIES.filter((c) => c.id === "featured" || offers.some((o) => o.type === c.id)).map((cat) => {
                  const active = offerCategory === cat.id;
                  return (
                    <button
                      key={cat.id}
                      data-nj-skin="none"
                      type="button"
                      role="tab"
                      aria-selected={active}
                      className={`${styles.catPill}${active ? ` ${styles.catPillActive}` : ""}`}
                      onClick={() => setOfferCategory(cat.id)}
                    >
                      {cat.label}
                    </button>
                  );
                })}
              </nav>

              <div className={styles.scrollStage}>
                <div className={styles.shelfGrid}>
                  {visibleOffers.map((offer, idx) => {
                    const xaf = offer.prices.some((price) => price.currency === "xaf");
                    const hasOdds = Boolean(offer.rewardGroups?.length || offer.randomRewards?.length);
                    const toneClass = OFFER_TONE_CLASS[offer.type] ?? "cardGold";
                    const isHeroFeatured = offerCategory === "featured" && idx === 0;

                    return (
                      <motion.article
                        key={`${offerCategory}-${offer.id}`}
                        role="button"
                        tabIndex={0}
                        onClick={() => setSelectedOffer(offer)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setSelectedOffer(offer);
                          }
                        }}
                        aria-label={`Voir les détails de ${offer.title}`}
                        initial={cascadeOn ? { opacity: 0, y: 16, scale: 0.96 } : false}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        transition={{
                          type: "spring",
                          stiffness: 340,
                          damping: 26,
                          delay: cascadeOn ? Math.min(idx * 0.045, 0.24) : 0,
                        }}
                        className={`${styles.shelfCard} ${styles.clickableCard} ${styles[toneClass]}${isHeroFeatured ? ` ${styles.shelfCardHero}` : ""}`}
                        style={{ "--float-delay": `${idx * 0.38}s` } as CSSProperties}
                      >
                        <span className={styles.shelfTrim} aria-hidden="true" />
                        <span className={styles.holoSheen} aria-hidden="true" />

                        {/* Piédestal lumineux 3D avec rayons & objet en lévitation */}
                        <div className={styles.pedestal}>
                          <span className={styles.sunburstRays} aria-hidden="true" />
                          <span className={styles.pedestalDisc} aria-hidden="true" />

                          <div className={styles.pedestalTop}>
                            <span className={styles.kindTag}>
                              {isHeroFeatured ? "★ Vedette" : OFFER_KIND_LABEL[offer.type]}
                            </span>
                            <div className={styles.pedestalBadges}>
                              {xaf && <span className={styles.simTag}>Simulé</span>}
                              {hasOdds && (
                                <button
                                  data-nj-skin="none"
                                  type="button"
                                  className={styles.oddsBtn}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openOfferOdds(offer);
                                  }}
                                  aria-label={`Voir les probabilités de ${offer.title}`}
                                >
                                  ?
                                </button>
                              )}
                            </div>
                          </div>

                          <div className={styles.itemFloat}>
                            <Image
                              src={offerArt(offer)}
                              alt={offer.title}
                              width={isHeroFeatured ? 124 : 104}
                              height={isHeroFeatured ? 124 : 104}
                              className={styles.itemImg}
                            />
                            <span className={styles.itemShadow} aria-hidden="true" />
                          </div>
                        </div>

                        {/* Bas de carte : titre + récompenses 2,5D + bouton prix 3D */}
                        <div className={styles.shelfBody}>
                          <div className={styles.shelfTitleRow}>
                            <h2>{offer.title}</h2>
                            <span className={styles.detailHint}>Détails</span>
                          </div>
                          {offer.rewards.length > 0 ? (
                            <div className={styles.rewardChips}>
                              {offer.rewards.slice(0, isHeroFeatured ? 3 : 2).map((r, i) => (
                                <span key={i} className={styles.rewardChip}>
                                  <Image src={rewardIconSrc(r)} alt="" width={16} height={16} />
                                  <span>{rewardLabel(r)}</span>
                                </span>
                              ))}
                            </div>
                          ) : (
                            <p className={styles.shelfDesc}>{offer.description}</p>
                          )}

                          <button
                            data-nj-skin="none"
                            type="button"
                            disabled={(!guestBlocked && blocked) || busy !== null}
                            className={`${styles.priceBtn}${xaf ? ` ${styles.priceBtnGold}` : ` ${styles.priceBtnTeal}`}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              void run(offer.id, () => purchase(offer.id));
                            }}
                          >
                            <span className={styles.btnSheen} aria-hidden="true" />
                            <span>
                              {busy === offer.id
                                ? "Validation…"
                                : guestBlocked
                                ? `Se connecter · ${offer.prices.map(priceLabel).join(" / ")}`
                                : offer.prices.map(priceLabel).join(" / ")}
                            </span>
                          </button>
                        </div>
                      </motion.article>
                    );
                  })}
                </div>
              </div>
            </motion.section>
          )}

          {/* ─── RAYON 2 : LIVRES DE BOOSTERS (GRIMOIRES EN LÉVITATION) ─── */}
          {tab === "boosters" && (
            <motion.section
              key="tab-boosters"
              className={styles.tabStage}
              aria-label="Livres de boosters"
              initial={cascadeOn ? { opacity: 0, y: 12 } : false}
              animate={{ opacity: 1, y: 0 }}
              exit={cascadeOn ? { opacity: 0, y: -10 } : undefined}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className={styles.scrollStage}>
                {!opening ? (
                  <div className={styles.bookGrid}>
                    {boosters.map((booster, idx) => {
                      const ownedBooks = Number(inventory.boosterBooks?.[booster.id] ?? 0);
                      const caurisPrice = booster.prices.find((p) => p.currency === "cauris");
                      const tierClass =
                        booster.id === "exceptionnel"
                          ? styles.bookGold
                          : booster.id === "rare"
                          ? styles.bookBlue
                          : styles.bookTeal;

                      return (
                        <motion.article
                          key={booster.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => setSelectedBooster(booster)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              setSelectedBooster(booster);
                            }
                          }}
                          aria-label={`Voir les détails de ${booster.title}`}
                          initial={cascadeOn ? { opacity: 0, y: 20, scale: 0.95 } : false}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          transition={{
                            type: "spring",
                            stiffness: 320,
                            damping: 25,
                            delay: cascadeOn ? idx * 0.07 : 0,
                          }}
                          className={`${styles.bookCard} ${styles.clickableCard} ${tierClass}`}
                          style={{ "--float-delay": `${idx * 0.45}s` } as CSSProperties}
                        >
                          <span className={styles.shelfTrim} aria-hidden="true" />
                          <span className={styles.holoSheen} aria-hidden="true" />

                          <div className={styles.bookPedestal}>
                            <span className={styles.runeHalo} aria-hidden="true" />
                            <div className={styles.pedestalTop}>
                              {ownedBooks > 0 ? (
                                <button
                                  data-nj-skin="none"
                                  type="button"
                                  className={`${styles.kindTag} ${styles.kindTagClickable}`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openCollectionItems();
                                  }}
                                >
                                  ×{ownedBooks} dans Ma collection →
                                </button>
                              ) : (
                                <span className={styles.kindTag}>9 cartes cachées</span>
                              )}
                              <button
                                data-nj-skin="none"
                                type="button"
                                className={styles.oddsBtn}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openBoosterOdds(booster);
                                }}
                                aria-label={`Probabilités du ${booster.title}`}
                              >
                                ?
                              </button>
                            </div>

                            {/* Grimoire en lévitation + 3 cartes éventail derrière */}
                            <div className={styles.bookFloat}>
                              <span className={`${styles.bookBackCard} ${styles.bbcLeft}`} aria-hidden="true" />
                              <span className={`${styles.bookBackCard} ${styles.bbcRight}`} aria-hidden="true" />
                              <Image
                                src={boosterBookArt(booster.id, 256)}
                                alt={booster.title}
                                width={136}
                                height={136}
                                className={styles.itemImg}
                              />
                              <span className={styles.itemShadow} aria-hidden="true" />
                            </div>
                          </div>

                          <div className={styles.bookBody}>
                            <div className={styles.shelfTitleRow}>
                              <h2>{booster.title}</h2>
                              <span className={styles.detailHint}>Détails</span>
                            </div>
                            <p>Ajouté à Ma collection après achat — ouvre-le quand tu veux pour choisir 1 carte parmi 9.</p>

                            {/* Barre visuelle + légende compacte des raretés */}
                            <div className={styles.rarityBlock}>
                              <div className={styles.rarityBar} aria-hidden="true">
                                {booster.rarityWeights.map((entry) => (
                                  <span
                                    key={entry.value}
                                    className={styles[`bar_${entry.value}`]}
                                    style={{ width: `${entry.weight}%` }}
                                    title={`${RARITY_LABELS[entry.value]} : ${entry.weight}%`}
                                  />
                                ))}
                              </div>
                              <div className={styles.rarityLegend}>
                                {booster.rarityWeights
                                  .filter((e) => e.weight > 0)
                                  .map((entry) => (
                                    <span key={entry.value} className={styles[`leg_${entry.value}`]}>
                                      {RARITY_LABELS[entry.value]} <b>{entry.weight}%</b>
                                    </span>
                                  ))}
                              </div>
                            </div>

                            <button
                              data-nj-skin="none"
                              type="button"
                              disabled={(!guestBlocked && blocked) || busy !== null || !caurisPrice}
                              className={styles.bookBuyBtn}
                              onClick={(e) => {
                                e.stopPropagation();
                                void run(booster.id, () => buyBookWithCauris(booster));
                              }}
                            >
                              <span className={styles.btnSheen} aria-hidden="true" />
                              <span>
                                {busy === booster.id
                                  ? "Achat…"
                                  : caurisPrice
                                    ? guestBlocked
                                      ? `Se connecter · ${priceLabel(caurisPrice)}`
                                      : `Acheter · ${priceLabel(caurisPrice)}`
                                    : "Indisponible"}
                              </span>
                            </button>
                          </div>
                        </motion.article>
                      );
                    })}
                  </div>
                ) : (
                  /* ── ARÈNE DE TIRAGE 3×3 SUR TAPIS ÉMERAUDE ── */
                  <div className={styles.openingArena}>
                    <div className={styles.openingHead}>
                      <span className={styles.gridKicker}>Tirage du Grimoire</span>
                      <h2>Choisis 1 carte parmi les 9 !</h2>
                      <p>Touche la carte de ton destin pour révéler son pouvoir.</p>
                    </div>
                    <div className={styles.pickGrid}>
                      {opening.positions.map((pos, i) => (
                        <motion.button
                          key={pos}
                          data-nj-skin="none"
                          type="button"
                          disabled={busy !== null}
                          initial={cascadeOn ? { opacity: 0, rotateY: 90, scale: 0.75 } : false}
                          animate={{ opacity: 1, rotateY: 0, scale: 1 }}
                          whileHover={cascadeOn ? { y: -6, scale: 1.05 } : undefined}
                          whileTap={{ scale: 0.94 }}
                          transition={{
                            type: "spring",
                            stiffness: 340,
                            damping: 22,
                            delay: cascadeOn ? i * 0.04 : 0,
                          }}
                          className={`${styles.pickCardBtn}${busy === `slot-${pos}` ? ` ${styles.cardCharging}` : ""}`}
                          onClick={() => void revealBoosterCard(pos)}
                        >
                          <Image src="/assets/njambo/books/card-back-256.webp" alt="Carte cachée" fill sizes="120px" />
                          <span className={styles.cardGlint} aria-hidden="true" />
                          <span className={styles.pickOrb}>{busy === `slot-${pos}` ? "✦" : "?"}</span>
                        </motion.button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </motion.section>
          )}

          {/* ─── RAYON 3 : LA GRILLE DU JOUR 3×3 SUR TAPIS DE CARTES ─── */}
          {tab === "grid" && (
            <motion.section
              key="tab-grid"
              className={styles.gridArena}
              aria-label="La Grille des Pouvoirs"
              initial={cascadeOn ? { opacity: 0, y: 12 } : false}
              animate={{ opacity: 1, y: 0 }}
              exit={cascadeOn ? { opacity: 0, y: -10 } : undefined}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className={styles.gridTopBar}>
                <div className={styles.gridTitleMeta}>
                  <span className={styles.gridKicker}>Rotation · {gridDay}</span>
                  <div className={styles.gridProgressRow}>
                    <h2>Grille 3×3</h2>
                    <div className={styles.gridDots} aria-label={`${gridRevealedCount} sur 9 révélées`}>
                      {Array.from({ length: 9 }, (_, i) => (
                        <span key={i} className={`${styles.gridDot}${i < gridRevealedCount ? ` ${styles.gridDotLit}` : ""}`} />
                      ))}
                    </div>
                  </div>
                </div>

                <div className={styles.gridControls}>
                  <div className={styles.payToggle} role="group" aria-label="Moyen de paiement">
                    <button
                      data-nj-skin="none"
                      type="button"
                      aria-pressed={gridPayment === "cauris"}
                      className={gridPayment === "cauris" ? styles.payActive : ""}
                      onClick={() => setGridPayment("cauris")}
                    >
                      <Image src="/assets/njambo/economy/cauri-64.webp" alt="" width={15} height={15} />
                      <span>15 cauris</span>
                    </button>
                    <button
                      data-nj-skin="none"
                      type="button"
                      aria-pressed={gridPayment === "xaf"}
                      className={gridPayment === "xaf" ? styles.payActive : ""}
                      onClick={() => setGridPayment("xaf")}
                    >
                      <span>150 XAF</span>
                    </button>
                  </div>
                  <button
                    data-nj-skin="none"
                    type="button"
                    className={styles.oddsBtn}
                    onClick={() =>
                      setOddsModal({
                        title: "Grille des Pouvoirs",
                        kicker: "Chances par case",
                        rows: GRID_ODDS,
                        note: "Chaque case cache une carte Pouvoir permanente (1 fois par jour).",
                      })
                    }
                    aria-label="Chances par case"
                  >
                    ?
                  </button>
                </div>
              </div>

              {/* Tapis de table en bois acajou & feutre émeraude portant les 9 cartes */}
              <div className={styles.mysteryGridStage}>
                <div className={styles.feltMatFrame}>
                  <span className={styles.feltMatStitch} aria-hidden="true" />
                  <div className={styles.mysteryGrid} aria-busy={gridLoading || gridSelectingPosition !== null}>
                    {Array.from({ length: 9 }, (_, position) => {
                      const reward = gridRewards[String(position)];
                      const cardReward = reward?.type === "card" ? reward : null;
                      const powerCard = cardReward ? POWER_CARDS_BY_ID[cardReward.cardId as PowerCardId] : undefined;
                      const dup = Number(gridDuplicateCompensations[String(position)] ?? 0);
                      const selecting = gridSelectingPosition === position;

                      if (cardReward && powerCard) {
                        const pal = CATEGORY_MOTIF_PALETTE[powerCard.category];
                        return (
                          <motion.div
                            key={`rev-${position}`}
                            role="button"
                            tabIndex={0}
                            onClick={() => setSelectedGridCard(powerCard)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                setSelectedGridCard(powerCard);
                              }
                            }}
                            aria-label={`Voir les détails de ${powerCard.name}`}
                            initial={cascadeOn ? { rotateY: 180, scale: 0.84 } : false}
                            animate={{ rotateY: 0, scale: 1 }}
                            transition={{ type: "spring", stiffness: 280, damping: 22 }}
                            className={`${styles.gridRevealedCell} ${styles.clickableCard}`}
                            style={
                              {
                                "--c-primary": pal.primary,
                                "--c-secondary": pal.secondary,
                                "--c-glow": pal.glow,
                                "--c-top": pal.clothTop,
                                "--c-bot": pal.clothBot,
                              } as CSSProperties
                            }
                          >
                            <div className={styles.gridArtMask} aria-hidden="true">
                              <Image src={powerCard.art} alt={powerCard.name} fill sizes="120px" className={styles.gridCardImg} />
                            </div>
                            <PowerCardMotif
                              category={powerCard.category}
                              rarity={powerCard.rarity}
                              className={styles.gridMotifSvg}
                            />
                            <span className={styles.gridCellShade} aria-hidden="true" />
                            <strong className={styles.gridCellName}>{powerCard.name}</strong>
                            {dup > 0 && <span className={styles.gridDupPill}>+{dup} cauris</span>}
                          </motion.div>
                        );
                      }

                      return (
                        <motion.button
                          key={`hid-${position}`}
                          data-nj-skin="none"
                          type="button"
                          disabled={(!guestBlocked && blocked) || gridLoading || busy !== null || Boolean(reward)}
                          initial={cascadeOn ? { opacity: 0, y: 14, scale: 0.9 } : false}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          whileHover={cascadeOn ? { y: -5, rotateY: -8, scale: 1.04 } : undefined}
                          whileTap={{ scale: 0.95 }}
                          transition={{
                            type: "spring",
                            stiffness: 340,
                            damping: 24,
                            delay: cascadeOn ? position * 0.032 : 0,
                          }}
                          className={`${styles.gridHiddenCell}${selecting ? ` ${styles.cardCharging}` : ""}`}
                          onClick={() => void purchaseDailyGridCard(position, gridPayment)}
                          aria-label={`Révéler la case ${position + 1}`}
                        >
                          <Image src="/assets/njambo/books/card-back-256.webp" alt="" fill sizes="120px" className={styles.gridBackImg} />
                          <span className={styles.cardGlint} aria-hidden="true" />
                          <span className={styles.gridQuestion}>{selecting ? "✦" : "?"}</span>
                          <span className={styles.gridPriceBadge}>
                            {gridPayment === "cauris" ? "15 cauris" : "150 XAF"}
                          </span>
                        </motion.button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </motion.section>
          )}

          {/* ─── RAYON 4 : ROUE DES RETROUVAILLES (FESTIVAL ANIMÉ) ─── */}
          {tab === "wheel" && (
            <motion.section
              key="tab-wheel"
              className={styles.wheelArena}
              aria-label="Roulette de fidélité"
              initial={cascadeOn ? { opacity: 0, y: 12 } : false}
              animate={{ opacity: 1, y: 0 }}
              exit={cascadeOn ? { opacity: 0, y: -10 } : undefined}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            >
              <span className={styles.wheelStageRays} aria-hidden="true" />

              {/* Roue avec couronne d'ampoules + clapet doré + inertie réelle */}
              <div className={styles.wheelVisualWrap}>
                <span className={styles.wheelHalo} aria-hidden="true" />

                {/* Clapet / Pointeur en laiton à 12h */}
                <span
                  className={`${styles.wheelPointer}${busy === "wheel" ? ` ${styles.pointerTick}` : ""}`}
                  aria-hidden="true"
                />

                {/* Couronne lumineuse à 12 ampoules de fête */}
                <div className={styles.bulbRing} aria-hidden="true">
                  {Array.from({ length: 12 }, (_, bIdx) => (
                    <span
                      key={bIdx}
                      className={styles.bulbArm}
                      style={{ "--bulb-angle": `${bIdx * 30}deg` } as CSSProperties}
                    >
                      <span
                        className={`${styles.bulbDot}${bIdx % 2 === 0 ? ` ${styles.bulbEven}` : ` ${styles.bulbOdd}`}`}
                      />
                    </span>
                  ))}
                </div>

                {/* Disque de la roue avec physique de décélération fluide */}
                <motion.div
                  className={`${styles.wheelDisc}${busy === "wheel" ? ` ${styles.wheelSpinning}` : ""}`}
                  animate={{ rotate: wheelRotation }}
                  transition={{ duration: 2.4, ease: [0.14, 0.86, 0.22, 1] }}
                >
                  <Image
                    src="/assets/njambo/economy/loyalty-wheel-256.webp"
                    alt="Roulette de fidélité"
                    width={220}
                    height={220}
                    className={busy !== "wheel" && availableSpins > 0 ? styles.wheelIdleSway : undefined}
                  />
                </motion.div>

                <span className={styles.wheelCenterBadge}>
                  <strong>{loyaltyPoints}</strong>
                  <small>/7</small>
                </span>
              </div>

              {/* Panneau fidélité 7 jours + aperçu des lots + bouton 3D */}
              <div className={styles.wheelInfo}>
                <span className={styles.gridKicker}>Fidélité du Ter</span>
                <h2>La roue des retrouvailles</h2>
                <p>7 connexions débloquent un tour rempli de Nkap, Cauris, Tickets et Grimoires.</p>

                {/* Piste de 7 médaillons de fidélité */}
                <div className={styles.loyaltyTrack} aria-label={`${loyaltyPoints} jours sur 7`}>
                  {Array.from({ length: 7 }, (_, dIdx) => {
                    const earned = dIdx < loyaltyPoints;
                    const isGift = dIdx === 6;
                    return (
                      <span
                        key={dIdx}
                        className={`${styles.dayToken}${earned ? ` ${styles.dayTokenOn}` : ""}${isGift ? ` ${styles.dayTokenGift}` : ""}`}
                      >
                        {isGift ? "★" : dIdx + 1}
                      </span>
                    );
                  })}
                </div>

                {/* Aperçu 2,5D des lots à gagner */}
                <div className={styles.wheelPrizeStrip}>
                  {WHEEL_ODDS.slice(0, 4).map((item) => (
                    <button
                      key={item.label}
                      data-nj-skin="none"
                      type="button"
                      className={`${styles.wheelPrizeChip} ${styles.clickableChip}`}
                      onClick={() =>
                        setOddsModal({
                          title: "Roue des retrouvailles",
                          kicker: "Détails et probabilités des lots",
                          rows: WHEEL_ODDS.map(({ label, weight }) => ({ label, weight })),
                          note: "Les tickets, pass énergie et livres gagnés rejoignent Ma collection sans s’activer automatiquement.",
                        })
                      }
                    >
                      <Image src={item.icon} alt="" width={18} height={18} />
                      <span>{item.label}</span>
                    </button>
                  ))}
                  <button
                    data-nj-skin="none"
                    type="button"
                    className={styles.oddsLink}
                    onClick={() =>
                      setOddsModal({
                        title: "Roue des retrouvailles",
                        kicker: "Probabilités de la roue",
                        rows: WHEEL_ODDS.map(({ label, weight }) => ({ label, weight })),
                      })
                    }
                  >
                    Tous les lots ?
                  </button>
                </div>

                <div className={styles.wheelCtaRow}>
                  <span className={`${styles.spinPill}${availableSpins > 0 ? ` ${styles.spinPillReady}` : ""}`}>
                    {availableSpins} lancer{availableSpins > 1 ? "s" : ""} prêt{availableSpins > 1 ? "s" : ""}
                  </span>

                  <button
                    data-nj-skin="none"
                    type="button"
                    disabled={(!guestBlocked && (blocked || !availableSpins)) || busy !== null}
                    className={styles.spinCta}
                    onClick={() => void spinWheel()}
                  >
                    <span className={styles.btnSheen} aria-hidden="true" />
                    <NjamboIcon name="sparkle" tone="gold" size={21} />
                    <span>
                      {busy === "wheel"
                        ? "La roue tourne…"
                        : guestBlocked
                        ? "SE CONNECTER"
                        : "TOURNER LA ROUE"}
                    </span>
                  </button>
                </div>
              </div>
            </motion.section>
          )}
        </AnimatePresence>
      </div>

      {/* ═══ MODALE DÉTAILS D'UNE OFFRE (AU CLIC EN BOUTIQUE) ═══ */}
      <GameModal
        open={selectedOffer !== null}
        onClose={() => setSelectedOffer(null)}
        size="md"
        kicker={selectedOffer ? OFFER_KIND_LABEL[selectedOffer.type] : ""}
        title={selectedOffer?.title ?? ""}
        tone={selectedOffer?.type === "energy_pass" ? "teal" : "gold"}
        footer={
          selectedOffer ? (
            <div className={styles.detailFooter}>
              <button
                data-nj-skin="none"
                type="button"
                disabled={(!guestBlocked && blocked) || busy !== null}
                className={`${styles.priceBtn}${
                  selectedOffer.prices.some((p) => p.currency === "xaf")
                    ? ` ${styles.priceBtnGold}`
                    : ` ${styles.priceBtnTeal}`
                }`}
                onClick={() => void run(selectedOffer.id, () => purchase(selectedOffer.id))}
              >
                <span className={styles.btnSheen} aria-hidden="true" />
                <span>
                  {busy === selectedOffer.id
                    ? "Validation…"
                    : guestBlocked
                    ? `Se connecter · ${selectedOffer.prices.map(priceLabel).join(" / ")}`
                    : `Acheter · ${selectedOffer.prices.map(priceLabel).join(" / ")}`}
                </span>
              </button>
              {!guestBlocked && offerDeliverySummary(selectedOffer).storedInCollection && (
                <button
                  data-nj-skin="none"
                  type="button"
                  className={styles.detailSecondaryBtn}
                  onClick={() => {
                    setSelectedOffer(null);
                    openCollectionItems();
                  }}
                >
                  Ouvrir Ma collection →
                </button>
              )}
            </div>
          ) : undefined
        }
      >
        {selectedOffer && (() => {
          const delivery = offerDeliverySummary(selectedOffer);
          const stockLine = ownedStockForOffer(selectedOffer);
          const xaf = selectedOffer.prices.some((p) => p.currency === "xaf");
          const toneClass = OFFER_TONE_CLASS[selectedOffer.type] ?? "cardGold";
          return (
            <div className={`${styles.detailModalBody}${!loopsOn ? ` ${styles.motionReduced}` : ""}`}>
              <div className={`${styles.detailHeroStage} ${styles[toneClass]}`}>
                {selectedOffer.type === "energy_pass" ? (
                  <>
                    <span className={styles.detailEnergyWave} aria-hidden="true" />
                    <span className={`${styles.detailEnergyWave} ${styles.detailEnergyWave2}`} aria-hidden="true" />
                  </>
                ) : (
                  <span className={styles.detailSunburst} aria-hidden="true" />
                )}
                <span className={`${styles.detailSpark} ${styles.sp1}`} aria-hidden="true" />
                <span className={`${styles.detailSpark} ${styles.sp2}`} aria-hidden="true" />
                <span className={`${styles.detailSpark} ${styles.sp3}`} aria-hidden="true" />
                <span className={`${styles.detailSpark} ${styles.sp4}`} aria-hidden="true" />

                <motion.div
                  key={selectedOffer.id}
                  initial={cascadeOn ? { scale: 0.44, y: 20, rotate: -10, opacity: 0 } : false}
                  animate={{ scale: 1, y: 0, rotate: 0, opacity: 1 }}
                  transition={{ type: "spring", stiffness: 280, damping: 18 }}
                  className={styles.detailVisualWrap}
                >
                  <Image
                    src={offerArt(selectedOffer, 256)}
                    alt={selectedOffer.title}
                    width={116}
                    height={116}
                    className={`${styles.detailHeroImg} ${styles.detailHeroFloat}`}
                  />
                  <span className={styles.detailPedestalDisc} aria-hidden="true" />
                </motion.div>

                <div className={styles.detailHeroText}>
                  <div className={styles.detailTagsRow}>
                    <span className={styles.kindTag}>{OFFER_KIND_LABEL[selectedOffer.type]}</span>
                    {xaf && <span className={styles.simTag}>Paiement simulé</span>}
                    {stockLine && <span className={styles.detailStockLine}>{stockLine}</span>}
                  </div>
                  <p className={styles.detailFullDesc}>{selectedOffer.description}</p>
                </div>
              </div>

              <motion.div
                initial={cascadeOn ? { opacity: 0, y: 10 } : false}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.22, delay: 0.07 }}
                className={styles.detailDeliveryNote}
              >
                <strong>{delivery.storedInCollection ? "Conservation dans Ma collection" : "Livraison immédiate"}</strong>
                <p>{delivery.label}</p>
              </motion.div>

              {selectedOffer.rewards.length > 0 && (
                <motion.div
                  initial={cascadeOn ? { opacity: 0, y: 10 } : false}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.24, delay: 0.11 }}
                  className={styles.detailBlock}
                >
                  <h3>Contenu garanti</h3>
                  <div className={styles.detailRewardsList}>
                    {selectedOffer.rewards.map((reward, idx) => (
                      <motion.div
                        key={idx}
                        initial={cascadeOn ? { opacity: 0, x: -10 } : false}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.22, delay: 0.13 + idx * 0.05 }}
                        className={styles.detailRewardRow}
                      >
                        <Image src={rewardIconSrc(reward)} alt="" width={30} height={30} />
                        <div>
                          <strong>{rewardLabel(reward)}</strong>
                          <small>{rewardDeliveryNote(reward)}</small>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </motion.div>
              )}

              {(selectedOffer.randomRewards?.length || selectedOffer.rewardGroups?.length) && (
                <motion.div
                  initial={cascadeOn ? { opacity: 0, y: 10 } : false}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.24, delay: 0.16 }}
                  className={styles.detailBlock}
                >
                  <h3>Lots aléatoires & probabilités</h3>
                  <div className={styles.oddsList}>
                    {selectedOffer.randomRewards?.map((entry, idx) => (
                      <motion.div
                        key={`rand-${idx}`}
                        initial={cascadeOn ? { opacity: 0, x: -8 } : false}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.2, delay: 0.18 + idx * 0.04 }}
                        className={styles.oddsRow}
                      >
                        <span>{rewardLabel(entry.value)}</span>
                        <strong>{entry.weight} %</strong>
                      </motion.div>
                    ))}
                    {selectedOffer.rewardGroups?.map((group, gIdx) =>
                      group.map((entry, eIdx) => (
                        <motion.div
                          key={`grp-${gIdx}-${eIdx}`}
                          initial={cascadeOn ? { opacity: 0, x: -8 } : false}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ duration: 0.2, delay: 0.18 + (gIdx * 3 + eIdx) * 0.035 }}
                          className={styles.oddsRow}
                        >
                          <span>Lot {gIdx + 1} · {rewardLabel(entry.value)}</span>
                          <strong>{entry.weight} %</strong>
                        </motion.div>
                      )),
                    )}
                  </div>
                </motion.div>
              )}

              {selectedOffer.ageRestrictedXaf && (
                <p className={styles.oddsNote}>
                  Les achats simulés en XAF nécessitent la confirmation « 18 ans + » dans ton profil.
                </p>
              )}
            </div>
          );
        })()}
      </GameModal>

      {/* ═══ MODALE DÉTAILS D'UN LIVRE DE BOOSTER ═══ */}
      <GameModal
        open={selectedBooster !== null}
        onClose={() => setSelectedBooster(null)}
        size="md"
        kicker="Livre de Pouvoirs"
        title={selectedBooster?.title ?? ""}
        tone="gold"
        footer={
          selectedBooster ? (() => {
            const caurisPrice = selectedBooster.prices.find((p) => p.currency === "cauris");
            const xafOffer = offers.find((o) => o.id === `booster_${selectedBooster.id}_xaf`);
            const ownedCount = Number(inventory.boosterBooks?.[selectedBooster.id] ?? 0);
            return (
              <div className={styles.detailFooter}>
                {caurisPrice && (
                  <button
                    data-nj-skin="none"
                    type="button"
                    disabled={(!guestBlocked && blocked) || busy !== null}
                    className={`${styles.priceBtn} ${styles.priceBtnTeal}`}
                    onClick={() => void run(selectedBooster.id, () => buyBookWithCauris(selectedBooster))}
                  >
                    <span className={styles.btnSheen} aria-hidden="true" />
                    <span>
                      {busy === selectedBooster.id
                        ? "Achat…"
                        : guestBlocked
                        ? `Se connecter · ${priceLabel(caurisPrice)}`
                        : `Acheter · ${priceLabel(caurisPrice)}`}
                    </span>
                  </button>
                )}
                {xafOffer && (
                  <button
                    data-nj-skin="none"
                    type="button"
                    disabled={(!guestBlocked && blocked) || busy !== null}
                    className={`${styles.priceBtn} ${styles.priceBtnGold}`}
                    onClick={() => void run(xafOffer.id, async () => {
                      const res = await purchase(xafOffer.id);
                      setSelectedBooster(null);
                      return res;
                    })}
                  >
                    <span className={styles.btnSheen} aria-hidden="true" />
                    <span>
                      {busy === xafOffer.id
                        ? "Validation…"
                        : `Acheter · ${xafOffer.prices.map(priceLabel).join(" / ")} (Simulé)`}
                    </span>
                  </button>
                )}
                {!guestBlocked && ownedCount > 0 && (
                  <button
                    data-nj-skin="none"
                    type="button"
                    className={styles.detailSecondaryBtn}
                    onClick={() => {
                      setSelectedBooster(null);
                      openCollectionItems();
                    }}
                  >
                    Ouvrir dans Ma collection ({ownedCount} en stock) →
                  </button>
                )}
              </div>
            );
          })() : undefined
        }
      >
        {selectedBooster && (
          <div className={`${styles.detailModalBody}${!loopsOn ? ` ${styles.motionReduced}` : ""}`}>
            <div
              className={`${styles.detailHeroStage} ${
                selectedBooster.id === "exceptionnel"
                  ? styles.bookGold
                  : selectedBooster.id === "rare"
                  ? styles.bookBlue
                  : styles.bookTeal
              }`}
            >
              <span className={styles.detailRuneRing} aria-hidden="true" />
              <span className={styles.detailSunburst} aria-hidden="true" />
              <span className={`${styles.detailSpark} ${styles.sp1}`} aria-hidden="true" />
              <span className={`${styles.detailSpark} ${styles.sp2}`} aria-hidden="true" />
              <span className={`${styles.detailSpark} ${styles.sp3}`} aria-hidden="true" />
              <span className={`${styles.detailSpark} ${styles.sp4}`} aria-hidden="true" />

              <motion.div
                key={selectedBooster.id}
                initial={cascadeOn ? { scale: 0.44, y: 20, rotate: -8, opacity: 0 } : false}
                animate={{ scale: 1, y: 0, rotate: 0, opacity: 1 }}
                transition={{ type: "spring", stiffness: 270, damping: 18 }}
                className={styles.detailVisualWrap}
              >
                <span className={`${styles.bookBackCard} ${styles.detailBbcLeft}`} aria-hidden="true" />
                <span className={`${styles.bookBackCard} ${styles.detailBbcRight}`} aria-hidden="true" />
                <Image
                  src={boosterBookArt(selectedBooster.id, 256)}
                  alt={selectedBooster.title}
                  width={120}
                  height={120}
                  className={`${styles.detailHeroImg} ${styles.detailHeroFloat}`}
                />
                <span className={styles.detailPedestalDisc} aria-hidden="true" />
              </motion.div>

              <div className={styles.detailHeroText}>
                <div className={styles.detailTagsRow}>
                  <span className={styles.kindTag}>9 cartes face cachée</span>
                  {!guestBlocked && (
                    <span className={styles.detailStockLine}>
                      En stock dans Ma collection : {Number(inventory.boosterBooks?.[selectedBooster.id] ?? 0)}
                    </span>
                  )}
                </div>
                <p className={styles.detailFullDesc}>
                  Un grimoire renfermant 9 cartes Pouvoir secrètes. Une fois acheté, ouvre-le depuis Ma collection pour en révéler et garder 1 carte.
                </p>
              </div>
            </div>

            <motion.div
              initial={cascadeOn ? { opacity: 0, y: 10 } : false}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.22, delay: 0.07 }}
              className={styles.detailDeliveryNote}
            >
              <strong>Ouverture différée dans Ma collection</strong>
              <p>L’achat range ce livre dans Ma collection sans l’ouvrir immédiatement.</p>
            </motion.div>

            <motion.div
              initial={cascadeOn ? { opacity: 0, y: 10 } : false}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.24, delay: 0.11 }}
              className={styles.detailBlock}
            >
              <h3>Probabilités par rareté</h3>
              <div className={styles.rarityBar} aria-hidden="true">
                {selectedBooster.rarityWeights.map((entry, idx) => (
                  <motion.span
                    key={entry.value}
                    initial={cascadeOn ? { width: "0%" } : false}
                    animate={{ width: `${entry.weight}%` }}
                    transition={{ duration: 0.46, delay: 0.12 + idx * 0.06, ease: [0.22, 1, 0.36, 1] }}
                    className={styles[`bar_${entry.value}`]}
                  />
                ))}
              </div>
              <div className={styles.oddsList}>
                {selectedBooster.rarityWeights.map((entry, idx) => (
                  <motion.div
                    key={entry.value}
                    initial={cascadeOn ? { opacity: 0, x: -8 } : false}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.2, delay: 0.14 + idx * 0.04 }}
                    className={styles.oddsRow}
                  >
                    <span>{RARITY_LABELS[entry.value] ?? entry.value}</span>
                    <strong>{entry.weight} %</strong>
                  </motion.div>
                ))}
              </div>
              <p className={styles.oddsNote}>
                Garantie : {RARITY_LABELS[selectedBooster.pity.minimumRarity]} ou mieux au {selectedBooster.pity.threshold}e livre sans obtention.
                Les doublons sont automatiquement convertis en cauris.
              </p>
            </motion.div>
          </div>
        )}
      </GameModal>

      {/* ═══ MODALE DÉTAILS D'UNE CARTE RÉVÉLÉE DE LA GRILLE ═══ */}
      <GameModal
        open={selectedGridCard !== null}
        onClose={() => setSelectedGridCard(null)}
        size="md"
        kicker={selectedGridCard ? CATEGORY_MOTIF_PALETTE[selectedGridCard.category].label : ""}
        title={selectedGridCard?.name ?? ""}
        tone="gold"
        footer={
          <button
            data-nj-skin="none"
            type="button"
            className={styles.spinCta}
            onClick={() => {
              setSelectedGridCard(null);
              setCollectionTab("powers");
              navigateTo("power_collection");
            }}
          >
            <span className={styles.btnSheen} aria-hidden="true" />
            <span>Voir dans Ma collection →</span>
          </button>
        }
      >
        {selectedGridCard && (
          <div className={styles.revealBox}>
            <div
              className={styles.revealStage}
              style={{ "--rev-tone": CATEGORY_MOTIF_PALETTE[selectedGridCard.category].primary } as CSSProperties}
            >
              <span className={styles.revealBurstRays} aria-hidden="true" />
              <motion.div
                key={selectedGridCard.id}
                initial={cascadeOn ? { rotateY: 160, scale: 0.52, opacity: 0 } : false}
                animate={{ rotateY: 0, scale: 1, opacity: 1 }}
                transition={{ type: "spring", stiffness: 230, damping: 18 }}
                className={styles.revealCardFrame}
              >
                <PowerCardView card={selectedGridCard} showMeta className={styles.revealCardArtifact} />
              </motion.div>
            </div>
            <strong>{selectedGridCard.name}</strong>
            <p>{selectedGridCard.description}</p>
          </div>
        )}
      </GameModal>

      {/* ═══ MODALE PROBABILITÉS ═══ */}
      <GameModal open={oddsModal !== null} onClose={() => setOddsModal(null)} size="md" kicker={oddsModal?.kicker} title={oddsModal?.title ?? ""} tone="gold">
        {oddsModal && (
          <div className={styles.oddsList}>
            {oddsModal.rows.map((row, idx) => (
              <motion.div
                key={idx}
                initial={cascadeOn ? { opacity: 0, x: -8 } : false}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.2, delay: idx * 0.035 }}
                className={styles.oddsRow}
              >
                <span>{row.label}</span>
                <strong>{row.weight} %</strong>
              </motion.div>
            ))}
            {oddsModal.note && <p className={styles.oddsNote}>{oddsModal.note}</p>}
          </div>
        )}
      </GameModal>

      {/* ═══ MODALE CONNEXION EN PLACE ═══ */}
      <GameModal open={authModalOpen} onClose={() => setAuthModalOpen(false)} kicker="Boutique du quartier" title="Connecte ton compte" tone="gold">
        <AuthGate tone="gold" accountBar="none">
          <div className={styles.authDone}>Compte connecté ! Tes achats sont maintenant débloqués.</div>
        </AuthGate>
      </GameModal>

      {/* ═══ MODALE RÉVÉLATION DE CARTE (FLIP 3D + EXPLOSION SOLAIRE) ═══ */}
      <GameModal
        open={cardReveal !== null}
        onClose={() => setCardReveal(null)}
        size="md"
        className={!loopsOn ? styles.motionReduced : undefined}
        kicker={cardReveal ? (RARITY_LABELS[cardReveal.rarity] ?? cardReveal.rarity) : ""}
        title={cardReveal?.duplicateCompensation ? "Doublon converti !" : "Nouvelle Carte Pouvoir !"}
        tone="gold"
        footer={
          <button data-nj-skin="none" type="button" className={styles.spinCta} onClick={() => setCardReveal(null)}>
            <span className={styles.btnSheen} aria-hidden="true" />
            <span>
              {cardReveal?.duplicateCompensation
                ? `Récupérer +${cardReveal.duplicateCompensation} cauris`
                : "Ajouter à ma collection"}
            </span>
          </button>
        }
      >
        {cardReveal && (
          <div className={styles.revealBox}>
            <div
              className={`${styles.revealStage} ${styles[`rev_${cardReveal.rarity}`] ?? ""}`}
              style={
                revealedCard
                  ? ({ "--rev-tone": CATEGORY_MOTIF_PALETTE[revealedCard.category].primary } as CSSProperties)
                  : undefined
              }
            >
              <span className={styles.revealBurstRays} aria-hidden="true" />
              {revealedCard && (
                <motion.div
                  initial={{ rotateY: 180, scale: 0.55, opacity: 0 }}
                  animate={{ rotateY: 0, scale: 1, opacity: 1 }}
                  transition={{ type: "spring", stiffness: 220, damping: 18 }}
                  className={styles.revealCardFrame}
                >
                  <PowerCardView card={revealedCard} showMeta className={styles.revealCardArtifact} />
                </motion.div>
              )}
            </div>
            <strong>{revealedCard?.name ?? cardReveal.cardId}</strong>
            <p>{revealedCard?.description ?? "Cette carte rejoint ta collection permanente."}</p>
          </div>
        )}
      </GameModal>

      {/* ═══ MODALE GAIN DE LA ROUE ═══ */}
      <GameModal
        open={wheelReward !== null}
        onClose={() => setWheelReward(null)}
        size="md"
        className={!loopsOn ? styles.motionReduced : undefined}
        kicker="La roue des retrouvailles"
        title="Récompense remportée !"
        tone="gold"
        footer={
          wheelReward && wheelReward.type !== "nkap" && wheelReward.type !== "cauris" ? (
            <div className={styles.detailFooter}>
              <button
                data-nj-skin="none"
                type="button"
                className={styles.spinCta}
                onClick={() => {
                  setWheelReward(null);
                  openCollectionItems();
                }}
              >
                <span>Voir dans Ma collection →</span>
              </button>
              <button data-nj-skin="none" type="button" className={styles.detailSecondaryBtn} onClick={() => setWheelReward(null)}>
                Fermer
              </button>
            </div>
          ) : (
            <button data-nj-skin="none" type="button" className={styles.spinCta} onClick={() => setWheelReward(null)}>
              <span>Super, merci !</span>
            </button>
          )
        }
      >
        {wheelReward && (
          <div className={styles.revealBox}>
            <div className={styles.revealStage}>
              <span className={styles.revealBurstRays} aria-hidden="true" />
              <motion.div
                initial={{ scale: 0.4, rotate: -14, opacity: 0 }}
                animate={{ scale: 1, rotate: 0, opacity: 1 }}
                transition={{ type: "spring", stiffness: 260, damping: 16 }}
                className={styles.wheelWinOrb}
              >
                <Image src={rewardIconSrc(wheelReward)} alt="" width={104} height={104} />
              </motion.div>
            </div>
            <strong>{rewardLabel(wheelReward)}</strong>
            <p>
              {wheelReward.type === "nkap" || wheelReward.type === "cauris"
                ? "Ton lot vient d’être crédité directement sur ton portefeuille."
                : "Ton objet a été ajouté à Ma collection — clique dessus quand tu veux l’utiliser ou l’ouvrir !"}
            </p>
          </div>
        )}
      </GameModal>
    </GameShell>
  );
}
