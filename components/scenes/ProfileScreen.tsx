"use client";

import Image from "next/image";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { motion } from "motion/react";
import { countStoredCollectionItems } from "@/domain";
import { useGame } from "@/contexts/GameContext";
import { useAuth } from "@/hooks/useAuth";
import { useEconomy } from "@/contexts/EconomyContext";
import { MAX_EQUIPPED_POWERS, POWER_CARDS_BY_ID } from "@/config/powerCards";
import { CATEGORY_MOTIF_PALETTE, PowerCardMotif } from "@/components/power/PowerCardMotif";
import { getPlayerLevel } from "@/lib/playerLevel";
import { resolveRank } from "@/lib/playerRank";
import { listenPlayer } from "@/lib/socialData";
import { useMotionProfile } from "@/lib/motion";
import { NKAP } from "@/data/mock";
import { AvatarIllustration, NjamboIcon } from "@/components/ui/Art";
import { GameShell } from "@/components/ui/GameShell";
import { GameModal } from "@/components/ui/GameModal";
import { AuthGate } from "@/components/ui/AuthGate";
import type { PlayerStats, PowerCardId, PublicPlayerProfile } from "@/types/game";
import { CosmeticCollection } from "./CosmeticCollection";
import { useMyCosmetics } from "@/hooks/useMyCosmetics";
import styles from "./ProfileScreen.module.css";

const AVATARS = [
  "you-nogoh",
  "avatar-douala",
  "avatar-bamoun",
  "avatar-beti",
  "avatar-bassa",
  "avatar-sawa",
  "avatar-bamilike",
  "avatar-mboa",
  "avatar-ndop",
  "avatar-rapha",
];

const ZERO_STATS: PlayerStats = { played: 0, won: 0, bestWin: 0 };

