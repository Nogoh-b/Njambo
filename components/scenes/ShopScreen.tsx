"use client";

import Image from "next/image";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { AnimatePresence, motion } from "motion/react";
import { type BoosterDefinition, type OfferDefinition, type Reward } from "@/domain";
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
import type { PowerCardId } from "@/types/game";
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

const RARITY_LABELS: Record<string, string> = {
  village: "Village",
  notable: "Notable",
  chef: "Chef",
  ancetre: "Ancêtre",
};

const OFFER_KIND_LABEL: Record<OfferDefinition["type"], string> = {
  cauris_pack: "Cauris",
  nkap_conversion: "Nkap",
  energy_pass: "Énergie",
  ticket: "Ticket Ter",
  element_pack: "Pack Royal",
};

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

function rewardLabel(reward: Reward) {
  if (reward.type === "nkap") return `${reward.amount.toLocaleString("fr-FR")} Nkap`;
  if (reward.type === "cauris") return `${reward.amount} cauris`;
  if (reward.type === "ticket") return `${reward.amount} ticket ${reward.tier}`;
  if (reward.type === "energy_pass") return `Énergie ${reward.durationMinutes === 1_440 ? "24 h" : `${reward.durationMinutes / 60} h`}`;
  if (reward.type === "booster_book") return `${reward.amount} livre ${reward.boosterId}`;
  return `Carte ${RARITY_LABELS[reward.rarity] ?? reward.rarity}`;
}

function rewardIconSrc(reward: Reward): string {
  if (reward.type === "nkap") return "/assets/njambo/economy/nkap-stack-64.webp";
  if (reward.type === "cauris") return "/assets/njambo/economy/cauris-pouch-64.webp";
  if (reward.type === "ticket") return `/assets/njambo/tickets/ticket-${reward.tier}-64.webp`;
  if (reward.type === "energy_pass") return "/assets/njambo/economy/energy-flask-64.webp";
  if (reward.type === "booster_book") {
    const id = ["normal", "rare", "exceptionnel"].includes(reward.boosterId) ? reward.boosterId : "normal";
    return `/assets/njambo/books/book-${id}-128.webp`;
  }
  return "/assets/njambo/books/card-back-128.webp";
}

function offerArt(offer: OfferDefinition) {
  if (offer.type === "cauris_pack") return "/assets/njambo/economy/cauris-pouch-256.webp";
  if (offer.type === "nkap_conversion") return "/assets/njambo/economy/nkap-stack-256.webp";
  if (offer.type === "energy_pass") return "/assets/njambo/economy/energy-flask-256.webp";
  if (offer.type === "ticket") return `/assets/njambo/tickets/ticket-${offer.id.replace("ticket_", "")}-256.webp`;
  if (offer.id.startsWith("booster_")) return `/assets/njambo/books/book-${offer.id.replace("booster_", "").replace("_xaf", "")}-256.webp`;
  if (offer.id.startsWith("pack_")) return `/assets/njambo/economy/${offer.id.replaceAll("_", "-")}-256.webp`;
  return "/assets/njambo/books/card-back-256.webp";
}

function priceLabel(price: OfferDefinition["prices"][number]) {
  return `${price.amount.toLocaleString("fr-FR")} ${price.currency === "xaf" ? "XAF" : "cauris"}`;
}

