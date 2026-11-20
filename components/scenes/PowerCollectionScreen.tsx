"use client";

import Image from "next/image";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type TouchEvent as ReactTouchEvent,
} from "react";
import { AnimatePresence, motion } from "motion/react";
import { useGame } from "@/contexts/GameContext";
import { useEconomy } from "@/contexts/EconomyContext";
import { useAuth } from "@/hooks/useAuth";
import { usePowerCatalogRevision } from "@/hooks/usePowerCatalog";
import { POWER_CARDS, POWER_CARDS_BY_ID, MAX_EQUIPPED_POWERS } from "@/config/powerCards";
import { useMotionProfile } from "@/lib/motion";
import { CATEGORY_MOTIF_PALETTE, PowerCardMotif } from "@/components/power/PowerCardMotif";
import { NjamboIcon, type NjamboIconName } from "@/components/ui/Art";
import { GameShell } from "@/components/ui/GameShell";
import { GameModal } from "@/components/ui/GameModal";
import type { PowerCardDef, PowerCardId, PowerCategory, PowerRarity } from "@/types/game";
import styles from "./PowerCollectionScreen.module.css";

type BinderFilter = "all" | "owned" | PowerCategory;

interface DragSession {
  card: PowerCardDef;
  source: "binder" | "slot";
  sourceSlotIndex?: number;
  startX: number;
  startY: number;
  x: number;
  y: number;
  active: boolean;
  isTouch: boolean;
}

const RARITY_META: Record<
  PowerRarity,
  {
    label: string;
    modalTone: "teal" | "gold" | "pink" | "palm";
    stars: string;
    className: string;
  }
> = {
  common: { label: "Commune", modalTone: "teal", stars: "◆", className: "rCommon" },
  rare: { label: "Rare", modalTone: "palm", stars: "◆◆", className: "rRare" },
  epic: { label: "Épique", modalTone: "pink", stars: "◆◆◆", className: "rEpic" },
  legendary: { label: "Légendaire", modalTone: "gold", stars: "✦ ◆◆◆ ✦", className: "rLegendary" },
};

const FILTERS: Array<{ id: BinderFilter; label: string }> = [
  { id: "all", label: "Toutes" },
  { id: "owned", label: "Possédées" },
  { id: "offensive", label: "Attaque" },
  { id: "defense", label: "Défense" },
  { id: "tactical", label: "Tactique" },
  { id: "perturbation", label: "Bluff" },
  { id: "score", label: "Score" },
  { id: "economy", label: "Nkap" },
];

const ROMAN_SLOTS = ["I", "II", "III"] as const;

