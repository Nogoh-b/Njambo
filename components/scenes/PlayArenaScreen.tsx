"use client";

import Image from "next/image";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useGame } from "@/contexts/GameContext";
import { useEconomy } from "@/contexts/EconomyContext";
import { useLobby } from "@/contexts/LobbyContext";
import { useAuth } from "@/hooks/useAuth";
import { useOnlinePlayers } from "@/hooks/useOnlinePlayers";
import { BOTS, NKAP } from "@/data/mock";
import { MAX_EQUIPPED_POWERS, POWER_CARDS_BY_ID } from "@/config/powerCards";
import { matchCountFor } from "@/domain/gameplayConfig";
import { CATEGORY_MOTIF_PALETTE, PowerCardMotif } from "@/components/power/PowerCardMotif";
import { PlayCard } from "@/components/cards/PlayCard";
import { AvatarIllustration, NjamboIcon, type NjamboIconName } from "@/components/ui/Art";
import { AuthGate } from "@/components/ui/AuthGate";
import { GameModal } from "@/components/ui/GameModal";
import { GameShell } from "@/components/ui/GameShell";
import type { BotDifficulty, Card, PowerCardId, PublicPlayerProfile } from "@/types/game";
import styles from "./PlayArenaScreen.module.css";
import { sysAsset } from "@/lib/assetPack";

export type PlayArenaMode = "bot" | "online" | "friends";

export interface PlayArenaScreenProps {
  initialMode?: PlayArenaMode;
  onBotStart: (botCount: number, mise: number, difficulty: BotDifficulty) => void;
}

const MODE_TABS: Array<{
  id: PlayArenaMode;
  label: string;
  shortLabel: string;
  subtitle: string;
  icon: NjamboIconName;
  tone: "gold" | "teal" | "pink";
  chip: string;
}> = [
  {
    id: "bot",
    label: "Contre l’IA",
    shortLabel: "Solo IA",
    subtitle: "Solo rapide",
    icon: "bot",
    tone: "gold",
    chip: "Solo",
  },
  {
    id: "online",
    label: "Classé en ligne",
    shortLabel: "En ligne",
    subtitle: "Table classée",
    icon: "online",
    tone: "teal",
    chip: "Classé",
  },
  {
    id: "friends",
    label: "Entre amis",
    shortLabel: "Amis",
    subtitle: "Table privée",
    icon: "friends",
    tone: "pink",
    chip: "Privé",
  },
];

const DIFFICULTIES: Array<{
  key: BotDifficulty;
  label: string;
  stars: string;
  sub: string;
  toneClass: string;
  crestClass: string;
}> = [
  { key: "easy", label: "Facile", stars: "★", sub: "Détente", toneClass: "diffEasy", crestClass: "crestPalm" },
  { key: "normal", label: "Normal", stars: "★★", sub: "Équilibré", toneClass: "diffNormal", crestClass: "crestGold" },
  { key: "hard", label: "Difficile", stars: "★★★", sub: "Redoutable", toneClass: "diffHard", crestClass: "crestPink" },
];

const TABLE_SIZES = [
  { seats: 2, label: "2J", tag: "Duel" },
  { seats: 3, label: "3J", tag: "Trio" },
  { seats: 4, label: "4J", tag: "Carré" },
] as const;

const STAKE_ART = [
  { src: sysAsset("/assets/njambo/economy/nkap-64.webp"), count: 1 },
  { src: sysAsset("/assets/njambo/economy/nkap-stack-64.webp"), count: 1 },
  { src: sysAsset("/assets/njambo/economy/nkap-stack-64.webp"), count: 2 },
] as const;

const ONLINE_SEAT_SEEDS = ["avatar-douala", "avatar-bamoun", "avatar-beti"] as const;

/* Cartes réelles disposées en pli vivant sur le tapis selon le mode choisi */
const TABLE_TRICK_CARDS: Record<PlayArenaMode, [Card, Card, Card, Card]> = {
  bot: [
    { id: "pa-bot-1", rank: "6", value: 6, suit: "♥", color: "#b81d2d" },
    { id: "pa-bot-2", rank: "9", value: 9, suit: "♥", color: "#b81d2d" },
    { id: "pa-bot-3", rank: "10", value: 10, suit: "♣", color: "#1c1f24" },
    { id: "pa-bot-4", rank: "3", value: 3, suit: "♠", color: "#1c1f24" },
  ],
  online: [
    { id: "pa-on-1", rank: "10", value: 10, suit: "♠", color: "#1c1f24" },
    { id: "pa-on-2", rank: "A", value: 14, suit: "♠", color: "#1c1f24" },
    { id: "pa-on-3", rank: "K", value: 13, suit: "♦", color: "#b81d2d" },
    { id: "pa-on-4", rank: "3", value: 3, suit: "♦", color: "#b81d2d" },
  ],
  friends: [
    { id: "pa-fr-1", rank: "7", value: 7, suit: "♣", color: "#1c1f24" },
    { id: "pa-fr-2", rank: "A", value: 14, suit: "♥", color: "#b81d2d" },
    { id: "pa-fr-3", rank: "Q", value: 12, suit: "♠", color: "#1c1f24" },
    { id: "pa-fr-4", rank: "3", value: 3, suit: "♥", color: "#b81d2d" },
  ],
};