export function ShopScreen() {
  const { navigateTo } = useGame();
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
  const [message, setMessage] = useState<{ severity: "success" | "warning" | "error"; text: string } | null>(null);
  const [opening, setOpening] = useState<{ openingId: string; positions: number[] } | null>(null);
  const [cardReveal, setCardReveal] = useState<CardReveal | null>(null);
  const [wheelReward, setWheelReward] = useState<Reward | null>(null);
  const [wheelRotation, setWheelRotation] = useState(0);
  const [gridSelectingPosition, setGridSelectingPosition] = useState<number | null>(null);
  const [gridPayment, setGridPayment] = useState<"cauris" | "xaf">("cauris");
  const [oddsModal, setOddsModal] = useState<OddsModalData | null>(null);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [walletPulse, setWalletPulse] = useState(false);

  const guestBlocked = !user || user.isAnonymous;
  const blocked = guestBlocked || economyLoading || Boolean(economy?.spendingBlocked);
  const cascadeOn = motionProfile.allowEntranceCascade;
  const loopsOn = motionProfile.allowDecorativeLoop;

  useEffect(() => {
    if (!guestBlocked && authModalOpen) setAuthModalOpen(false);
  }, [guestBlocked, authModalOpen]);

  useEffect(() => {
    if (pendingBoosterOpening) {
      setOpening({ openingId: pendingBoosterOpening.openingId, positions: pendingBoosterOpening.positions });
    }
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

  const totalOwnedBooks = useMemo(
    () => Object.values(inventory.boosterBooks ?? {}).reduce((sum, n) => sum + Number(n ?? 0), 0),
    [inventory.boosterBooks],
  );

  const availableSpins = economy?.daily.availableSpins ?? 0;
  const loyaltyPoints = economy?.daily.loyaltyPoints ?? 0;

  const run = async (key: string, action: () => Promise<string | void>) => {
    if (guestBlocked) {
      setAuthModalOpen(true);
      return;
    }
    setBusy(key);
    setMessage(null);
    try {
      const confirmation = await action();
      triggerWalletPulse();
      if (confirmation) {
        setMessage({ severity: "success", text: confirmation });
      }
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : "";
      const insufficient = /insufficient|solde|balance/i.test(reason);
      setMessage({
        severity: insufficient ? "warning" : "error",
        text: insufficient
          ? "Ton solde est insuffisant pour cet achat."
          : /unavailable|not-found/i.test(reason)
            ? "Cette offre n’est plus disponible."
            : "L’opération a été refusée. Réessaie dans un instant.",
      });
    } finally {
      setBusy(null);
    }
  };

  const purchase = async (offerId: string): Promise<string | void> => {
    const offer = offers.find((candidate) => candidate.id === offerId);
    if (!offer) return;
    if (offer.prices.some((price) => price.currency === "cauris")) {
      await command("purchaseOffer", { offerId });
      return `${offer.title} ajouté à ton coffre !`;
    }
    const intent = await command<{ orderId: string }>("createPaymentIntent", { offerId, provider: "simulated" });
    await command("verifyStorePurchase", { orderId: intent.orderId, simulationOutcome: "success" });
    return `Paiement simulé confirmé : ${offer.title} !`;
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
      return `La roue t’offre ${rewardLabel(result.reward)} !`;
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
            onClick={() => navigateTo("menu")}
            aria-label="Retour au salon"
          >
            <span aria-hidden="true">←</span>
            <span className={styles.backLabel}>Salon</span>
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
            <button data-nj-skin="none" type="button" onClick={() => setMessage(null)} aria-label="Fermer">✕</button>
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
                        initial={cascadeOn ? { opacity: 0, y: 16, scale: 0.96 } : false}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        transition={{
                          type: "spring",
                          stiffness: 340,
                          damping: 26,
                          delay: cascadeOn ? Math.min(idx * 0.045, 0.24) : 0,
                        }}
                        className={`${styles.shelfCard} ${styles[toneClass]}${isHeroFeatured ? ` ${styles.shelfCardHero}` : ""}`}
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
                                  onClick={() => openOfferOdds(offer)}
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
                          <h2>{offer.title}</h2>
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
                            onClick={() => void run(offer.id, () => purchase(offer.id))}
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
                          initial={cascadeOn ? { opacity: 0, y: 20, scale: 0.95 } : false}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          transition={{
                            type: "spring",
                            stiffness: 320,
                            damping: 25,
                            delay: cascadeOn ? idx * 0.07 : 0,
                          }}
                          className={`${styles.bookCard} ${tierClass}`}
                          style={{ "--float-delay": `${idx * 0.45}s` } as CSSProperties}
                        >
                          <span className={styles.shelfTrim} aria-hidden="true" />
                          <span className={styles.holoSheen} aria-hidden="true" />

                          <div className={styles.bookPedestal}>
                            <span className={styles.runeHalo} aria-hidden="true" />
                            <div className={styles.pedestalTop}>
                              <span className={styles.kindTag}>
                                {ownedBooks > 0 ? `×${ownedBooks} en stock` : "9 cartes cachées"}
                              </span>
                              <button
                                data-nj-skin="none"
                                type="button"
                                className={styles.oddsBtn}
                                onClick={() => openBoosterOdds(booster)}
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
                                src={`/assets/njambo/books/book-${booster.id}-256.webp`}
                                alt={booster.title}
                                width={136}
                                height={136}
                                className={styles.itemImg}
                              />
                              <span className={styles.itemShadow} aria-hidden="true" />
                            </div>
                          </div>

                          <div className={styles.bookBody}>
                            <h2>{booster.title}</h2>
                            <p>Choisis 1 carte Pouvoir parmi 9 cartes face cachée.</p>

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
                              disabled={(!guestBlocked && blocked) || busy !== null}
                              className={styles.bookBuyBtn}
                              onClick={() =>
                                void run(booster.id, async () => {
                                  const result = await command<{ openingId: string; positions: number[] }>(
                                    "openBoosterBook",
                                    { boosterId: booster.id },
                                  );
                                  setOpening({
                                    openingId: result.openingId,
                                    positions: result.positions ?? Array.from({ length: 9 }, (_, i) => i),
                                  });
                                  return `${booster.title} ouvert : choisis ta carte !`;
                                })
                              }
                            >
                              <span className={styles.btnSheen} aria-hidden="true" />
                              <span>
                                {busy === booster.id
                                  ? "Ouverture…"
                                  : ownedBooks > 0
                                    ? `Ouvrir (${ownedBooks} en stock)`
                                    : caurisPrice
                                      ? `Ouvrir · ${priceLabel(caurisPrice)}`
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
                            initial={cascadeOn ? { rotateY: 180, scale: 0.84 } : false}
                            animate={{ rotateY: 0, scale: 1 }}
                            transition={{ type: "spring", stiffness: 280, damping: 22 }}
                            className={styles.gridRevealedCell}
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
                    <span key={item.label} className={styles.wheelPrizeChip}>
                      <Image src={item.icon} alt="" width={18} height={18} />
                      <span>{item.label}</span>
                    </span>
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

      {/* ═══ MODALE PROBABILITÉS ═══ */}
      <GameModal open={oddsModal !== null} onClose={() => setOddsModal(null)} kicker={oddsModal?.kicker} title={oddsModal?.title ?? ""} tone="gold">
        {oddsModal && (
          <div className={styles.oddsList}>
            {oddsModal.rows.map((row, idx) => (
              <div key={idx} className={styles.oddsRow}>
                <span>{row.label}</span>
                <strong>{row.weight} %</strong>
              </div>
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
        kicker="La roue des retrouvailles"
        title="Récompense remportée !"
        tone="gold"
        footer={
          <button data-nj-skin="none" type="button" className={styles.spinCta} onClick={() => setWheelReward(null)}>
            <span>Super, merci !</span>
          </button>
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
            <p>Ton lot vient d&apos;être ajouté directement à ton coffre royal.</p>
          </div>
        )}
      </GameModal>
    </GameShell>
  );
}