export function PowerCollectionScreen() {
  const { navigateTo, profile, setProfile } = useGame();
  const { user } = useAuth();
  const { inventory: serverInventory, command } = useEconomy();
  const motionProfile = useMotionProfile();

  const [filter, setFilter] = useState<BinderFilter>("all");
  const [selectedId, setSelectedId] = useState<PowerCardId>(() => POWER_CARDS[0]?.id ?? "eclair_mfoundi");
  const [mobileModalOpen, setMobileModalOpen] = useState(false);
  const [drag, setDrag] = useState<DragSession | null>(null);
  const [hoverSlot, setHoverSlot] = useState<number | null>(null);
  const [hoverOutsideTray, setHoverOutsideTray] = useState(false);
  const [snappedSlot, setSnappedSlot] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [tilt, setTilt] = useState<{ rx: number; ry: number; gx: number; gy: number }>({
    rx: 0,
    ry: 0,
    gx: 50,
    gy: 35,
  });

  const slotRefs = useRef<Array<HTMLDivElement | null>>([null, null, null]);
  const trayRef = useRef<HTMLDivElement | null>(null);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragRef = useRef<DragSession | null>(null);
  const suppressNextClickRef = useRef(false);

  const cascadeOn = motionProfile.allowEntranceCascade;
  const loopsOn = motionProfile.allowDecorativeLoop;

  const permanentAccount = Boolean(user && !user.isAnonymous);
  const inventory = useMemo(
    () =>
      permanentAccount
        ? Object.fromEntries(Object.keys(serverInventory.cards ?? {}).map((cardId) => [cardId, 1]))
        : (profile.powerInventory ?? {}),
    [permanentAccount, serverInventory.cards, profile.powerInventory],
  );

  const rawEquipped = permanentAccount
    ? ((serverInventory.equippedCards ?? []) as PowerCardId[])
    : (profile.equippedPowers ?? []);

  const equipped = useMemo(
    () => rawEquipped.filter((cardId) => (inventory[cardId] ?? 0) > 0).slice(0, MAX_EQUIPPED_POWERS),
    [rawEquipped, inventory],
  );

  /* Catalogue dynamique : cartes proposées + cartes archivées que le joueur
     possède encore (toujours jouables). Recalculé à chaque publication admin. */
  const catalogRevision = usePowerCatalogRevision();
  const collectionCards = useMemo(() => {
    void catalogRevision;
    return [
      ...POWER_CARDS,
      ...Object.values(POWER_CARDS_BY_ID).filter((card) => card.archived && (inventory[card.id] ?? 0) > 0),
    ];
  }, [catalogRevision, inventory]);

  const ownedCount = useMemo(
    () => collectionCards.filter((card) => (inventory[card.id] ?? 0) > 0).length,
    [collectionCards, inventory],
  );

  const visibleCards = useMemo(() => {
    return collectionCards.filter((card) => {
      if (filter === "all") return true;
      if (filter === "owned") return (inventory[card.id] ?? 0) > 0;
      return card.category === filter;
    });
  }, [collectionCards, filter, inventory]);

  const showNotice = useCallback((msg: string) => {
    setFeedback(msg);
  }, []);

  useEffect(() => {
    if (!feedback) return;
    const timer = window.setTimeout(() => setFeedback(null), 2600);
    return () => window.clearTimeout(timer);
  }, [feedback]);

  const triggerSnapFx = useCallback((slotIndex: number) => {
    setSnappedSlot(slotIndex);
    window.setTimeout(() => {
      setSnappedSlot((prev) => (prev === slotIndex ? null : prev));
    }, 620);
  }, []);

  const commitEquipped = useCallback(
    (next: PowerCardId[]) => {
      const unique = Array.from(new Set(next)).slice(0, MAX_EQUIPPED_POWERS);
      if (permanentAccount) {
        void command("equipPowerCards", { cardIds: unique });
        return;
      }
      setProfile((prev) => ({ ...prev, equippedPowers: unique }));
    },
    [permanentAccount, command, setProfile],
  );

  const dropCardIntoSlot = useCallback(
    (cardId: PowerCardId, targetSlot: number, sourceSlot?: number) => {
      if ((inventory[cardId] ?? 0) <= 0) return;
      const slots: Array<PowerCardId | null> = Array.from(
        { length: MAX_EQUIPPED_POWERS },
        (_, i) => equipped[i] ?? null,
      );

      const existingIdx = sourceSlot ?? slots.indexOf(cardId);
      if (existingIdx >= 0 && existingIdx < MAX_EQUIPPED_POWERS) {
        if (existingIdx === targetSlot) return;
        const swapped = slots[targetSlot];
        slots[targetSlot] = cardId;
        slots[existingIdx] = swapped;
      } else {
        slots[targetSlot] = cardId;
      }

      const compacted = slots.filter((id): id is PowerCardId => Boolean(id));
      commitEquipped(compacted);
      triggerSnapFx(Math.min(targetSlot, Math.max(0, compacted.length - 1)));
    },
    [inventory, equipped, commitEquipped, triggerSnapFx],
  );

  const removeCardFromDeck = useCallback(
    (cardId: PowerCardId) => {
      const next = equipped.filter((id) => id !== cardId);
      commitEquipped(next);
    },
    [equipped, commitEquipped],
  );

  const toggleEquip = useCallback(
    (id: PowerCardId) => {
      if ((inventory[id] ?? 0) <= 0) return;
      if (equipped.includes(id)) {
        removeCardFromDeck(id);
        return;
      }
      if (equipped.length >= MAX_EQUIPPED_POWERS) {
        dropCardIntoSlot(id, MAX_EQUIPPED_POWERS - 1);
        showNotice("Emplacement III remplacé dans ton deck !");
        return;
      }
      const nextSlot = equipped.length;
      commitEquipped([...equipped, id]);
      triggerSnapFx(nextSlot);
    },
    [inventory, equipped, removeCardFromDeck, dropCardIntoSlot, showNotice, commitEquipped, triggerSnapFx],
  );

  /* ── HIT-TEST MAGNÉTIQUE DES 3 EMPLACEMENTS ── */
  const findHoveredSlot = useCallback((clientX: number, clientY: number): number | null => {
    const pad = 22;
    for (let i = 0; i < MAX_EQUIPPED_POWERS; i++) {
      const el = slotRefs.current[i];
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      if (
        clientX >= rect.left - pad &&
        clientX <= rect.right + pad &&
        clientY >= rect.top - pad &&
        clientY <= rect.bottom + pad
      ) {
        return i;
      }
    }
    return null;
  }, []);

  const isInsideTray = useCallback((clientX: number, clientY: number): boolean => {
    const el = trayRef.current;
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    return (
      clientX >= rect.left - 16 &&
      clientX <= rect.right + 16 &&
      clientY >= rect.top - 16 &&
      clientY <= rect.bottom + 16
    );
  }, []);

  const clearHoldTimer = () => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  };

  /* Finaliser un drag (commun souris + tactile) */
  const finishDragAt = useCallback(
    (clientX: number, clientY: number) => {
      clearHoldTimer();
      const current = dragRef.current;
      dragRef.current = null;
      setDrag(null);
      setHoverSlot(null);
      setHoverOutsideTray(false);

      if (!current || !current.active) return;

      const targetSlot = findHoveredSlot(clientX, clientY);
      if (targetSlot !== null) {
        dropCardIntoSlot(current.card.id, targetSlot, current.sourceSlotIndex);
        setSelectedId(current.card.id);
      } else if (current.source === "slot" && !isInsideTray(clientX, clientY)) {
        removeCardFromDeck(current.card.id);
        showNotice(`${current.card.name} retirée du deck.`);
      }

      window.setTimeout(() => {
        suppressNextClickRef.current = false;
      }, 90);
    },
    [findHoveredSlot, isInsideTray, dropCardIntoSlot, removeCardFromDeck, showNotice],
  );

  /* Mettre à jour le drag (commun souris + tactile) */
  const moveDragTo = useCallback(
    (clientX: number, clientY: number, preventNative?: () => void) => {
      const current = dragRef.current;
      if (!current) return;

      const dist = Math.hypot(clientX - current.startX, clientY - current.startY);

      if (!current.active) {
        if (current.isTouch && current.source === "binder") {
          /* Avant l'activation du long-press tactile, un déplacement annule le drag pour laisser le scroll natif */
          if (dist > 12) {
            clearHoldTimer();
            dragRef.current = null;
            setDrag(null);
          }
          return;
        }
        if (dist < 7) return;
        suppressNextClickRef.current = true;
      }

      preventNative?.();
      const updated: DragSession = { ...current, x: clientX, y: clientY, active: true };
      dragRef.current = updated;
      setDrag(updated);

      const slotHit = findHoveredSlot(clientX, clientY);
      setHoverSlot(slotHit);
      setHoverOutsideTray(updated.source === "slot" && slotHit === null && !isInsideTray(clientX, clientY));
    },
    [findHoveredSlot, isInsideTray],
  );

  /* Démarrage SOURIS / STYLET */
  const startMouseDrag = (
    e: ReactPointerEvent,
    card: PowerCardDef,
    source: "binder" | "slot",
    sourceSlotIndex?: number,
    immediate = false,
  ) => {
    if (e.pointerType === "touch" || e.button !== 0) return;
    if ((inventory[card.id] ?? 0) <= 0) return;

    const session: DragSession = {
      card,
      source,
      sourceSlotIndex,
      startX: e.clientX,
      startY: e.clientY,
      x: e.clientX,
      y: e.clientY,
      active: immediate,
      isTouch: false,
    };
    if (immediate) suppressNextClickRef.current = true;
    dragRef.current = session;
    setDrag(session);
  };

  /* Démarrage TACTILE (mobile natif : 0ms sur poignée ⋮⋮ ou slot du deck, 160ms hold sur la carte) */
  const startTouchDrag = (
    e: ReactTouchEvent,
    card: PowerCardDef,
    source: "binder" | "slot",
    sourceSlotIndex?: number,
    immediate = false,
  ) => {
    const touch = e.touches[0];
    if (!touch) return;
    if ((inventory[card.id] ?? 0) <= 0) {
      if (immediate) {
        e.stopPropagation();
        showNotice("Débloque cette carte à la Boutique pour l'équiper !");
      }
      return;
    }

    if (immediate) {
      e.stopPropagation();
      suppressNextClickRef.current = true;
      if (typeof navigator !== "undefined" && "vibrate" in navigator) {
        try {
          navigator.vibrate(12);
        } catch {
          // ignore
        }
      }
    }

    const session: DragSession = {
      card,
      source,
      sourceSlotIndex,
      startX: touch.clientX,
      startY: touch.clientY,
      x: touch.clientX,
      y: touch.clientY,
      active: immediate,
      isTouch: true,
    };
    dragRef.current = session;
    setDrag(session);

    /* Hold rapide 160ms sur la carte dans le classeur (sans bloquer le scroll si le doigt glisse avant) */
    if (!immediate && source === "binder") {
      clearHoldTimer();
      holdTimerRef.current = setTimeout(() => {
        if (!dragRef.current || dragRef.current.active) return;
        suppressNextClickRef.current = true;
        const activated: DragSession = { ...dragRef.current, active: true };
        dragRef.current = activated;
        setDrag(activated);
        if (typeof navigator !== "undefined" && "vibrate" in navigator) {
          try {
            navigator.vibrate(14);
          } catch {
            // ignore
          }
        }
      }, 160);
    }
  };

  /* Listeners globaux SOURIS + TOUCH (touchmove non-passive pour bloquer le scroll pendant le drag mobile !) */
  const dragSessionOpen = drag !== null;
  useEffect(() => {
    if (!dragSessionOpen) return;

    const onMouseMove = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      moveDragTo(e.clientX, e.clientY, () => {
        if (e.cancelable) e.preventDefault();
      });
    };

    const onMouseUp = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      finishDragAt(e.clientX, e.clientY);
    };

    const onTouchMove = (e: TouchEvent) => {
      const touch = e.touches[0];
      if (!touch) return;
      moveDragTo(touch.clientX, touch.clientY, () => {
        if (e.cancelable) e.preventDefault();
      });
    };

    const onTouchEnd = (e: TouchEvent) => {
      const touch = e.changedTouches[0];
      const x = touch?.clientX ?? dragRef.current?.x ?? 0;
      const y = touch?.clientY ?? dragRef.current?.y ?? 0;
      finishDragAt(x, y);
    };

    window.addEventListener("pointermove", onMouseMove, { passive: false });
    window.addEventListener("pointerup", onMouseUp);
    window.addEventListener("pointercancel", onMouseUp);
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchend", onTouchEnd);
    window.addEventListener("touchcancel", onTouchEnd);

    return () => {
      clearHoldTimer();
      window.removeEventListener("pointermove", onMouseMove);
      window.removeEventListener("pointerup", onMouseUp);
      window.removeEventListener("pointercancel", onMouseUp);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [dragSessionOpen, moveDragTo, finishDragAt]);

  const handleCardClick = (card: PowerCardDef) => {
    if (suppressNextClickRef.current) return;
    setSelectedId(card.id);
    if (typeof window !== "undefined" && window.innerWidth < 900) {
      setMobileModalOpen(true);
    }
  };

  const handleInspectorMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!loopsOn) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width;
    const py = (e.clientY - rect.top) / rect.height;
    setTilt({
      rx: (0.5 - py) * 16,
      ry: (px - 0.5) * 18,
      gx: Math.round(px * 100),
      gy: Math.round(py * 100),
    });
  };

  const resetInspectorTilt = () => {
    setTilt({ rx: 0, ry: 0, gx: 50, gy: 35 });
  };

  const inspected = POWER_CARDS_BY_ID[selectedId] ?? POWER_CARDS[0];
  const inspectedOwned = inspected ? (inventory[inspected.id] ?? 0) > 0 : false;
  const inspectedEquipped = inspected ? equipped.includes(inspected.id) : false;
  const inspectedRarity = RARITY_META[inspected.rarity];
  const inspectedPal = CATEGORY_MOTIF_PALETTE[inspected.category];
  const isDraggingActive = Boolean(drag?.active);

  return (
    <GameShell
      active="shop"
      dock={false}
      scroll={false}
      className={`${styles.scene}${!loopsOn ? ` ${styles.motionReduced}` : ""}${isDraggingActive ? ` ${styles.isDragging}` : ""}`}
      contentClassName={styles.frame}
    >
      {/* ═══ 1. HUD HAUT COMPACT ═══ */}
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
            <span className={styles.hudKicker}>Grimoire Ndop · {ownedCount}/{collectionCards.length}</span>
            <h1>Cartes Pouvoir</h1>
          </div>
        </div>

        <div className={styles.hudRight}>
          <span className={styles.deckCounter} aria-label={`${equipped.length} cartes équipées sur ${MAX_EQUIPPED_POWERS}`}>
            Deck <strong>{equipped.length}/{MAX_EQUIPPED_POWERS}</strong>
          </span>
          <button
            data-nj-skin="none"
            type="button"
            className={styles.shopShortcut}
            onClick={() => navigateTo("power_shop")}
          >
            <NjamboIcon name="coin" tone="gold" size={17} />
            <span>Boutique</span>
          </button>
        </div>
      </header>

      {/* Notification rapide */}
      <AnimatePresence>
        {feedback && (
          <motion.div
            key={feedback}
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className={styles.feedbackToast}
            role="status"
          >
            {feedback}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══ 2. WORKSPACE DECK BUILDER ═══ */}
      <div className={styles.builderGrid}>
        {/* ─── PLATEAU DECK 3 EMPLACEMENTS PROPORTIONNÉS + INSPECTEUR 3D ─── */}
        <aside className={styles.deckColumn} aria-label="Plateau de deck actif">
          <div
            ref={trayRef}
            className={`${styles.feltDeckTray}${isDraggingActive ? ` ${styles.trayMagnetOn}` : ""}`}
          >
            <span className={styles.trayStitch} aria-hidden="true" />

            <div className={styles.trayHeader}>
              <div className={styles.trayHeading}>
                <span className={styles.trayKicker}>Deck de table</span>
                <strong>{equipped.length}/{MAX_EQUIPPED_POWERS}</strong>
              </div>
              <span className={styles.dragTip}>
                {isDraggingActive
                  ? hoverOutsideTray
                    ? "Relâche pour retirer"
                    : "Dépose sur un slot"
                  : ownedCount > 0
                  ? "Glisse ⋮⋮ ou maintiens"
                  : "Débloque des cartes"}
              </span>
            </div>

            {/* 3 emplacements en vraie proportion de carte (3 / 4.25), centrés sans jamais s'écraser */}
            <div className={styles.deckSlotsRow}>
              {Array.from({ length: MAX_EQUIPPED_POWERS }, (_, slotIdx) => {
                const cardId = equipped[slotIdx];
                const card = cardId ? POWER_CARDS_BY_ID[cardId] : undefined;
                const cardPal = card ? CATEGORY_MOTIF_PALETTE[card.category] : null;
                const isHover = isDraggingActive && hoverSlot === slotIdx;
                const isSnapped = snappedSlot === slotIdx;
                const isBeingDragged = Boolean(
                  drag?.active && drag.source === "slot" && drag.sourceSlotIndex === slotIdx,
                );
                const hoverLabel =
                  drag?.source === "slot"
                    ? "Échanger"
                    : card
                    ? "Remplacer"
                    : "Équiper";

                return (
                  <div
                    key={slotIdx}
                    ref={(el) => {
                      slotRefs.current[slotIdx] = el;
                    }}
                    className={[
                      styles.deckSlotZone,
                      isHover ? styles.slotHoverTarget : "",
                      isSnapped ? styles.slotSnapBurst : "",
                      isBeingDragged ? styles.slotDraggingOut : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    {isSnapped && <span className={styles.snapShockwave} aria-hidden="true" />}

                    {card && cardPal ? (
                      <div
                        role="button"
                        tabIndex={0}
                        className={`${styles.slottedCard}${selectedId === card.id ? ` ${styles.slottedSelected}` : ""}`}
                        style={
                          {
                            "--c-primary": cardPal.primary,
                            "--c-secondary": cardPal.secondary,
                            "--c-glow": cardPal.glow,
                            "--c-top": cardPal.clothTop,
                            "--c-bot": cardPal.clothBot,
                          } as CSSProperties
                        }
                        onPointerDown={(e) => startMouseDrag(e, card, "slot", slotIdx)}
                        onTouchStart={(e) => startTouchDrag(e, card, "slot", slotIdx, true)}
                        onClick={() => handleCardClick(card)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") handleCardClick(card);
                        }}
                        aria-label={`Emplacement ${slotIdx + 1} : ${card.name}. Glisser pour réordonner ou retirer.`}
                      >
                        <div className={styles.slottedArtWrap}>
                          <Image src={card.art} alt="" fill sizes="100px" className={styles.slotArt} />
                        </div>
                        <PowerCardMotif category={card.category} rarity={card.rarity} className={styles.slotMotifSvg} />
                        <span className={styles.slotName}>{card.name}</span>

                        <button
                          data-nj-skin="none"
                          type="button"
                          className={styles.slotRemoveBtn}
                          onPointerDown={(e) => e.stopPropagation()}
                          onTouchStart={(e) => e.stopPropagation()}
                          onClick={(e) => {
                            e.stopPropagation();
                            removeCardFromDeck(card.id);
                          }}
                          aria-label={`Retirer ${card.name} du deck`}
                          title="Retirer du deck"
                        >
                          ×
                        </button>
                      </div>
                    ) : (
                      <div className={styles.emptyDeckSlot} aria-label={`Emplacement ${slotIdx + 1} vide`}>
                        <span className={styles.emptyRoman}>{ROMAN_SLOTS[slotIdx]}</span>
                        <span className={styles.emptyPlus} aria-hidden="true">+</span>
                        <small>Libre</small>
                      </div>
                    )}

                    {isHover && <span className={styles.dropActionTag}>{hoverLabel}</span>}
                  </div>
                );
              })}
            </div>
          </div>

          {/* INSPECTEUR 3D EN DIRECT (DESKTOP >= 900px) */}
          <div className={styles.desktopInspector}>
            <div
              className={styles.inspectorStage}
              style={{ "--c-primary": inspectedPal.primary, "--c-glow": inspectedPal.glow } as CSSProperties}
            >
              <span className={styles.inspectorSunburst} aria-hidden="true" />

              <div
                className={styles.tiltCardShell}
                onPointerMove={handleInspectorMove}
                onPointerLeave={resetInspectorTilt}
                style={
                  {
                    "--rx": `${tilt.rx}deg`,
                    "--ry": `${tilt.ry}deg`,
                    "--gx": `${tilt.gx}%`,
                    "--gy": `${tilt.gy}%`,
                  } as CSSProperties
                }
              >
                <div
                  className={`${styles.heroArtifactCard} ${styles[inspectedRarity.className]}`}
                  style={
                    {
                      "--c-primary": inspectedPal.primary,
                      "--c-secondary": inspectedPal.secondary,
                      "--c-glow": inspectedPal.glow,
                      "--c-top": inspectedPal.clothTop,
                      "--c-bot": inspectedPal.clothBot,
                    } as CSSProperties
                  }
                >
                  <div className={styles.heroArtMask}>
                    <Image src={inspected.art} alt={inspected.name} fill sizes="220px" className={styles.heroArtImg} />
                  </div>
                  <PowerCardMotif category={inspected.category} rarity={inspected.rarity} className={styles.heroMotifSvg} />
                  <span className={styles.specularGlare} aria-hidden="true" />

                  <div className={styles.heroBottomInfo}>
                    <span className={styles.heroIconHalo}>
                      <NjamboIcon name={inspected.icon as NjamboIconName} tone={inspected.tone} size={18} />
                    </span>
                    <span className={styles.heroCatLabel}>
                      {inspectedPal.label} · {inspectedRarity.label}
                    </span>
                    <strong>{inspected.name}</strong>
                  </div>
                </div>
              </div>
            </div>

            <div className={styles.inspectorCopy}>
              <div className={styles.inspectorHeadLine}>
                <span
                  className={styles.inspectorTypeLabel}
                  style={{ color: inspectedPal.secondary }}
                >
                  {inspectedPal.label} · {inspectedRarity.label}
                </span>
                <span className={inspectedOwned ? styles.statusOwned : styles.statusLocked}>
                  {inspectedOwned ? "✓ Possédée" : "🔒 Verrouillée"}
                </span>
              </div>

              <p className={styles.inspectorDesc}>{inspected.description}</p>

              {inspectedOwned ? (
                <button
                  data-nj-skin="none"
                  type="button"
                  className={`${styles.inspectorCta} ${inspectedEquipped ? styles.ctaRemove : styles.ctaEquip}`}
                  onClick={() => toggleEquip(inspected.id)}
                >
                  <span className={styles.ctaSheen} aria-hidden="true" />
                  <span>
                    {inspectedEquipped
                      ? "Retirer du deck"
                      : equipped.length >= MAX_EQUIPPED_POWERS
                      ? "Équiper (remplace slot III)"
                      : "Équiper dans mon deck"}
                  </span>
                </button>
              ) : (
                <button
                  data-nj-skin="none"
                  type="button"
                  className={`${styles.inspectorCta} ${styles.ctaShop}`}
                  onClick={() => navigateTo("power_shop")}
                >
                  <span className={styles.ctaSheen} aria-hidden="true" />
                  <span>Débloquer à la Boutique →</span>
                </button>
              )}
            </div>
          </div>
        </aside>

        {/* ─── CLASSEUR : FILTRES PAR TYPE + CARTES SANS BORDURE À MOTIF COLORÉ IMPOSANT ─── */}
        <section
          className={`${styles.binderColumn}${hoverOutsideTray ? ` ${styles.binderRemoveZone}` : ""}`}
          aria-label="Collection des cartes pouvoir"
        >
          <nav className={styles.filterStrip} aria-label="Filtrer les cartes">
            {FILTERS.map((entry) => {
              const active = filter === entry.id;
              const count =
                entry.id === "all"
                  ? POWER_CARDS.length
                  : entry.id === "owned"
                  ? ownedCount
                  : POWER_CARDS.filter((c) => c.category === entry.id).length;
              const chipColor =
                entry.id !== "all" && entry.id !== "owned"
                  ? CATEGORY_MOTIF_PALETTE[entry.id].primary
                  : undefined;

              return (
                <button
                  key={entry.id}
                  data-nj-skin="none"
                  type="button"
                  aria-pressed={active}
                  className={`${styles.filterPill}${active ? ` ${styles.filterPillActive}` : ""}`}
                  style={chipColor ? ({ "--pill-color": chipColor } as CSSProperties) : undefined}
                  onClick={() => setFilter(entry.id)}
                >
                  {chipColor && <span className={styles.filterSwatch} aria-hidden="true" />}
                  <span>{entry.label}</span>
                  <span className={styles.filterCount}>{count}</span>
                </button>
              );
            })}
          </nav>

          <div className={`${styles.binderScroll}${isDraggingActive ? ` ${styles.binderScrollLocked}` : ""}`}>
            {visibleCards.length === 0 ? (
              <div className={styles.emptyBinder}>
                <NjamboIcon name="cards" tone="gold" size={38} />
                <strong>Aucune carte dans ce filtre</strong>
                <p>Ouvre des Grimoires ou la Grille du jour à la boutique pour enrichir ton deck.</p>
                <button
                  data-nj-skin="none"
                  type="button"
                  className={styles.emptyShopBtn}
                  onClick={() => navigateTo("power_shop")}
                >
                  Aller à la boutique →
                </button>
              </div>
            ) : (
              <div className={styles.cardGrid}>
                {visibleCards.map((card, idx) => {
                  const owned = (inventory[card.id] ?? 0) > 0;
                  const isEquipped = equipped.includes(card.id);
                  const isSelected = selectedId === card.id;
                  const rarity = RARITY_META[card.rarity];
                  const pal = CATEGORY_MOTIF_PALETTE[card.category];
                  const isSourceDragging = Boolean(
                    drag?.active && drag.source === "binder" && drag.card.id === card.id,
                  );

                  return (
                    <motion.div
                      key={`${filter}-${card.id}`}
                      initial={cascadeOn ? { opacity: 0, y: 14, scale: 0.94 } : false}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      whileHover={cascadeOn ? { y: -5, scale: 1.035 } : undefined}
                      whileTap={{ scale: 0.96 }}
                      transition={{
                        type: "spring",
                        stiffness: 340,
                        damping: 24,
                        delay: cascadeOn ? Math.min(idx * 0.025, 0.22) : 0,
                      }}
                      className={styles.gridItemWrap}
                    >
                      <div
                        role="button"
                        tabIndex={0}
                        className={[
                          styles.artifactCard,
                          styles[rarity.className],
                          owned ? styles.cardOwned : styles.cardLocked,
                          isEquipped ? styles.cardEquipped : "",
                          isSelected ? styles.cardSelected : "",
                          isSourceDragging ? styles.cardGhostOrigin : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        style={
                          {
                            "--c-primary": pal.primary,
                            "--c-secondary": pal.secondary,
                            "--c-glow": pal.glow,
                            "--c-top": pal.clothTop,
                            "--c-bot": pal.clothBot,
                            "--sheen-delay": `${(idx % 6) * 0.65}s`,
                          } as CSSProperties
                        }
                        onPointerDown={(e) => startMouseDrag(e, card, "binder")}
                        onTouchStart={(e) => startTouchDrag(e, card, "binder")}
                        onClick={() => handleCardClick(card)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") handleCardClick(card);
                        }}
                        aria-label={`${card.name}, ${pal.label}, ${rarity.label}, ${owned ? (isEquipped ? "équipée" : "possédée") : "verrouillée"}`}
                      >
                        {/* Artwork fondu organiquement dans la carte (sans cadre plastique) */}
                        <div className={styles.artCanvas}>
                          <Image
                            src={card.art}
                            alt=""
                            fill
                            sizes="(max-width: 600px) 32vw, 150px"
                            className={styles.cardArtImg}
                          />
                        </div>

                        {/* GRAND MOTIF NDOP & SYMBOLIQUE COLORÉ PAR TYPE + ARCHITECTURE DE RARETÉ */}
                        <PowerCardMotif category={card.category} rarity={card.rarity} className={styles.cardMotifSvg} />

                        {/* Balayage holographique subtil */}
                        <span className={styles.cardHoloSweep} aria-hidden="true" />

                        {/* Haut de carte épuré : le grand blason gravé au centre reste libre, statut à droite */}
                        <div className={styles.cardTopMeta}>
                          {isEquipped ? (
                            <span className={styles.equippedDot} title="Équipée dans ton deck">✓</span>
                          ) : owned ? (
                            <span
                              className={styles.dragHandleTouch}
                              onPointerDown={(e) => {
                                e.stopPropagation();
                                startMouseDrag(e, card, "binder", undefined, true);
                              }}
                              onTouchStart={(e) => startTouchDrag(e, card, "binder", undefined, true)}
                              title="Glisser dans le deck"
                              aria-hidden="true"
                            >
                              ⋮⋮
                            </span>
                          ) : (
                            <span className={styles.lockMark} aria-hidden="true">🔒</span>
                          )}
                        </div>

                        {/* Bas de carte flottant sur le grand motif coloré */}
                        <div className={styles.cardBottomInfo}>
                          <span className={styles.typeEmblem}>
                            <NjamboIcon name={card.icon as NjamboIconName} tone={card.tone} size={15} />
                          </span>
                          <span className={styles.cardTypeName}>{pal.label}</span>
                          <strong className={styles.cardTitle}>{card.name}</strong>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      </div>

      {/* ═══ 3. CARTE FANTÔME PENDANT DRAG & DROP (SOURIS + MOBILE) ═══ */}
      {drag?.active && (
        <div
          className={styles.dragGhost}
          style={
            {
              "--c-primary": CATEGORY_MOTIF_PALETTE[drag.card.category].primary,
              "--c-secondary": CATEGORY_MOTIF_PALETTE[drag.card.category].secondary,
              "--c-glow": CATEGORY_MOTIF_PALETTE[drag.card.category].glow,
              "--c-top": CATEGORY_MOTIF_PALETTE[drag.card.category].clothTop,
              "--c-bot": CATEGORY_MOTIF_PALETTE[drag.card.category].clothBot,
              transform: `translate3d(${drag.x - 48}px, ${drag.y - 68}px, 0) rotate(${hoverSlot !== null ? 0 : -5}deg) scale(${hoverSlot !== null ? 1.07 : 1})`,
            } as CSSProperties
          }
          aria-hidden="true"
        >
          <div className={styles.slottedArtWrap}>
            <Image src={drag.card.art} alt="" fill sizes="120px" className={styles.slotArt} />
          </div>
          <PowerCardMotif category={drag.card.category} rarity={drag.card.rarity} className={styles.slotMotifSvg} />
          <strong className={styles.ghostTitle}>{drag.card.name}</strong>
        </div>
      )}

      {/* ═══ 4. MODALE INSPECTEUR SUR MOBILE (< 900px) ═══ */}
      <GameModal
        open={mobileModalOpen}
        onClose={() => setMobileModalOpen(false)}
        kicker={`${inspectedPal.label} · ${inspectedRarity.label}`}
        title={inspected.name}
        tone={inspectedRarity.modalTone}
        footer={
          inspectedOwned ? (
            <button
              data-nj-skin="none"
              type="button"
              className={`${styles.inspectorCta} ${inspectedEquipped ? styles.ctaRemove : styles.ctaEquip}`}
              onClick={() => {
                toggleEquip(inspected.id);
                setMobileModalOpen(false);
              }}
            >
              <span>
                {inspectedEquipped
                  ? "Retirer du deck"
                  : equipped.length >= MAX_EQUIPPED_POWERS
                  ? "Équiper (remplace slot III)"
                  : "Équiper dans mon deck"}
              </span>
            </button>
          ) : (
            <button
              data-nj-skin="none"
              type="button"
              className={`${styles.inspectorCta} ${styles.ctaShop}`}
              onClick={() => {
                setMobileModalOpen(false);
                navigateTo("power_shop");
              }}
            >
              <span>Débloquer à la Boutique →</span>
            </button>
          )
        }
      >
        <div className={styles.mobileInspectorBody}>
          <div
            className={styles.inspectorStage}
            style={{ "--c-primary": inspectedPal.primary, "--c-glow": inspectedPal.glow } as CSSProperties}
          >
            <span className={styles.inspectorSunburst} aria-hidden="true" />
            <div
              className={`${styles.heroArtifactCard} ${styles[inspectedRarity.className]}`}
              style={
                {
                  "--c-primary": inspectedPal.primary,
                  "--c-secondary": inspectedPal.secondary,
                  "--c-glow": inspectedPal.glow,
                  "--c-top": inspectedPal.clothTop,
                  "--c-bot": inspectedPal.clothBot,
                } as CSSProperties
              }
            >
              <div className={styles.heroArtMask}>
                <Image src={inspected.art} alt={inspected.name} fill sizes="200px" className={styles.heroArtImg} />
              </div>
              <PowerCardMotif category={inspected.category} rarity={inspected.rarity} className={styles.heroMotifSvg} />
              <div className={styles.heroBottomInfo}>
                <span className={styles.heroIconHalo}>
                  <NjamboIcon name={inspected.icon as NjamboIconName} tone={inspected.tone} size={18} />
                </span>
                <span className={styles.heroCatLabel}>
                  {inspectedPal.label} · {inspectedRarity.label}
                </span>
                <strong>{inspected.name}</strong>
              </div>
            </div>
          </div>

          <p className={styles.mobileInspectDesc}>{inspected.description}</p>
          <span className={inspectedOwned ? styles.statusOwned : styles.statusLocked}>
            {inspectedOwned
              ? "✓ Possédée · Glisse depuis la poignée ⋮⋮ ou maintiens la carte pour la déposer"
              : "Disponible dans les Livres & la Grille du jour à la Boutique"}
          </span>
        </div>
      </GameModal>
    </GameShell>
  );
}