const PLAYER_HAND_PREVIEW: [Card, Card, Card, Card, Card] = [
  { id: "pa-hand-1", rank: "5", value: 5, suit: "♣", color: "#1c1f24" },
  { id: "pa-hand-2", rank: "7", value: 7, suit: "♠", color: "#1c1f24" },
  { id: "pa-hand-3", rank: "A", value: 14, suit: "♥", color: "#b81d2d" },
  { id: "pa-hand-4", rank: "10", value: 10, suit: "♦", color: "#b81d2d" },
  { id: "pa-hand-5", rank: "3", value: 3, suit: "♠", color: "#1c1f24" },
];

type SeatSlotPos = "north" | "nw" | "ne" | "west" | "east";

function seatPositionsForCount(opponents: number): SeatSlotPos[] {
  if (opponents <= 1) return ["north"];
  if (opponents === 2) return ["nw", "ne"];
  return ["west", "north", "east"];
}

export function PlayArenaScreen({ initialMode = "bot", onBotStart }: PlayArenaScreenProps) {
  const { navigateTo, goBack, backLabelFor, cfg, profile } = useGame();
  const powerLimit = cfg?.maxEquippedPowers ?? MAX_EQUIPPED_POWERS;
  const { user } = useAuth();
  const { economy, inventory: serverInventory } = useEconomy();
  const {
    createRoom,
    joinRoomById,
    joinRoomByCode,
    findAvailableRoom,
    publicRooms,
    searchRooms,
    roomError,
    clearError,
  } = useLobby();
  const { players: onlinePlayers, loading: loadingPlayers } = useOnlinePlayers();

  const [mode, setMode] = useState<PlayArenaMode>(initialMode);
  const [seats, setSeats] = useState<number>(3);
  const [mise, setMise] = useState<number>(cfg.stakes[1]);
  const [difficulty, setDifficulty] = useState<BotDifficulty>("normal");
  const [joinCode, setJoinCode] = useState("");
  const [selectedFriends, setSelectedFriends] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [roomsSearched, setRoomsSearched] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [inviteModalOpen, setInviteModalOpen] = useState(false);

  useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);

  useEffect(() => {
    if (mode !== "online") return;
    searchRooms();
    const timer = setTimeout(() => setRoomsSearched(true), 850);
    return () => clearTimeout(timer);
  }, [mode, searchRooms]);

  /* Fermer automatiquement la modale d'auth dès que l'utilisateur se connecte */
  const isGuest = !user || user.isAnonymous === true;
  useEffect(() => {
    if (!isGuest && authModalOpen) {
      setAuthModalOpen(false);
    }
  }, [isGuest, authModalOpen]);

  const opponentCount = seats - 1;
  const pot = mise * seats;
  const stakeIndex = Math.max(0, cfg.stakes.indexOf(mise));
  const stakeArt = STAKE_ART[Math.min(stakeIndex, STAKE_ART.length - 1)];

  const nkap = economy?.nkap ?? profile.balance;
  const energyAvail = economy?.energy.available ?? 0;
  const energyUnlimited = Boolean(economy?.energy.unlimited);

  const botTraining = mode === "bot" && isGuest;
  const requiredEnergy = mode === "bot" ? (botTraining ? 0 : 5) : 10;
  const enoughEnergy = requiredEnergy === 0 || energyUnlimited || energyAvail >= requiredEnergy;
  const enoughNkap = botTraining || nkap >= mise;

  const canLaunchBot = enoughEnergy && enoughNkap;
  const canLaunchOnline = !isGuest && enoughEnergy && enoughNkap && !busy;
  const canLaunchFriends = !isGuest && enoughNkap && !busy;

  const activeModeMeta = MODE_TABS.find((t) => t.id === mode) ?? MODE_TABS[0];
  const activeDiff = DIFFICULTIES.find((d) => d.key === difficulty) ?? DIFFICULTIES[1];
  const trickCards = TABLE_TRICK_CARDS[mode];

  const playerName = user?.name ?? profile.name;
  const playerEmoji = user?.emoji ?? profile.emoji;
  const energyText = isGuest ? "Libre" : energyUnlimited ? "∞" : String(energyAvail);
  const nkapText = isGuest ? "Invité" : nkap.toLocaleString("fr-FR");

  /* Cartes pouvoir réellement possédées et équipées */
  const equippedPowers = useMemo(() => {
    const owned = !isGuest
      ? new Set(Object.keys(serverInventory.cards ?? {}))
      : new Set(Object.keys(profile.powerInventory ?? {}));
    const raw = !isGuest
      ? ((serverInventory.equippedCards ?? []) as PowerCardId[])
      : (profile.equippedPowers ?? []);
    return raw.filter((id) => owned.has(id) && Boolean(POWER_CARDS_BY_ID[id])).slice(0, powerLimit);
  }, [isGuest, serverInventory.cards, serverInventory.equippedCards, profile.powerInventory, profile.equippedPowers, powerLimit]);

  /* Liste d'amis invités pour prévisualisation dans les sièges de la table */
  const invitedProfiles = useMemo<PublicPlayerProfile[]>(() => {
    if (selectedFriends.size === 0) return [];
    const byId = new Map(onlinePlayers.map((p) => [p.uid, p]));
    return Array.from(selectedFriends)
      .map((uid) => byId.get(uid))
      .filter((p): p is PublicPlayerProfile => Boolean(p))
      .slice(0, opponentCount);
  }, [selectedFriends, onlinePlayers, opponentCount]);

  const handleSeatsChange = (nextSeats: number) => {
    setSeats(nextSeats);
    setSelectedFriends((prev) =>
      prev.size <= nextSeats - 1 ? prev : new Set(Array.from(prev).slice(0, nextSeats - 1)),
    );
  };

  const toggleFriend = (uid: string, online: boolean) => {
    if (!online) return;
    setSelectedFriends((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else if (next.size < seats - 1) next.add(uid);
      return next;
    });
  };

  /* Actions par mode */
  const handleModeSwitch = (next: PlayArenaMode) => {
    clearError();
    setMode(next);
  };

  const handleBotLaunch = () => {
    if (!canLaunchBot) return;
    onBotStart(opponentCount, botTraining ? 0 : mise, difficulty);
  };

  const handleOnlineCreate = async () => {
    if (isGuest) {
      setAuthModalOpen(true);
      return;
    }
    if (!canLaunchOnline) return;
    try {
      setBusy(true);
      clearError();
      await createRoom(mise, seats);
      navigateTo("lobby");
    } catch {
      // géré par useLobby
    } finally {
      setBusy(false);
    }
  };

  const handleOnlineAutoMatch = async () => {
    if (isGuest) {
      setAuthModalOpen(true);
      return;
    }
    if (!canLaunchOnline) return;
    try {
      setBusy(true);
      clearError();
      const available = await findAvailableRoom({ stake: mise });
      if (available) {
        const joined = await joinRoomById(available.id);
        if (joined) navigateTo("lobby");
      }
    } catch {
      // géré par useLobby
    } finally {
      setBusy(false);
    }
  };

  const handleOnlineJoinRoom = async (roomId: string) => {
    if (isGuest) {
      setAuthModalOpen(true);
      return;
    }
    try {
      setBusy(true);
      clearError();
      const joined = await joinRoomById(roomId);
      if (joined) navigateTo("lobby");
    } catch {
      // géré par useLobby
    } finally {
      setBusy(false);
    }
  };

  const handleFriendsCreate = async () => {
    if (isGuest) {
      setAuthModalOpen(true);
      return;
    }
    if (!canLaunchFriends) return;
    try {
      setBusy(true);
      clearError();
      await createRoom(mise, seats, "friends");
      navigateTo("lobby");
    } catch {
      // géré par useLobby
    } finally {
      setBusy(false);
    }
  };

  const handleFriendsJoinCode = async () => {
    if (isGuest) {
      setAuthModalOpen(true);
      return;
    }
    if (joinCode.trim().length < 4 || busy) return;
    try {
      setBusy(true);
      clearError();
      const foundId = await joinRoomByCode(joinCode.trim());
      if (foundId) navigateTo("lobby");
    } catch {
      // géré par useLobby
    } finally {
      setBusy(false);
    }
  };

  const matchCount = matchCountFor(cfg, mode, seats);
  const seatSlots = seatPositionsForCount(opponentCount);
  const stageAuraClass =
    mode === "bot"
      ? styles[activeDiff.toneClass]
      : mode === "online"
      ? styles.auraOnline
      : styles.auraFriends;

  return (
    <GameShell
      active="play"
      dock={false}
      scroll={false}
      className={`${styles.scene} ${styles[`tone_${activeModeMeta.tone}`]}`}
      contentClassName={styles.frame}
    >
      {/* ═══ 1. HUD HAUT COMPACT ═══ */}
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
            <span className={styles.hudKicker}>{activeModeMeta.subtitle}</span>
            <h1>{activeModeMeta.label}</h1>
          </div>
        </div>

        <div className={styles.hudWallet}>
          <button
            data-nj-skin="none"
            type="button"
            className={`${styles.miniPill} ${styles.pillTeal}`}
            onClick={() => navigateTo("wallet")}
            aria-label={`Énergie : ${energyText}`}
          >
            <Image src={sysAsset("/assets/njambo/economy/energy-flask-64.webp")} alt="" width={18} height={18} />
            <strong>{energyText}</strong>
          </button>
          <button
            data-nj-skin="none"
            type="button"
            className={`${styles.miniPill} ${styles.pillGold}`}
            onClick={() => navigateTo("wallet")}
            aria-label={`Nkap : ${nkapText}`}
          >
            <Image src={sysAsset("/assets/njambo/economy/nkap-stack-64.webp")} alt="" width={18} height={18} />
            <strong>{nkapText}</strong>
          </button>
        </div>
      </header>

      {/* ═══ 2. SÉLECTEUR DES 3 MODES (UNIFIÉ PARTOUT) ═══ */}
      <nav className={styles.modeRail} role="tablist" aria-label="Choisir le mode de jeu">
        {MODE_TABS.map((tab) => {
          const active = mode === tab.id;
          const needsAccount = isGuest && tab.id !== "bot";
          return (
            <button
              key={tab.id}
              data-nj-skin="none"
              type="button"
              role="tab"
              aria-selected={active}
              className={`${styles.modeTab} ${styles[`modeTab_${tab.tone}`]}${active ? ` ${styles.modeTabActive}` : ""}`}
              onClick={() => handleModeSwitch(tab.id)}
            >
              <span className={styles.modeTabIcon} aria-hidden="true">
                <NjamboIcon name={tab.icon} tone={tab.tone} size={20} />
              </span>
              <span className={styles.modeTabCopy}>
                <strong>{tab.shortLabel}</strong>
                <small>{needsAccount ? "Compte requis" : tab.chip}</small>
              </span>
              {needsAccount && <span className={styles.lockDot} aria-hidden="true">🔒</span>}
            </button>
          );
        })}
      </nav>

      {/* ═══ 3. ARÈNE UNIFIÉE : TABLE 3D VIVANTE + CONSOLE D'ÉLÉMENTS ═══ */}
      <div className={styles.arenaGrid}>
        {/* ─── TABLE DE JEU 3D VIVANTE (4 POINTS CARDINAUX + CARTES POSÉES) ─── */}
        <section className={`${styles.tableStage} ${stageAuraClass}`} aria-label="Aperçu vivant de la table Njambo">
          <div className={styles.stageGlow} aria-hidden="true" />
          <div className={styles.stageWatermark} aria-hidden="true">♠ ♥ ♦ ♣</div>

          {/* En-tête discret de table */}
          <div className={styles.stageTopMeta}>
            <span className={styles.stagePill}>
              <span className={styles.liveDot} aria-hidden="true" />
              {mode === "bot"
                ? `Table ${seats} joueurs · ${activeDiff.label}`
                : mode === "online"
                ? `Classé · ${seats} joueurs · ${publicRooms.length} salle${publicRooms.length > 1 ? "s" : ""}`
                : `Table privée · ${seats} places`}
            </span>
            <span className={styles.ngataSeal}>NGATA ×2</span>
          </div>

          {/* Zone centrale table + sièges en boussole */}
          <div className={`${styles.compassArena} ${styles[`compass_${seats}`]}`}>
            {/* Sièges adversaires dynamiques (North, NW/NE, West/North/East) */}
            {seatSlots.map((slot, idx) => {
              const seatPosClass = styles[`seat_${slot}`];

              if (mode === "bot") {
                const bot = BOTS[idx] ?? BOTS[0];
                return (
                  <div
                    key={`bot-${slot}-${bot.name}`}
                    className={`${styles.seatAnchor} ${seatPosClass}`}
                    style={{ "--seat-i": idx } as CSSProperties}
                  >
                    <div className={styles.opponentCardFan} aria-hidden="true">
                      <span className={styles.miniBackCard} />
                      <span className={styles.miniBackCard} />
                      <span className={styles.miniBackCard} />
                    </div>
                    <div className={styles.seatPortrait}>
                      <span className={styles.seatRing}>
                        <AvatarIllustration seed={bot.emoji} size={40} />
                      </span>
                      <span className={styles.seatBadge}>{activeDiff.stars}</span>
                    </div>
                    <span className={styles.seatTag}>{bot.name}</span>
                  </div>
                );
              }

              if (mode === "online") {
                const seed = ONLINE_SEAT_SEEDS[idx % ONLINE_SEAT_SEEDS.length];
                return (
                  <div
                    key={`online-${slot}`}
                    className={`${styles.seatAnchor} ${seatPosClass}`}
                    style={{ "--seat-i": idx } as CSSProperties}
                  >
                    <div className={styles.opponentCardFan} aria-hidden="true">
                      <span className={styles.miniBackCard} />
                      <span className={styles.miniBackCard} />
                      <span className={styles.miniBackCard} />
                    </div>
                    <div className={`${styles.seatPortrait} ${styles.seatRadar}`}>
                      <span className={styles.radarPulse} aria-hidden="true" />
                      <span className={styles.seatRing}>
                        <AvatarIllustration seed={seed} size={40} online />
                      </span>
                      <span className={styles.seatBadge}>#{idx + 1}</span>
                    </div>
                    <span className={styles.seatTag}>Adversaire</span>
                  </div>
                );
              }

              /* Mode Entre amis : siège invité réel ou bouton + Inviter cliquable */
              const friend = invitedProfiles[idx];
              return (
                <button
                  key={`friend-${slot}`}
                  data-nj-skin="none"
                  type="button"
                  className={`${styles.seatAnchor} ${styles.seatBtn} ${seatPosClass}`}
                  style={{ "--seat-i": idx } as CSSProperties}
                  onClick={() => (isGuest ? setAuthModalOpen(true) : setInviteModalOpen(true))}
                  aria-label={friend ? `Invité ${friend.name}, modifier les invités` : "Inviter un ami à cette place"}
                >
                  <div className={styles.opponentCardFan} aria-hidden="true">
                    <span className={styles.miniBackCard} />
                    <span className={styles.miniBackCard} />
                    <span className={styles.miniBackCard} />
                  </div>
                  {friend ? (
                    <>
                      <div className={styles.seatPortrait}>
                        <span className={styles.seatRing}>
                          <AvatarIllustration seed={friend.emoji} size={40} online={friend.online} />
                        </span>
                        <span className={styles.seatBadge}>✓</span>
                      </div>
                      <span className={styles.seatTag}>{friend.name}</span>
                    </>
                  ) : (
                    <>
                      <div className={styles.seatInviteOrb}>
                        <span>+</span>
                      </div>
                      <span className={styles.seatTag}>Inviter</span>
                    </>
                  )}
                </button>
              );
            })}

            {/* Tapis ovale 3D acajou & émeraude avec cartes distribuées + sabot + pot */}
            <div className={styles.tableOvalOuter}>
              <span className={`${styles.rivet} ${styles.rivetTL}`} aria-hidden="true" />
              <span className={`${styles.rivet} ${styles.rivetTR}`} aria-hidden="true" />
              <span className={`${styles.rivet} ${styles.rivetBL}`} aria-hidden="true" />
              <span className={`${styles.rivet} ${styles.rivetBR}`} aria-hidden="true" />

              <div className={styles.tableOvalFelt}>
                <span className={styles.feltStitch} aria-hidden="true" />

                {/* Sabot / Pioche 3D + jeton Dealer à gauche */}
                <div className={styles.deckStack} aria-hidden="true">
                  <span className={styles.deckLayer3} />
                  <span className={styles.deckLayer2} />
                  <span className={styles.deckLayer1} />
                  <span className={styles.dealerButton}>D</span>
                </div>

                {/* Éventail central de 4 vraies cartes Njambo posées en pli sur le tapis */}
                <div className={styles.centerTrickFan} aria-hidden="true">
                  <div className={`${styles.trickCardSlot} ${styles.trickFarLeft}`}>
                    <PlayCard card={trickCards[0]} w={42} rot={-20} />
                  </div>
                  <div className={`${styles.trickCardSlot} ${styles.trickMidLeft}`}>
                    <PlayCard card={trickCards[1]} w={46} rot={-6} lift={-6} glow />
                  </div>
                  <div className={`${styles.trickCardSlot} ${styles.trickMidRight}`}>
                    <PlayCard card={trickCards[2]} w={44} rot={8} lift={-2} />
                  </div>
                  <div className={`${styles.trickCardSlot} ${styles.trickFarRight}`}>
                    <PlayCard card={trickCards[3]} w={42} rot={22} lift={2} />
                  </div>
                </div>

                {/* Médaillon central du Pot (pièces qui croissent avec la mise) */}
                <div className={styles.potPlaque}>
                  <span className={styles.potCoins} aria-hidden="true">
                    {Array.from({ length: stakeArt.count }, (_, idx) => (
                      <Image key={idx} src={stakeArt.src} alt="" width={28} height={28} />
                    ))}
                  </span>
                  <div className={styles.potText}>
                    <small>{botTraining ? "Mode invité" : "Pot en jeu"}</small>
                    <strong>{botTraining ? "Entraînement" : `${pot.toLocaleString("fr-FR")} Nkap`}</strong>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Bord Sud : Ton siège + ta mini-main de cartes + tes 3 cartes Pouvoir en éventail */}
          <div className={styles.southBar}>
            <div className={styles.yourSeatCluster}>
              <div className={styles.yourMiniHand} aria-hidden="true">
                {PLAYER_HAND_PREVIEW.map((card, i) => (
                  <span key={card.id} className={styles[`handCard_${i}`]}>
                    <PlayCard card={card} w={30} />
                  </span>
                ))}
              </div>
              <div className={styles.yourSeatPlaque}>
                <span className={styles.yourAvatarRing}>
                  <AvatarIllustration seed={playerEmoji} size={36} online />
                </span>
                <div className={styles.yourSeatMeta}>
                  <strong>{playerName}</strong>
                  <small>
                    {botTraining
                      ? "Gratuit · Sans énergie"
                      : `${requiredEnergy} énergie / table`}
                  </small>
                </div>
              </div>
            </div>

            {/* 3 cartes Pouvoir équipées façon éventail collectible cliquable */}
            <button
              data-nj-skin="none"
              type="button"
              className={styles.powerHandDock}
              onClick={() => navigateTo("power_collection")}
              aria-label={`Cartes pouvoir équipées : ${equippedPowers.length} sur ${powerLimit}. Ouvrir mon deck`}
            >
              <div className={styles.powerMiniFan} aria-hidden="true">
                {Array.from({ length: Math.min(3, powerLimit) }, (_, slotIdx) => {
                  const id = equippedPowers[slotIdx];
                  const def = id ? POWER_CARDS_BY_ID[id] : null;
                  const pal = def ? CATEGORY_MOTIF_PALETTE[def.category] : null;
                  return (
                    <span
                      key={slotIdx}
                      className={`${styles.powerMiniCard} ${styles[`powerSlot_${slotIdx}`]}${def ? ` ${styles.powerFilled}` : ""}`}
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
                          <span className={styles.powerMiniArtMask}>
                            <Image src={def.art} alt="" fill sizes="46px" className={styles.powerMiniImg} />
                          </span>
                          <PowerCardMotif
                            category={def.category}
                            rarity={def.rarity}
                            className={styles.powerMiniMotif}
                          />
                        </>
                      ) : (
                        <span className={styles.powerPlus}>+</span>
                      )}
                    </span>
                  );
                })}
              </div>
              <div className={styles.powerDockCopy}>
                <small>Deck</small>
                <strong>{equippedPowers.length}/{powerLimit}</strong>
              </div>
            </button>
          </div>
        </section>

        {/* ─── CONSOLE D'ÉLÉMENTS TACTILES (IDENTIQUE SUR LES 3 MODES, SEUL LE BLOC MODE CHANGE) ─── */}
        <section className={styles.consolePane} aria-label="Configuration de la partie">
          {/* ÉLÉMENT 1 : FORMAT DE TABLE (schémas de table ovale miniatures) */}
          <div className={styles.elementBlock}>
            <div className={styles.elementHead}>
              <span className={styles.elementTitle}>Format de table</span>
              <span className={styles.elementHint}>{seats} places autour du tapis</span>
            </div>

            <div className={styles.tableDiagramRow} role="radiogroup" aria-label="Nombre de joueurs">
              {TABLE_SIZES.map((opt) => {
                const active = seats === opt.seats;
                return (
                  <button
                    key={opt.seats}
                    data-nj-skin="none"
                    type="button"
                    role="radio"
                    aria-checked={active}
                    className={`${styles.tableShapeBtn}${active ? ` ${styles.tableShapeActive}` : ""}`}
                    onClick={() => handleSeatsChange(opt.seats)}
                  >
                    <span className={`${styles.miniOvalIcon} ${styles[`dots_${opt.seats}`]}`} aria-hidden="true">
                      <span className={styles.dotS} />
                      {opt.seats === 2 && <span className={styles.dotN} />}
                      {opt.seats === 3 && (
                        <>
                          <span className={styles.dotNW} />
                          <span className={styles.dotNE} />
                        </>
                      )}
                      {opt.seats === 4 && (
                        <>
                          <span className={styles.dotN} />
                          <span className={styles.dotW} />
                          <span className={styles.dotE} />
                        </>
                      )}
                    </span>
                    <span className={styles.tableShapeText}>
                      <strong>{opt.label}</strong>
                      <small>{opt.tag}</small>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ÉLÉMENT 2 : JETONS DE MISE CIRCULAIRES (POKER CHIPS) */}
          <div className={styles.elementBlock}>
            <div className={styles.elementHead}>
              <span className={styles.elementTitle}>
                {botTraining ? "Mode d’entraînement" : "Jetons de mise"}
              </span>
              {/* Règles de la partie en rappel discret : le pot est déjà affiché sur le tapis */}
              <span
                className={`${styles.elementHint} ${styles.ruleHint}`}
                title={`${matchCount} manche${matchCount > 1 ? "s" : ""} · ${cfg.turnSeconds} s par tour${botTraining ? "" : " · mise pour toute la table"}`}
              >
                {matchCount} manche{matchCount > 1 ? "s" : ""} · {cfg.turnSeconds} s/tour
              </span>
            </div>

            {botTraining ? (
              <div className={styles.guestFreePlaque} role="status">
                <span className={styles.guestFreeIcon}>
                  <NjamboIcon name="sparkle" tone="gold" size={20} />
                </span>
                <div className={styles.guestFreeCopy}>
                  <strong>Partie libre sans mise</strong>
                  <small>Aucune énergie ni Nkap consommés en mode invité.</small>
                </div>
                <button
                  data-nj-skin="none"
                  type="button"
                  className={styles.inlineSignInBtn}
                  onClick={() => setAuthModalOpen(true)}
                >
                  Connexion
                </button>
              </div>
            ) : (
              <div className={styles.pokerChipTray} role="radiogroup" aria-label="Mise par table">
                {cfg.stakes.map((stake, idx) => {
                  const active = mise === stake;
                  const short = !isGuest && nkap < stake;
                  const chipArt = STAKE_ART[Math.min(idx, STAKE_ART.length - 1)];
                  const tierClass = idx === 0 ? styles.coinTier0 : idx === 1 ? styles.coinTier1 : styles.coinTier2;
                  return (
                    <button
                      key={stake}
                      data-nj-skin="none"
                      type="button"
                      role="radio"
                      aria-checked={active}
                      aria-label={`Mise de ${NKAP(stake)}${short ? ", solde insuffisant" : ""}`}
                      className={`${styles.casinoChip} ${tierClass}${active ? ` ${styles.casinoChipActive}` : ""}${short ? ` ${styles.casinoChipShort}` : ""}`}
                      onClick={() => setMise(stake)}
                    >
                      <span className={styles.chipInnerRing} aria-hidden="true" />
                      <span className={styles.chipCoinArt} aria-hidden="true">
                        {Array.from({ length: chipArt.count }, (_, c) => (
                          <Image key={c} src={chipArt.src} alt="" width={22} height={22} />
                        ))}
                      </span>
                      <strong className={styles.chipValue}>{stake.toLocaleString("fr-FR")}</strong>
                      <small className={styles.chipUnit}>Nkap</small>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* ÉLÉMENT 3 : ZONE SPÉCIFIQUE AU MODE (SEULE ZONE QUI CHANGE !) */}
          <div className={styles.modeDynamicSlot}>
            {/* ── OPTION MODE SOLO IA : BLASONS DE DIFFICULTÉ ── */}
            {mode === "bot" && (
              <div className={styles.elementBlock}>
                <div className={styles.elementHead}>
                  <span className={styles.elementTitle}>Niveau des adversaires</span>
                  <span className={styles.elementHint}>{activeDiff.stars} {activeDiff.label}</span>
                </div>
                <div className={styles.crestRow} role="radiogroup" aria-label="Difficulté des IA">
                  {DIFFICULTIES.map((entry) => {
                    const active = difficulty === entry.key;
                    return (
                      <button
                        key={entry.key}
                        data-nj-skin="none"
                        type="button"
                        role="radio"
                        aria-checked={active}
                        className={`${styles.diffCrest} ${styles[entry.crestClass]}${active ? ` ${styles.diffCrestActive}` : ""}`}
                        onClick={() => setDifficulty(entry.key)}
                      >
                        <span className={styles.crestStars}>{entry.stars}</span>
                        <strong>{entry.label}</strong>
                        <small>{entry.sub}</small>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── OPTION MODE EN LIGNE : SALLES PUBLIQUES EN DIRECT ── */}
            {mode === "online" && (
              <div className={styles.elementBlock}>
                <div className={styles.elementHead}>
                  <span className={styles.elementTitle}>Salles publiques</span>
                  <div className={styles.onlineHeadRight}>
                    <span className={styles.countBadge}>{publicRooms.length}</span>
                    {!isGuest && (
                      <button
                        data-nj-skin="none"
                        type="button"
                        className={styles.refreshMiniBtn}
                        onClick={() => searchRooms()}
                        aria-label="Actualiser les salles publiques"
                      >
                        ↻
                      </button>
                    )}
                  </div>
                </div>

                {isGuest ? (
                  <div className={styles.guestLockCard}>
                    <span className={styles.guestLockIcon}>
                      <NjamboIcon name="online" tone="teal" size={22} />
                    </span>
                    <div className={styles.guestLockCopy}>
                      <strong>Connecte-toi pour le Classé</strong>
                      <small>Affronte le quartier, gagne des Nkap et grimpe au classement.</small>
                    </div>
                  </div>
                ) : publicRooms.length === 0 ? (
                  <div className={styles.emptyRoomsPlaque}>
                    <NjamboIcon name="online" tone="teal" size={18} />
                    <span>
                      {roomsSearched
                        ? "Aucune table ouverte pour l’instant — crée la première !"
                        : "Recherche des tables en cours…"}
                    </span>
                  </div>
                ) : (
                  <div className={styles.roomsTicketStrip} role="group" aria-label="Salles publiques disponibles">
                    {publicRooms.map((room) => (
                      <button
                        key={room.id}
                        data-nj-skin="none"
                        type="button"
                        disabled={busy || !canLaunchOnline || room.stake > nkap}
                        className={styles.roomTicketBtn}
                        onClick={() => { void handleOnlineJoinRoom(room.id); }}
                      >
                        <span className={styles.ticketCode}>{room.code}</span>
                        <span className={styles.ticketMeta}>
                          <strong>{room.stake}</strong> · {room.players.length}/{room.maxPlayers}J
                        </span>
                        <span className={styles.ticketGo}>Rejoindre →</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── OPTION MODE ENTRE AMIS : TICKET CODE + INVITER ── */}
            {mode === "friends" && (
              <div className={styles.elementBlock}>
                <div className={styles.elementHead}>
                  <span className={styles.elementTitle}>Code &amp; Invités</span>
                  {!isGuest && (
                    <button
                      data-nj-skin="none"
                      type="button"
                      className={styles.inviteOpenBtn}
                      onClick={() => setInviteModalOpen(true)}
                    >
                      + Inviter ({selectedFriends.size}/{opponentCount})
                    </button>
                  )}
                </div>

                {isGuest ? (
                  <div className={`${styles.guestLockCard} ${styles.guestLockPink}`}>
                    <span className={styles.guestLockIcon}>
                      <NjamboIcon name="friends" tone="pink" size={22} />
                    </span>
                    <div className={styles.guestLockCopy}>
                      <strong>Connecte-toi pour inviter tes amis</strong>
                      <small>Crée une salle privée ou rejoins une table avec un code secret.</small>
                    </div>
                  </div>
                ) : (
                  <form
                    className={styles.vipTicketForm}
                    onSubmit={(e) => {
                      e.preventDefault();
                      void handleFriendsJoinCode();
                    }}
                  >
                    <span className={styles.vipTicketIcon} aria-hidden="true">
                      <NjamboIcon name="code" tone="gold" size={18} />
                    </span>
                    <input
                      value={joinCode}
                      onChange={(e) => {
                        setJoinCode(e.target.value.toUpperCase());
                        clearError();
                      }}
                      placeholder="CODE (EX. NJAM7K2)"
                      maxLength={7}
                      autoComplete="off"
                      aria-label="Rejoindre avec un code de salle"
                      className={styles.vipCodeInput}
                    />
                    <button
                      data-nj-skin="none"
                      type="submit"
                      disabled={busy || joinCode.trim().length < 4}
                      className={styles.vipJoinStamp}
                    >
                      {busy ? "…" : "Entrer"}
                    </button>
                  </form>
                )}
              </div>
            )}
          </div>

          {/* ALERTES ÉVENTUELLES */}
          {(roomError || (!isGuest && (!enoughNkap || !enoughEnergy))) && (
            <div className={styles.alertRibbon} role="alert">
              {roomError
                ? roomError
                : !enoughNkap
                ? "Nkap insuffisants pour cette mise."
                : `Il faut ${requiredEnergy} énergie pour lancer cette manche.`}
            </div>
          )}

          {/* ÉLÉMENT 4 : BOUTON(S) 3D DE LANCEMENT */}
          <div className={styles.launchZone}>
            {mode === "bot" && (
              <button
                data-nj-skin="none"
                type="button"
                disabled={!canLaunchBot}
                className={`${styles.heroCta} ${styles.ctaGold}`}
                onClick={handleBotLaunch}
              >
                <span className={styles.ctaSheen} aria-hidden="true" />
                <span className={styles.ctaIcon} aria-hidden="true">
                  <NjamboIcon name="play" tone="gold" size={24} />
                </span>
                <span className={styles.ctaCopy}>
                  <strong>À LA TABLE</strong>
                  <small>
                    {botTraining
                      ? `Entraînement · ${opponentCount} IA (${activeDiff.label})`
                      : `Miser ${mise.toLocaleString("fr-FR")} Nkap · ${opponentCount} IA`}
                  </small>
                </span>
                <span className={styles.ctaArrow} aria-hidden="true">→</span>
              </button>
            )}

            {mode === "online" && (
              isGuest ? (
                <button
                  data-nj-skin="none"
                  type="button"
                  className={`${styles.heroCta} ${styles.ctaTeal}`}
                  onClick={() => setAuthModalOpen(true)}
                >
                  <span className={styles.ctaSheen} aria-hidden="true" />
                  <span className={styles.ctaIcon} aria-hidden="true">
                    <NjamboIcon name="profile" tone="teal" size={24} />
                  </span>
                  <span className={styles.ctaCopy}>
                    <strong>SE CONNECTER</strong>
                    <small>Débloquer les tables classées en ligne</small>
                  </span>
                  <span className={styles.ctaArrow} aria-hidden="true">→</span>
                </button>
              ) : (
                <div className={styles.dualCtaRow} aria-busy={busy}>
                  <button
                    data-nj-skin="none"
                    type="button"
                    disabled={!canLaunchOnline}
                    className={`${styles.heroCta} ${styles.ctaTeal}`}
                    onClick={() => { void handleOnlineCreate(); }}
                  >
                    <span className={styles.ctaSheen} aria-hidden="true" />
                    <span className={styles.ctaCopy}>
                      <strong>{busy ? "…" : "CRÉER"}</strong>
                      <small>{mise} Nkap · {seats}J</small>
                    </span>
                  </button>
                  <button
                    data-nj-skin="none"
                    type="button"
                    disabled={!canLaunchOnline}
                    className={`${styles.heroCta} ${styles.ctaGold}`}
                    onClick={() => { void handleOnlineAutoMatch(); }}
                  >
                    <span className={styles.ctaCopy}>
                      <strong>{busy ? "…" : "TROUVER"}</strong>
                      <small>Partie rapide</small>
                    </span>
                  </button>
                </div>
              )
            )}

            {mode === "friends" && (
              isGuest ? (
                <button
                  data-nj-skin="none"
                  type="button"
                  className={`${styles.heroCta} ${styles.ctaPink}`}
                  onClick={() => setAuthModalOpen(true)}
                >
                  <span className={styles.ctaSheen} aria-hidden="true" />
                  <span className={styles.ctaIcon} aria-hidden="true">
                    <NjamboIcon name="friends" tone="pink" size={24} />
                  </span>
                  <span className={styles.ctaCopy}>
                    <strong>SE CONNECTER</strong>
                    <small>Débloquer les tables privées entre amis</small>
                  </span>
                  <span className={styles.ctaArrow} aria-hidden="true">→</span>
                </button>
              ) : (
                <button
                  data-nj-skin="none"
                  type="button"
                  disabled={!canLaunchFriends}
                  className={`${styles.heroCta} ${styles.ctaPink}`}
                  onClick={() => { void handleFriendsCreate(); }}
                >
                  <span className={styles.ctaSheen} aria-hidden="true" />
                  <span className={styles.ctaIcon} aria-hidden="true">
                    <NjamboIcon name="friends" tone="pink" size={24} />
                  </span>
                  <span className={styles.ctaCopy}>
                    <strong>{busy ? "OUVERTURE…" : "OUVRIR LA TABLE"}</strong>
                    <small>
                      {selectedFriends.size > 0
                        ? `${selectedFriends.size} ami${selectedFriends.size > 1 ? "s" : ""} sélectionné${selectedFriends.size > 1 ? "s" : ""} · ${mise} Nkap`
                        : `Créer un code privé · ${seats} places`}
                    </small>
                  </span>
                  <span className={styles.ctaArrow} aria-hidden="true">→</span>
                </button>
              )
            )}
          </div>
        </section>
      </div>

      {/* ═══ MODALE CONNEXION (pour débloquer En ligne / Amis sans quitter la table) ═══ */}
      <GameModal
        open={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        kicker="Compte Njambo"
        title={mode === "online" ? "Rejoindre le Classé" : mode === "friends" ? "Table privée entre amis" : "Sauvegarder ton compte"}
        tone={mode === "friends" ? "pink" : mode === "online" ? "teal" : "gold"}
      >
        <AuthGate tone={mode === "friends" ? "pink" : mode === "online" ? "teal" : "gold"} accountBar="none">
          <div className={styles.authDoneNote}>Compte connecté ! Tu peux lancer la table.</div>
        </AuthGate>
      </GameModal>

      {/* ═══ MODALE SÉLECTION D'AMIS À INVITER ═══ */}
      <GameModal
        open={inviteModalOpen}
        onClose={() => setInviteModalOpen(false)}
        kicker={`Table privée · ${selectedFriends.size}/${opponentCount} places`}
        title="Inviter autour de la table"
        tone="pink"
        footer={
          <button
            data-nj-skin="none"
            type="button"
            className={styles.modalConfirmBtn}
            onClick={() => setInviteModalOpen(false)}
          >
            Valider ({selectedFriends.size} invité{selectedFriends.size > 1 ? "s" : ""})
          </button>
        }
      >
        <div className={styles.inviteList}>
          {loadingPlayers && <div className={styles.inviteEmpty}>Chargement des joueurs en ligne…</div>}
          {!loadingPlayers && onlinePlayers.length === 0 && (
            <div className={styles.inviteEmpty}>
              Aucun autre joueur connecté pour le moment. Tu peux ouvrir la table et partager son code secret !
            </div>
          )}
          {onlinePlayers.map((player) => {
            const checked = selectedFriends.has(player.uid);
            return (
              <button
                key={player.uid}
                data-nj-skin="none"
                type="button"
                disabled={!player.online}
                className={`${styles.inviteRow}${checked ? ` ${styles.inviteRowSelected}` : ""}`}
                onClick={() => toggleFriend(player.uid, player.online)}
              >
                <AvatarIllustration seed={player.emoji} size={38} online={player.online} />
                <div className={styles.inviteCopy}>
                  <strong>{player.name}</strong>
                  <small>{player.online ? "En ligne" : "Hors ligne"}</small>
                </div>
                <span className={`${styles.inviteCheck}${checked ? ` ${styles.inviteCheckOn}` : ""}`}>
                  {checked ? "✓" : "+"}
                </span>
              </button>
            );
          })}
        </div>
      </GameModal>
    </GameShell>
  );
}
