"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { type OfferDefinition, type Reward } from "@/domain";
import { useAuth } from "@/hooks/useAuth";
import { useEconomy } from "@/contexts/EconomyContext";
import { useGame } from "@/contexts/GameContext";
import { useDailyGrid, useLiveOpsContent } from "@/hooks/useLiveOpsContent";
import { t } from "@/lib/i18n";
import { GameHubLayout } from "@/components/ui/GameHubLayout";
import { EmptyState, GameCard, GameTabs, ResourcePill, RewardPreview, StatusBanner } from "@/components/ui/GamePrimitives";
import { NjamboIcon, type NjamboIconName } from "@/components/ui/Art";
import { PowerCardView } from "@/components/power/PowerCardView";
import { POWER_CARDS_BY_ID } from "@/config/powerCards";
import { useMotionProfile } from "@/lib/motion";
import type { PowerCardId } from "@/types/game";
import styles from "./GameHubs.module.css";

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

const REVEAL_TONES: Record<string, string> = {
  village: "#35dbc4",
  notable: "#5d8cff",
  chef: "#ec5b83",
  ancetre: "#f3c969",
};

const SHOP_TABS = [
  { id: "offers", label: t("shop.offers") },
  { id: "boosters", label: t("shop.boosters") },
  { id: "grid", label: t("shop.dailyGrid") },
  { id: "wheel", label: t("shop.wheel") },
];

const OFFER_CATEGORIES: Array<{ id: OfferCategory; label: string }> = [
  { id: "featured", label: t("shop.category.featured") },
  { id: "cauris_pack", label: t("shop.category.cauris") },
  { id: "nkap_conversion", label: t("shop.category.nkap") },
  { id: "energy_pass", label: t("shop.category.energy") },
  { id: "ticket", label: t("shop.category.tickets") },
  { id: "element_pack", label: t("shop.category.packs") },
];

const FEATURED_OFFER_IDS = ["cauris_110", "nkap_3000", "energy_120", "ticket_bronze", "pack_mboa"];

const RARITY_LABELS: Record<string, string> = {
  village: "Village",
  notable: "Notable",
  chef: "Chef",
  ancetre: "Ancêtre",
};

function rewardLabel(reward: Reward) {
  if (reward.type === "nkap") return `${reward.amount.toLocaleString("fr-FR")} Nkap`;
  if (reward.type === "cauris") return `${reward.amount} cauris`;
  if (reward.type === "ticket") return `${reward.amount} ticket ${reward.tier}`;
  if (reward.type === "energy_pass") return `Énergie ${reward.durationMinutes === 1_440 ? "24 h" : `${reward.durationMinutes / 60} h`}`;
  if (reward.type === "booster_book") return `${reward.amount} livre ${reward.boosterId}`;
  return `Carte ${RARITY_LABELS[reward.rarity] ?? reward.rarity}`;
}

function rewardIcon(reward: Reward): NjamboIconName {
  if (reward.type === "nkap") return "coin";
  if (reward.type === "cauris") return "sparkle";
  if (reward.type === "energy_pass") return "hourglass";
  return "cards";
}

function offerArt(offer: OfferDefinition) {
  if (offer.type === "cauris_pack") return "/assets/njambo/economy/cauris-pouch-256.webp";
  if (offer.type === "nkap_conversion") return "/assets/njambo/economy/nkap-stack-256.webp";
  if (offer.type === "energy_pass") return "/assets/njambo/economy/energy-flask-256.webp";
  if (offer.type === "ticket") return `/assets/njambo/tickets/ticket-${offer.id.replace("ticket_", "")}-256.webp`;
  if (offer.id.startsWith("booster_")) return `/assets/njambo/books/book-${offer.id.replace("booster_", "").replace("_xaf", "")}-256.webp`;
  if (offer.id.startsWith("pack_")) return `/assets/njambo/economy/${offer.id.replaceAll("_", "-")}-256.webp`;
  return "/assets/njambo/books/card-back.webp";
}

function priceLabel(price: OfferDefinition["prices"][number]) {
  return `${price.amount.toLocaleString("fr-FR")} ${price.currency === "xaf" ? "XAF" : "cauris"}`;
}