export function ProfileScreen() {
  const [collectionOpen, setCollectionOpen] = useState(false);
  const myCosmetics = useMyCosmetics();
  const { profile, setProfile, navigateTo, setCollectionTab, cfg } = useGame();
  const powerLimit = cfg?.maxEquippedPowers ?? MAX_EQUIPPED_POWERS;
  const { user, updateUserProfile, updateAgeBand, logout } = useAuth();
  const { economy, rank, inventory } = useEconomy();
  const motionProfile = useMotionProfile();

  const [onlineProfile, setOnlineProfile] = useState<PublicPlayerProfile | null>(null);
  const [editing, setEditing] = useState(false);
  const [avatarModalOpen, setAvatarModalOpen] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [draftName, setDraftName] = useState(user?.name ?? profile.name);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const isGuest = !user || user.isAnonymous === true;
  const cascadeOn = motionProfile.allowEntranceCascade;
  const loopsOn = motionProfile.allowDecorativeLoop;

  useEffect(() => {
    if (!isGuest && authModalOpen) setAuthModalOpen(false);
  }, [isGuest, authModalOpen]);

  useEffect(() => {
    if (!user?.uid) {
      setOnlineProfile(null);
      return;
    }
    return listenPlayer(user.uid, setOnlineProfile);
  }, [user?.uid]);

  const shownName = onlineProfile?.name ?? user?.name ?? profile.name;
  const shownEmoji = onlineProfile?.emoji ?? user?.emoji ?? profile.emoji;
  const shownBalance = economy?.nkap ?? profile.balance;
  const shownCauris = economy?.cauris ?? profile.cauris ?? 0;
  const stats = onlineProfile?.stats ?? ZERO_STATS;
  const level = getPlayerLevel(stats, shownBalance);
  const resolvedRank = resolveRank(rank?.crowns);
  const winRate = stats.played > 0 ? Math.round((stats.won / stats.played) * 100) : 0;
  const xpPct = Math.max(4, Math.min(100, Math.round(level.progress * 100)));
  const energyAvail = economy?.energy.available ?? 100;
  const energyPct = economy?.energy.unlimited ? 100 : Math.max(0, Math.min(100, energyAvail));

  const storedObjects = useMemo(() => countStoredCollectionItems(inventory), [inventory]);

  const equippedPowers = useMemo(() => {
    const owned = !isGuest
      ? new Set(Object.keys(inventory.cards ?? {}))
      : new Set(Object.keys(profile.powerInventory ?? {}));
    const raw = !isGuest
      ? ((inventory.equippedCards ?? []) as PowerCardId[])
      : (profile.equippedPowers ?? []);
    return raw.filter((id) => owned.has(id) && Boolean(POWER_CARDS_BY_ID[id])).slice(0, powerLimit);
  }, [isGuest, inventory.cards, inventory.equippedCards, profile.powerInventory, profile.equippedPowers, powerLimit]);

  const saveProfile = async (next: typeof profile) => {
    setProfile(next);
    setSaving(true);
    setError("");
    try {
      if (user) {
        await updateUserProfile({ name: next.name, emoji: next.emoji });
      }
    } catch (err: unknown) {
      setError(`Sauvegarde échouée : ${(err as Error)?.message ?? "Erreur"}`);
    } finally {
      setSaving(false);
    }
  };

  const saveName = () => {
    const trimmed = draftName.trim();
    if (!trimmed) {
      setError("Le pseudo ne peut pas être vide.");
      return;
    }
    void saveProfile({ ...profile, name: trimmed, emoji: shownEmoji, balance: shownBalance });
    setEditing(false);
  };

  /* Jauge circulaire SVG du taux de victoire */
  const gaugeRadius = 34;
  const gaugeCirc = 2 * Math.PI * gaugeRadius;
  const gaugeOffset = gaugeCirc * (1 - winRate / 100);

  return (
    <GameShell
      active="menu"
      dock={false}
      scroll={false}
      className={`${styles.scene}${!loopsOn ? ` ${styles.motionReduced}` : ""}`}
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
            <span className={styles.hudKicker}>Carte de joueur</span>
            <h1>Mon profil</h1>
          </div>
        </div>

        <div className={styles.hudRight}>
          {isGuest && (
            <button
              data-nj-skin="none"
              type="button"
              className={styles.connectHudBtn}
              onClick={() => setAuthModalOpen(true)}
            >
              <NjamboIcon name="profile" tone="teal" size={15} />
              <span>Connexion</span>
            </button>
          )}
          <button
            data-nj-skin="none"
            type="button"
            className={styles.walletBtn}
            onClick={() => navigateTo("wallet")}
            aria-label={`Ouvrir mon portefeuille : ${shownBalance.toLocaleString("fr-FR")} Nkap`}
          >
            <Image src="/assets/njambo/economy/nkap-stack-64.webp" alt="" width={18} height={18} />
            <strong>{shownBalance.toLocaleString("fr-FR")}</strong>
          </button>
        </div>
      </header>

      {/* ═══ 2. ARÈNE PROFIL : CARTE FOIL COLLECTIBLE + PALMARÈS ═══ */}
      <div className={styles.scrollBody}>
        <div className={styles.passGrid}>
          {/* ─── GAUCHE : CARTE DE JOUEUR HOLOGRAPHIQUE COLLECTIBLE ─── */}
          <motion.article
            className={styles.vipCard}
            initial={cascadeOn ? { opacity: 0, y: 18, rotateY: -8 } : false}
            animate={{ opacity: 1, y: 0, rotateY: 0 }}
            transition={{ type: "spring", stiffness: 280, damping: 24 }}
          >
            <span className={styles.vipTrim} aria-hidden="true" />
            <span className={styles.vipHoloSweep} aria-hidden="true" />
            <span className={styles.cornerSuitTop} aria-hidden="true">♠</span>
            <span className={styles.cornerSuitBot} aria-hidden="true">♠</span>

            {/* En-tête de la carte : Rang 2,5D + Niveau */}
            <div className={styles.vipTop}>
              <button
                data-nj-skin="none"
                type="button"
                className={styles.vipRankPill}
                onClick={() => navigateTo("leaderboard")}
                title="Voir le classement"
              >
                <Image src={resolvedRank.assetSrc} alt="" width={22} height={22} />
                <span>{resolvedRank.label}</span>
              </button>

              <span className={`${styles.vipLevelPill}${isGuest ? ` ${styles.vipGuestPill}` : ""}`}>
                Niv. {level.level}
              </span>
            </div>

            {/* Scène Avatar avec rayons solaires tournants & médaillon gravé */}
            <div className={styles.vipAvatarStage}>
              <span className={styles.avatarSunburst} aria-hidden="true" />
              <div className={styles.avatarMedallion}>
                <span className={styles.vipAvatarRing}>
                  <AvatarIllustration seed={shownEmoji} size={96} online />
                </span>
                <button
                  data-nj-skin="none"
                  type="button"
                  className={styles.avatarEditBadge}
                  onClick={() => setAvatarModalOpen(true)}
                  aria-label="Changer d'avatar"
                  title="Changer d'avatar"
                >
                  ✎
                </button>
              </div>
            </div>

            {/* Plaque de pseudo */}
            {editing ? (
              <div className={styles.nameEditRow}>
                <input
                  value={draftName}
                  onChange={(e) => { setDraftName(e.target.value); setError(""); }}
                  className={styles.nameInput}
                  maxLength={22}
                  aria-label="Nouveau pseudo"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveName();
                    if (e.key === "Escape") setEditing(false);
                  }}
                />
                <button
                  data-nj-skin="none"
                  type="button"
                  className={styles.saveNameBtn}
                  onClick={saveName}
                  disabled={saving}
                >
                  {saving ? "…" : "OK"}
                </button>
              </div>
            ) : (
              <div className={styles.nameRow}>
                <h2>{shownName}</h2>
                <button
                  data-nj-skin="none"
                  type="button"
                  className={styles.editIconBtn}
                  onClick={() => { setDraftName(shownName); setEditing(true); setError(""); }}
                  aria-label="Modifier le pseudo"
                  title="Modifier le pseudo"
                >
                  ✎
                </button>
              </div>
            )}

            <span className={styles.accountBadgeLine}>
              {isGuest
                ? "Mode invité · Progression locale"
                : (user?.email ?? user?.phoneNumber ?? "Compte permanent vérifié")}
            </span>

            {/* Barre d'XP animée */}
            <div className={styles.xpBox}>
              <div className={styles.xpHead}>
                <span>{level.title}</span>
                <strong>{xpPct} %</strong>
              </div>
              <div className={styles.xpTrack} aria-hidden="true">
                <motion.span
                  initial={cascadeOn ? { width: "0%" } : false}
                  animate={{ width: `${xpPct}%` }}
                  transition={{ duration: 0.75, ease: [0.22, 1, 0.36, 1], delay: 0.12 }}
                />
              </div>
            </div>

            {/* Mini-deck des 3 cartes Pouvoir intégrées à la carte joueur */}
            <button
              data-nj-skin="none"
              type="button"
              className={styles.cardDeckTray}
              onClick={() => {
                setCollectionTab("powers");
                navigateTo("power_collection");
              }}
              aria-label={`Mon deck actif : ${equippedPowers.length} cartes pouvoir sur ${powerLimit}`}
            >
              <div className={styles.deckTrayLeft}>
                <small>Deck équipé</small>
                <strong>{equippedPowers.length}/{powerLimit} pouvoirs</strong>
              </div>
              <div className={styles.deckMiniFan} aria-hidden="true">
                {Array.from({ length: Math.min(3, powerLimit) }, (_, i) => {
                  const id = equippedPowers[i];
                  const def = id ? POWER_CARDS_BY_ID[id] : null;
                  const pal = def ? CATEGORY_MOTIF_PALETTE[def.category] : null;
                  return (
                    <span
                      key={i}
                      className={`${styles.deckSlot} ${styles[`ds_${i}`]}${def ? ` ${styles.deckSlotOn}` : ""}`}
                      style={
                        pal
                          ? ({
                              "--c-primary": pal.primary,
                              "--c-secondary": pal.secondary,
                              "--c-glow": pal.glow,
                              "--c-top": pal.clothTop,
                              "--c-bot": pal.clothBot,
                            } as CSSProperties)
                          : undefined
                      }
                    >
                      {def ? (
                        <>
                          <span className={styles.deckSlotArtMask}>
                            <Image src={def.art} alt="" fill sizes="44px" className={styles.deckSlotImg} />
                          </span>
                          <PowerCardMotif
                            category={def.category}
                            rarity={def.rarity}
                            className={styles.deckSlotMotif}
                          />
                        </>
                      ) : (
                        <span>+</span>
                      )}
                    </span>
                  );
                })}
              </div>
            </button>

            {/* Objets récupérés & cosmétiques (Ma collection) */}
            {!isGuest && (
              <button
                data-nj-skin="none"
                type="button"
                className={styles.cardDeckTray}
                onClick={() => setCollectionOpen(true)}
                aria-label="Ma collection d'objets et cosmétiques"
              >
                <div className={styles.deckTrayLeft}>
                  <small>Ma collection</small>
                  <strong>
                    {storedObjects.total > 0
                      ? `${storedObjects.total} objet${storedObjects.total > 1 ? "s" : ""} prêt${storedObjects.total > 1 ? "s" : ""}${myCosmetics.title ? ` · « ${myCosmetics.title.name} »` : ""}`
                      : myCosmetics.title
                      ? `« ${myCosmetics.title.name} »`
                      : "Objets, packs & cosmétiques"}
                  </strong>
                </div>
                <span aria-hidden="true" style={{ fontSize: 22 }}>✨</span>
              </button>
            )}

            {error && <div className={styles.errBox} role="alert">{error}</div>}
          </motion.article>

          {/* ─── DROITE : PALMARÈS, TRÉSOR 2,5D & COMPTE ─── */}
          <section className={styles.statsColumn} aria-label="Palmarès et ressources">
            {/* Invitation élégante à sauvegarder le compte (uniquement en invité) */}
            {isGuest && (
              <motion.div
                className={styles.guestSaveCard}
                initial={cascadeOn ? { opacity: 0, y: 12 } : false}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.28 }}
              >
                <span className={styles.guestSaveIcon}>
                  <NjamboIcon name="crown" tone="gold" size={26} />
                </span>
                <div className={styles.guestSaveCopy}>
                  <strong>Sauvegarde ta carte de joueur</strong>
                  <small>Connecte-toi pour débloquer le Classé, les tournois du Ter et garder tes gains.</small>
                </div>
                <button
                  data-nj-skin="none"
                  type="button"
                  className={styles.guestSaveCta}
                  onClick={() => setAuthModalOpen(true)}
                >
                  <span className={styles.btnSheen} aria-hidden="true" />
                  <span>Se connecter</span>
                </button>
              </motion.div>
            )}

            {/* CARTE PALMARÈS AVEC JAUGE CIRCULAIRE SVG ANIMÉE */}
            <motion.div
              className={styles.winGaugeCard}
              initial={cascadeOn ? { opacity: 0, y: 14 } : false}
              animate={{ opacity: 1, y: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 24, delay: cascadeOn ? 0.06 : 0 }}
            >
              <div className={styles.gaugeVisual} aria-label={`Taux de victoire : ${winRate} %`}>
                <svg viewBox="0 0 84 84" className={styles.gaugeSvg} aria-hidden="true">
                  <defs>
                    <linearGradient id="njWinGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#4df5d8" />
                      <stop offset="100%" stopColor="#ffcf40" />
                    </linearGradient>
                  </defs>
                  <circle cx="42" cy="42" r={gaugeRadius} className={styles.gaugeBg} />
                  <motion.circle
                    cx="42"
                    cy="42"
                    r={gaugeRadius}
                    className={styles.gaugeFill}
                    stroke="url(#njWinGrad)"
                    strokeDasharray={gaugeCirc}
                    initial={cascadeOn ? { strokeDashoffset: gaugeCirc } : false}
                    animate={{ strokeDashoffset: gaugeOffset }}
                    transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1], delay: 0.18 }}
                  />
                </svg>
                <div className={styles.gaugeCenter}>
                  <strong>{winRate}%</strong>
                  <small>Victoires</small>
                </div>
              </div>

              <div className={styles.palmaresCounters}>
                <div className={styles.pCounter}>
                  <small>Manches</small>
                  <strong>{stats.played}</strong>
                </div>
                <div className={styles.pCounter}>
                  <small>Gagnées</small>
                  <strong className={styles.pWinNum}>{stats.won}</strong>
                </div>
                <div className={styles.pCounter}>
                  <small>Record</small>
                  <strong className={styles.pGoldNum}>{NKAP(stats.bestWin)}</strong>
                </div>
              </div>
            </motion.div>

            {/* 4 TUILES TRÉSOR & RANG 2,5D ANIMÉES */}
            <div className={styles.statsGrid}>
              {(
                [
                  {
                    id: "nkap",
                    label: "Nkap",
                    value: NKAP(shownBalance),
                    img: "/assets/njambo/economy/nkap-stack-64.webp",
                    tone: styles.stGold,
                    onClick: () => navigateTo("wallet"),
                  },
                  {
                    id: "cauris",
                    label: "Cauris",
                    value: shownCauris.toLocaleString("fr-FR"),
                    img: "/assets/njambo/economy/cauris-pouch-64.webp",
                    tone: styles.stPink,
                    onClick: () => navigateTo("wallet"),
                  },
                  {
                    id: "energy",
                    label: "Énergie",
                    value: economy?.energy.unlimited ? "∞" : `${energyAvail}/100`,
                    img: "/assets/njambo/economy/energy-flask-64.webp",
                    tone: styles.stTeal,
                    progress: energyPct,
                    onClick: () => navigateTo("wallet"),
                  },
                  {
                    id: "crowns",
                    label: "Couronnes",
                    value: rank.crowns.toLocaleString("fr-FR"),
                    img: resolvedRank.assetSrc,
                    tone: styles.stBlue,
                    onClick: () => navigateTo("leaderboard"),
                  },
                ] as Array<{
                  id: string;
                  label: string;
                  value: string;
                  img: string;
                  tone: string;
                  progress?: number;
                  onClick: () => void;
                }>
              ).map((tile, idx) => (
                <motion.button
                  key={tile.id}
                  data-nj-skin="none"
                  type="button"
                  initial={cascadeOn ? { opacity: 0, y: 14, scale: 0.96 } : false}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  whileHover={cascadeOn ? { y: -3, scale: 1.02 } : undefined}
                  whileTap={{ scale: 0.97 }}
                  transition={{
                    type: "spring",
                    stiffness: 320,
                    damping: 24,
                    delay: cascadeOn ? 0.1 + idx * 0.05 : 0,
                  }}
                  className={`${styles.statTile} ${tile.tone}`}
                  style={{ "--float-delay": `${idx * 0.35}s` } as CSSProperties}
                  onClick={tile.onClick}
                >
                  <span className={styles.statIconWrap}>
                    <Image src={tile.img} alt="" width={32} height={32} className={styles.statIconImg} />
                  </span>
                  <div className={styles.statText}>
                    <small>{tile.label}</small>
                    <strong>{tile.value}</strong>
                    {typeof tile.progress === "number" && (
                      <span className={styles.miniEnergyBar} aria-hidden="true">
                        <span style={{ width: `${tile.progress}%` }} />
                      </span>
                    )}
                  </div>
                </motion.button>
              ))}
            </div>

            {/* RACCOURCIS RAPIDES */}
            <div className={styles.quickNavRow}>
              <button
                data-nj-skin="none"
                type="button"
                className={styles.quickNavBtn}
                onClick={() => navigateTo("history")}
              >
                <NjamboIcon name="history" tone="pink" size={18} />
                <span>Historique</span>
              </button>
              <button
                data-nj-skin="none"
                type="button"
                className={styles.quickNavBtn}
                onClick={() => navigateTo("leaderboard")}
              >
                <NjamboIcon name="trophy" tone="gold" size={18} />
                <span>Classement</span>
              </button>
              <button
                data-nj-skin="none"
                type="button"
                className={styles.quickNavBtn}
                onClick={() => navigateTo("wallet")}
              >
                <NjamboIcon name="coin" tone="teal" size={18} />
                <span>Journal</span>
              </button>
            </div>

            {/* COMPTE PERMANENT : TRANCHE D'ÂGE + DÉCONNEXION */}
            {!isGuest && user && (
              <div className={styles.accountFooterCard}>
                <div className={styles.ageRow}>
                  <div className={styles.ageCopy}>
                    <strong>Tranche d&apos;âge</strong>
                    <small>Requise pour les achats XAF simulés (18+).</small>
                  </div>
                  <div className={styles.ageBtns}>
                    <button
                      data-nj-skin="none"
                      type="button"
                      aria-pressed={user.ageBand === "13_17"}
                      className={`${styles.ageBtn}${user.ageBand === "13_17" ? ` ${styles.ageBtnActive}` : ""}`}
                      onClick={() => void updateAgeBand("13_17")}
                    >
                      13–17 ans
                    </button>
                    <button
                      data-nj-skin="none"
                      type="button"
                      aria-pressed={user.ageBand === "18_plus"}
                      className={`${styles.ageBtn}${user.ageBand === "18_plus" ? ` ${styles.ageBtnActive}` : ""}`}
                      onClick={() => void updateAgeBand("18_plus")}
                    >
                      18 ans +
                    </button>
                  </div>
                </div>

                <button
                  data-nj-skin="none"
                  type="button"
                  className={styles.logoutBtn}
                  onClick={() => { void logout(); }}
                >
                  Déconnexion
                </button>
              </div>
            )}
          </section>
        </div>
      </div>

      {/* ═══ MODALE SÉLECTEUR D'AVATAR ANIMÉE ═══ */}
      <GameModal open={avatarModalOpen} onClose={() => setAvatarModalOpen(false)} kicker="Personnalisation" title="Choisis ton avatar" tone="gold">
        <div className={styles.avatarGrid}>
          {AVATARS.map((seed, idx) => {
            const selected = shownEmoji === seed;
            return (
              <motion.button
                key={seed}
                data-nj-skin="none"
                type="button"
                aria-pressed={selected}
                initial={cascadeOn ? { opacity: 0, scale: 0.78 } : false}
                animate={{ opacity: 1, scale: 1 }}
                whileHover={cascadeOn ? { scale: 1.08 } : undefined}
                whileTap={{ scale: 0.94 }}
                transition={{ type: "spring", stiffness: 360, damping: 22, delay: cascadeOn ? idx * 0.025 : 0 }}
                className={`${styles.avatarChoice}${selected ? ` ${styles.avatarChoiceActive}` : ""}`}
                onClick={() => {
                  void saveProfile({ ...profile, name: shownName, emoji: seed, balance: shownBalance });
                  setAvatarModalOpen(false);
                }}
              >
                <AvatarIllustration seed={seed} size={50} />
              </motion.button>
            );
          })}
        </div>
      </GameModal>

      {/* ═══ MODALE MA COLLECTION (Objets récupérés + Cosmétiques) ═══ */}
      <GameModal open={collectionOpen} onClose={() => setCollectionOpen(false)} kicker="Objets & cosmétiques" title="Ma collection" tone="gold" size="lg">
        {collectionOpen && <CosmeticCollection onClose={() => setCollectionOpen(false)} />}
      </GameModal>

      {/* ═══ MODALE CONNEXION / SAUVEGARDER LE COMPTE ═══ */}
      <GameModal open={authModalOpen} onClose={() => setAuthModalOpen(false)} kicker="Compte Njambo" title="Sauvegarder mon profil" tone="gold">
        <AuthGate tone="gold" accountBar="none">
          <div className={styles.authDone}>Compte connecté ! Ta carte de joueur est sauvegardée.</div>
        </AuthGate>
      </GameModal>
    </GameShell>
  );
}