function PowerCardReveal({ reveal, onContinue }: { reveal: CardReveal; onContinue: () => void }) {
  const motion = useMotionProfile();
  const titleRef = useRef<HTMLHeadingElement>(null);
  const closeTimerRef = useRef<number | null>(null);
  const [closing, setClosing] = useState(false);
  const card = POWER_CARDS_BY_ID[reveal.cardId as PowerCardId];
  const duplicate = reveal.duplicateCompensation > 0;
  const fromGrid = reveal.source === "daily-grid";
  const tone = REVEAL_TONES[reveal.rarity] ?? REVEAL_TONES.notable;
  const particleCount = reveal.rarity === "ancetre" ? 28 : reveal.rarity === "chef" ? 20 : reveal.rarity === "notable" ? 14 : 8;

  useEffect(() => {
    titleRef.current?.focus({ preventScroll: true });
    return () => {
      if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
    };
  }, []);

  const handleContinue = () => {
    if (!motion.enabled) {
      onContinue();
      return;
    }
    setClosing(true);
    closeTimerRef.current = window.setTimeout(onContinue, 260);
  };

  return (
    <GameCard
      variant="default"
      className={[
        styles.openingPanel,
        styles.revealPanel,
        styles.shopTabPanel,
        fromGrid && styles.gridRevealPanel,
        closing && styles.revealClosing,
        !motion.enabled && styles.motionOff,
        motion.enabled && motion.level === "lite" && styles.motionLite,
      ].filter(Boolean).join(" ")}
    >
      <div className={styles.openingHeading}>
        <span><NjamboIcon name={duplicate ? "history" : fromGrid ? "sparkle" : "cards"} tone="gold" size={28} /></span>
        <div>
          <h2 ref={titleRef} tabIndex={-1} className={styles.revealTitle}>{duplicate ? "Carte déjà possédée" : fromGrid ? "Trésor de la grille !" : "Nouvelle carte Pouvoir !"}</h2>
          <p>{duplicate ? "Ton doublon est remplacé par des cauris." : fromGrid ? "La case révèle une carte Pouvoir permanente." : "Elle rejoint définitivement ta collection."}</p>
        </div>
      </div>

      <div
        className={`${styles.revealStage} ${styles[`revealTier_${reveal.rarity}`] ?? ""}`}
        aria-live="polite"
        style={{ "--reveal-tone": tone } as CSSProperties}
      >
        <span className={styles.revealAura} aria-hidden="true" />
        {motion.allowParticles && (
          <div className={styles.revealParticles} aria-hidden="true">
            {Array.from({ length: particleCount }, (_, index) => (
              <i
                key={index}
                style={{
                  "--particle-angle": `${index * (360 / particleCount)}deg`,
                  "--particle-delay": `${320 + index * 12}ms`,
                } as CSSProperties}
              />
            ))}
          </div>
        )}
        <div className={styles.revealCard}>
          <div className={styles.revealCardInner}>
            <div className={`${styles.revealFace} ${styles.revealBack}`} aria-hidden="true">
              <Image src="/assets/njambo/books/card-back-256.webp" alt="" width={180} height={250} priority />
            </div>
            <div className={`${styles.revealFace} ${styles.revealFront}`}>
              {card ? (
                <div className={styles.revealPowerHero}>
                  <span className={styles.revealPowerBadge}><NjamboIcon name="spark" tone="gold" size={13} /> Carte Pouvoir</span>
                  <PowerCardView card={card} selected showMeta={false} className={styles.revealPowerCardView} />
                </div>
              ) : (
                <div className={styles.revealFallback}>
                  <NjamboIcon name="cards" tone="gold" size={36} />
                  <strong>{reveal.cardId}</strong>
                  <span>{RARITY_LABELS[reveal.rarity] ?? reveal.rarity}</span>
                </div>
              )}
            </div>
          </div>
          {duplicate && (
            <span className={styles.duplicateFloat} aria-hidden="true">
              <NjamboIcon name="sparkle" tone="gold" size={15} /> +{reveal.duplicateCompensation} cauris
            </span>
          )}
        </div>

        <div className={`${styles.revealResult} ${duplicate ? styles.duplicateResult : styles.newCardResult}`}>
          <span className={styles.revealEyebrow}>{RARITY_LABELS[reveal.rarity] ?? reveal.rarity}</span>
          <strong>{card?.name ?? reveal.cardId}</strong>
          {duplicate ? (
            <p>Tu possèdes déjà cette carte. Elle est automatiquement échangée contre <b>+{reveal.duplicateCompensation} cauris</b>.</p>
          ) : (
            <p>Carte débloquée et disponible dans ta collection de Pouvoirs.</p>
          )}
          <button data-nj-skin="gold" type="button" className={styles.revealContinue} disabled={closing} onClick={handleContinue}>
            {duplicate ? `Continuer avec +${reveal.duplicateCompensation} cauris` : "Ajouter à ma collection"}
          </button>
        </div>
      </div>
    </GameCard>
  );
}

export function ShopScreen() {
  const motion = useMotionProfile();
  const { navigateTo } = useGame();
  const { user } = useAuth();
  const { economy, inventory, loading: economyLoading, command, pendingBoosterOpening } = useEconomy();
  const { offers: publishedOffers, boosters, loading: contentLoading, error: contentError } = useLiveOpsContent();
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
  const [gridSelectingPosition, setGridSelectingPosition] = useState<number | null>(null);
  const [gridPayment, setGridPayment] = useState<"cauris" | "xaf">("cauris");
  const guestBlocked = !user || user.isAnonymous;
  const blocked = guestBlocked || economyLoading || Boolean(economy?.spendingBlocked);

  useEffect(() => {
    if (pendingBoosterOpening) {
      setOpening({ openingId: pendingBoosterOpening.openingId, positions: pendingBoosterOpening.positions });
    }
  }, [pendingBoosterOpening]);

  const offers = useMemo(() => publishedOffers.filter((offer) => offer.published && offer.id !== "daily_grid_slot_xaf"), [publishedOffers]);
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

  const run = async (key: string, action: () => Promise<string | void>) => {
    setBusy(key);
    setMessage(null);
    try {
      const confirmation = await action();
      setMessage({ severity: "success", text: confirmation ?? "Opération confirmée par le serveur." });
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : "";
      const insufficient = /insufficient|solde|balance/i.test(reason);
      setMessage({
        severity: insufficient ? "warning" : "error",
        text: insufficient ? "Ton solde est insuffisant pour cet achat." : /unavailable|not-found/i.test(reason) ? "Cette offre n’est plus disponible." : "L’opération a été refusée. Réessaie dans un instant.",
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
      return `${offer.title} ajouté à ton portefeuille.`;
    }
    const intent = await command<{ orderId: string }>("createPaymentIntent", { offerId, provider: "simulated" });
    await command("verifyStorePurchase", { orderId: intent.orderId, simulationOutcome: "success" });
    return `Paiement simulé confirmé : ${offer.title}.`;
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
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : "";
      setMessage({ severity: "error", text: reason || "Impossible de révéler cette carte. Réessaie dans un instant." });
    } finally {
      setBusy(null);
    }
  };

  const purchaseDailyGridCard = async (position: number, payment: "cauris" | "xaf") => {
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
            : "La carte n’a pas pu être révélée. Aucun nouvel achat ne sera rejoué automatiquement.",
      });
    } finally {
      setBusy(null);
      setGridSelectingPosition(null);
    }
  };

  const closeCardReveal = () => {
    if (!cardReveal) return;
    const card = POWER_CARDS_BY_ID[cardReveal.cardId as PowerCardId];
    setMessage({
      severity: "success",
      text: cardReveal.duplicateCompensation > 0
        ? `Doublon converti : +${cardReveal.duplicateCompensation} cauris crédités.`
        : `${card?.name ?? cardReveal.cardId} rejoint ta collection.`,
    });
    setCardReveal(null);
    window.requestAnimationFrame(() => {
      const activeShopTab = document.querySelector<HTMLElement>(
        '[role="tablist"][aria-label="Rayons de la boutique"] [role="tab"][aria-selected="true"]',
      );
      activeShopTab?.focus();
    });
  };

  const gridRevealedCount = Object.keys(gridRewards).length;
  const shopPanelClass = [
    styles.shopTabPanel,
    !motion.enabled && styles.motionOff,
    motion.enabled && motion.level === "lite" && styles.motionLite,
  ].filter(Boolean).join(" ");

  return (
    <GameHubLayout
      tone="shop"
      kicker={t("shop.kicker")}
      title={t("shop.title")}
      subtitle={t("shop.subtitle")}
      active="shop"
      headerAction={
        <div className={styles.shopWallet} aria-label="Portefeuille">
          <ResourcePill type="nkap" value={economy?.nkap.toLocaleString("fr-FR") ?? "—"} compact />
          <ResourcePill type="cauris" value={economy?.cauris ?? "—"} compact />
        </div>
      }
    >
      <div className={styles.stickyTabs}>
        <GameTabs
          tabs={SHOP_TABS}
          activeId={tab}
          onChange={(next) => setTab(next as ShopTab)}
          ariaLabel="Rayons de la boutique"
          className={styles.shopTabs}
        />
      </div>

      {guestBlocked && <StatusBanner severity="warning" action={<button data-nj-skin="gold" type="button" className={styles.bannerButton} onClick={() => navigateTo("profile")}>Créer mon compte</button>}>Crée un compte permanent pour acheter et conserver tes objets.</StatusBanner>}
      {(contentLoading || gridLoading || economyLoading) && <StatusBanner severity="info">La vitrine se synchronise avec le quartier…</StatusBanner>}
      {contentError && <StatusBanner severity="warning">{contentError}</StatusBanner>}
      {!guestBlocked && economy?.spendingBlocked && (
        <StatusBanner severity="error">Les dépenses sont suspendues jusqu’à la régularisation de ta dette de {economy.debtCauris} cauris.</StatusBanner>
      )}
      {message && <StatusBanner severity={message.severity}>{message.text}</StatusBanner>}

      {tab === "offers" && (
        <section className={shopPanelClass} aria-labelledby="shop-offers-title">
          <div className={styles.offerCategoryHeader}>
            <div>
              <span className={styles.eyebrow}>Rayons du quartier</span>
              <h2 id="shop-offers-title">Choisis ce qu’il te faut</h2>
            </div>
            <span>{visibleOffers.length} offre{visibleOffers.length > 1 ? "s" : ""}</span>
          </div>
          <div className={styles.offerCategories} aria-label="Catégories d’offres">
            {OFFER_CATEGORIES.filter((category) => category.id === "featured" || offers.some((offer) => offer.type === category.id)).map((category) => (
              <button data-nj-skin="none"
                key={category.id}
                type="button"
                className={offerCategory === category.id ? styles.offerCategoryActive : undefined}
                aria-pressed={offerCategory === category.id}
                onClick={() => setOfferCategory(category.id)}
              >
                {category.label}
              </button>
            ))}
          </div>
          {visibleOffers.length === 0 ? (
            <EmptyState
              icon="coin"
              tone="cobalt"
              title="Ce rayon se prépare"
              description="Les nouvelles offres apparaîtront ici dès leur publication par le Ter."
            />
          ) : (
            <div key={offerCategory} className={`${styles.offerGrid} ${styles.offerGridMotion}`} aria-live="polite">
              {visibleOffers.map((offer) => {
                const xaf = offer.prices.some((price) => price.currency === "xaf");
                return (
                  <GameCard key={offer.id} variant="default" className={`${styles.offerCard} ${styles[`offer_${offer.type}`]}`}>
                <div
                  className={styles.productArt}
                  style={{ "--product-art": `url(${offerArt(offer)})` } as CSSProperties}
                  role="img"
                  aria-label={`Illustration de ${offer.title}`}
                >
                  {xaf && <span className={styles.simulatedFlag}>Paiement simulé</span>}
                </div>
                <div className={styles.productBody}>
                  <span className={styles.productKind}>
                    {offer.type === "cauris_pack" ? "Recharge" : offer.type === "nkap_conversion" ? "Conversion" : offer.type === "energy_pass" ? "Pass énergie" : offer.type === "ticket" ? "Ticket du Ter" : "Pack d’éléments"}
                  </span>
                  <h2>{offer.title}</h2>
                  <p>{offer.description}</p>
                  {offer.rewards.length > 0 && (
                    <div className={styles.rewardRow}>
                      {offer.rewards.map((reward, rewardIndex) => (
                        <RewardPreview key={`${offer.id}-fixed-${rewardIndex}`} icon={rewardIcon(reward)} label={rewardLabel(reward)} />
                      ))}
                    </div>
                  )}
                  {(offer.rewardGroups?.length || offer.randomRewards?.length) ? (
                    <details className={styles.oddsDetails}>
                      <summary>Détails du tirage</summary>
                      {offer.randomRewards && (
                        <ul>{offer.randomRewards.map((entry, index) => <li key={index}><span>{rewardLabel(entry.value)}</span><strong>{entry.weight} %</strong></li>)}</ul>
                      )}
                      {offer.rewardGroups?.map((group, groupIndex) => (
                        <div key={groupIndex} className={styles.oddsGroup}>
                          <small>Tirage {groupIndex + 1}</small>
                          <ul>{group.map((entry, index) => <li key={index}><span>{rewardLabel(entry.value)}</span><strong>{entry.weight} %</strong></li>)}</ul>
                        </div>
                      ))}
                    </details>
                  ) : null}
                  <div className={styles.productFooter}>
                    <span className={`${styles.priceTag} ${xaf ? styles.priceXaf : styles.priceCauris}`}>
                      {offer.prices.map(priceLabel).join(" / ")}
                    </span>
                    <button data-nj-skin="gold" type="button" className={styles.buyButton} disabled={blocked || busy !== null} onClick={() => void run(offer.id, () => purchase(offer.id))}>
                      {busy === offer.id ? "Validation…" : xaf ? "Simuler l’achat" : "Acheter"}
                    </button>
                  </div>
                </div>
                  </GameCard>
                );
              })}
            </div>
          )}
        </section>
      )}

      {tab === "boosters" && (
        <section className={shopPanelClass} aria-label="Livres de boosters">
          {cardReveal?.source === "booster" ? (
            <PowerCardReveal reveal={cardReveal} onContinue={closeCardReveal} />
          ) : !opening ? (
            <div className={styles.bookGrid}>
              {boosters.map((booster) => {
                const ownedBooks = Number(inventory.boosterBooks?.[booster.id] ?? 0);
                const caurisPrice = booster.prices.find((price) => price.currency === "cauris");
                return (
                <GameCard key={booster.id} variant="default" className={`${styles.bookCard} ${styles[`book_${booster.id}`]}`}>
                  <div
                    className={styles.bookArt}
                    style={{ "--book-art": `url(/assets/njambo/books/book-${booster.id}-256.webp)` } as CSSProperties}
                    role="img"
                    aria-label={`Illustration du ${booster.title}`}
                  />
                  <div className={styles.bookBody}>
                    <span className={styles.productKind}>Livre de neuf cartes</span>
                    <h2>{booster.title}</h2>
                    <p>Choisis une seule carte parmi neuf positions cachées.</p>
                    <details className={styles.oddsDetails}>
                      <summary>Détails du tirage</summary>
                      <ul>{booster.rarityWeights.map((entry) => <li key={entry.value}><span>{RARITY_LABELS[entry.value]}</span><strong>{entry.weight} %</strong></li>)}</ul>
                      <p className={styles.guarantee}>Garantie : {RARITY_LABELS[booster.pity.minimumRarity]} ou mieux au {booster.pity.threshold}<sup>e</sup> livre sans obtention.</p>
                    </details>
                    <div className={styles.productFooter}>
                      <span className={`${styles.priceTag} ${styles.priceCauris}`}>
                        {ownedBooks > 0 ? `${ownedBooks} livre${ownedBooks > 1 ? "s" : ""} possédé${ownedBooks > 1 ? "s" : ""}` : caurisPrice ? priceLabel(caurisPrice) : "Indisponible"}
                      </span>
                      <button data-nj-skin="gold" type="button" className={styles.buyButton} disabled={blocked || busy !== null} onClick={() => void run(booster.id, async () => {
                        const result = await command<{ openingId: string; positions: number[] }>("openBoosterBook", { boosterId: booster.id });
                        setOpening({ openingId: result.openingId, positions: result.positions ?? Array.from({ length: 9 }, (_, i) => i) });
                        return `${booster.title} prêt : choisis une carte.`;
                      })}>{busy === booster.id ? "Ouverture…" : ownedBooks > 0 ? "Utiliser le livre" : "Acheter et ouvrir"}</button>
                    </div>
                  </div>
                </GameCard>
                );
              })}
            </div>
          ) : (
            <GameCard variant="default" className={styles.openingPanel}>
              <div className={styles.openingHeading}>
                <span><NjamboIcon name="cards" tone="gold" size={28} /></span>
                <div><h2>Ton livre est prêt</h2><p>Une seule carte rejoindra ta collection. Choisis bien.</p></div>
              </div>
              <div className={styles.cardGrid} aria-label="Neuf cartes cachées">
                {opening.positions.map((position) => (
                  <button data-nj-skin="gold" key={position} type="button" disabled={busy !== null} onClick={() => void revealBoosterCard(position)}>
                    <Image src="/assets/njambo/books/card-back-256.webp" alt="Carte cachée" width={180} height={250} />
                    <span>{busy === `slot-${position}` ? "Révélation…" : "Choisir"}</span>
                  </button>
                ))}
              </div>
            </GameCard>
          )}
        </section>
      )}

      {tab === "grid" && (
        cardReveal?.source === "daily-grid" ? (
          <PowerCardReveal reveal={cardReveal} onContinue={closeCardReveal} />
        ) : (
          <section className={`${styles.dailyGridSection} ${shopPanelClass}`} aria-labelledby="daily-grid-title">
            <div className={styles.dailyGridGlow} aria-hidden="true" />
            <div className={styles.sectionIntro}>
              <div>
                <span className={styles.eyebrow}>Rotation de Douala · {gridDay}</span>
                <h2 id="daily-grid-title">La Grille des Pouvoirs</h2>
                <p>Neuf cases secrètes. Chaque case cache une véritable carte Pouvoir à conserver.</p>
                <div className={styles.dailyProgress} aria-label={`${gridRevealedCount} cartes révélées sur 9`}>
                  <span><b>{gridRevealedCount}</b>/9 révélées</span>
                  <i><span style={{ width: `${(gridRevealedCount / 9) * 100}%` }} /></i>
                </div>
              </div>
              <details className={styles.oddsDetails}>
                <summary>Chances par case</summary>
                <ul>
                  <li><span>Village</span><strong>55 %</strong></li>
                  <li><span>Notable</span><strong>32 %</strong></li>
                  <li><span>Chef</span><strong>11 %</strong></li>
                  <li><span>Ancêtre</span><strong>2 %</strong></li>
                </ul>
                <p className={styles.guarantee}>Une position ne peut être révélée qu’une fois par jour.</p>
              </details>
            </div>

            <div className={styles.dailyGridToolbar}>
              <span><NjamboIcon name="cards" tone="cobalt" size={18} /> Touche une carte pour la révéler</span>
              <div className={styles.dailyPaymentSelector} role="group" aria-label="Moyen de paiement de la grille">
                <button
                  data-nj-skin="none"
                  type="button"
                  disabled={gridLoading || busy !== null}
                  aria-pressed={gridPayment === "cauris"}
                  className={gridPayment === "cauris" ? styles.dailyPaymentActive : undefined}
                  onClick={() => setGridPayment("cauris")}
                >
                  <NjamboIcon name="sparkle" tone="gold" size={14} />15 cauris
                </button>
                <button
                  data-nj-skin="none"
                  type="button"
                  disabled={gridLoading || busy !== null}
                  aria-pressed={gridPayment === "xaf"}
                  className={gridPayment === "xaf" ? styles.dailyPaymentActive : undefined}
                  onClick={() => setGridPayment("xaf")}
                >
                  150 XAF <small>simulé</small>
                </button>
              </div>
            </div>

            <div className={styles.dailyGrid} aria-busy={gridLoading || gridSelectingPosition !== null}>
              {Array.from({ length: 9 }, (_, position) => {
                const reward = gridRewards[String(position)];
                const cardReward = reward?.type === "card" ? reward : null;
                const powerCard = cardReward ? POWER_CARDS_BY_ID[cardReward.cardId as PowerCardId] : undefined;
                const duplicateCompensation = Number(gridDuplicateCompensations[String(position)] ?? 0);
                const selecting = gridSelectingPosition === position;
                const slotTone = cardReward ? REVEAL_TONES[cardReward.rarity] ?? REVEAL_TONES.notable : REVEAL_TONES.notable;
                const slotClassName = [
                  styles.dailySlot,
                  reward && styles.dailySlotRevealed,
                  selecting && styles.dailySlotSelecting,
                ].filter(Boolean).join(" ");

                return (
                  <article
                    className={slotClassName}
                    key={position}
                    style={{
                      "--slot-delay": `${position * 45}ms`,
                      "--slot-sheen-delay": `${360 + position * 45}ms`,
                      "--slot-tone": slotTone,
                    } as CSSProperties}
                  >
                    <span className={styles.slotNumber}>{position + 1}</span>

                    {selecting ? (
                      <div className={styles.dailySelectingCard} role="status" aria-label={`Révélation de la carte ${position + 1} en cours`}>
                        <Image src="/assets/njambo/books/card-back-256.webp" alt="" width={180} height={250} />
                        <span className={styles.dailyScan} aria-hidden="true" />
                        <strong>Révélation…</strong>
                      </div>
                    ) : cardReward ? (
                      <div className={styles.dailyCollectedCard} aria-label={`Carte ${powerCard?.name ?? cardReward.cardId}, rareté ${RARITY_LABELS[cardReward.rarity] ?? cardReward.rarity}`}>
                        <div className={styles.dailyCollectedArt}>
                          {powerCard ? (
                            <Image src={powerCard.art} alt="" fill sizes="(max-width: 479px) 28vw, 150px" />
                          ) : (
                            <NjamboIcon name="cards" tone="gold" size={36} />
                          )}
                          <span aria-hidden="true" />
                        </div>
                        <span className={styles.dailyRarity}>{RARITY_LABELS[cardReward.rarity] ?? cardReward.rarity}</span>
                        <strong>{powerCard?.name ?? cardReward.cardId}</strong>
                        <small className={duplicateCompensation > 0 ? styles.dailyDuplicate : undefined}>
                          {duplicateCompensation > 0 ? `Doublon · +${duplicateCompensation} cauris` : "Carte Pouvoir obtenue"}
                        </small>
                      </div>
                    ) : reward ? (
                      <div className={styles.dailyCollectedCard}>
                        <NjamboIcon name="sparkle" tone="gold" size={36} />
                        <strong>{rewardLabel(reward)}</strong>
                        <small>Récompense obtenue</small>
                      </div>
                    ) : (
                      <button
                        data-nj-skin="none"
                        type="button"
                        className={styles.dailyCardAction}
                        disabled={blocked || gridLoading || busy !== null}
                        aria-label={`Révéler la carte ${position + 1} pour ${gridPayment === "cauris" ? "15 cauris" : "150 XAF, paiement simulé"}`}
                        onClick={() => void purchaseDailyGridCard(position, gridPayment)}
                      >
                        <span className={styles.dailyHiddenCard} aria-hidden="true">
                          <Image src="/assets/njambo/books/card-back-256.webp" alt="" width={180} height={250} priority={position < 3} />
                          <span className={styles.dailyCardSheen} />
                          <b>?</b>
                          <span className={styles.dailyCardPrice}>
                            {gridPayment === "cauris" ? "15 cauris" : "150 XAF"}
                          </span>
                        </span>
                      </button>
                    )}
                  </article>
                );
              })}
            </div>
          </section>
        )
      )}

      {tab === "wheel" && (
        <GameCard variant="default" className={`${styles.wheelCard} ${shopPanelClass}`}>
          <div className={`${styles.wheelVisual}${busy === "wheel" ? ` ${styles.wheelSpinning}` : ""}`} role="img" aria-label="Roulette de fidélité">
            <span className={styles.wheelHalo} />
            <span className={styles.wheelImage} />
            <span className={styles.wheelPoints}>{economy?.daily.loyaltyPoints ?? 0}<small>/ 7</small></span>
          </div>
          <div className={styles.wheelBody}>
            <span className={styles.eyebrow}>Fidélité du Ter</span>
            <h2>La roue des retrouvailles</h2>
            <p>Sept connexions, même non consécutives, débloquent une rotation.</p>
            <details className={styles.oddsDetails}>
              <summary>Détails du tirage</summary>
              <ul>
                <li><span>100 Nkap</span><strong>35 %</strong></li><li><span>250 Nkap</span><strong>25 %</strong></li>
                <li><span>5 cauris</span><strong>20 %</strong></li><li><span>Ticket Bronze</span><strong>10 %</strong></li>
                <li><span>Énergie 1 h</span><strong>7 %</strong></li><li><span>Livre Normal</span><strong>3 %</strong></li>
              </ul>
            </details>
            <span className={styles.spinCount}>{economy?.daily.availableSpins ?? 0} rotation{(economy?.daily.availableSpins ?? 0) > 1 ? "s" : ""} disponible{(economy?.daily.availableSpins ?? 0) > 1 ? "s" : ""}</span>
            <button data-nj-skin="gold" type="button" className={styles.wheelButton} disabled={blocked || !economy?.daily.availableSpins || busy !== null} onClick={() => void run("wheel", async () => {
              const result = await command<{ reward: Reward }>("spinLoyaltyWheel");
              return `La roue t’offre ${rewardLabel(result.reward)}.`;
            })}>
              <NjamboIcon name="sparkle" tone="gold" size={20} />{busy === "wheel" ? "La roue tourne…" : "Tourner la roue"}
            </button>
          </div>
        </GameCard>
      )}
    </GameHubLayout>
  );
}
