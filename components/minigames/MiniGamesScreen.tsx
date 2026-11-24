"use client";

/* ═══════════════ Le coin des jeux ═══════════════
   Grille des mini-jeux (+ la roue des retrouvailles). Toucher une carte ouvre
   le jeu sur le même écran ; « ← Jeux » revient à la grille. */

import Image from "@/components/ui/GameImage";
import { useState, type ReactNode } from "react";
import { AuthGate } from "@/components/ui/AuthGate";
import { GameModal } from "@/components/ui/GameModal";
import { GameShell } from "@/components/ui/GameShell";
import { useGame } from "@/contexts/GameContext";
import { MINI_GAMES, MINI_GAMES_BY_ID, type MiniGameId, type Reward } from "@/domain";
import { requestShopTab } from "@/lib/shopDeepLink";
import { CaurisGame } from "./games/CaurisGame";
import { CoinRainGame } from "./games/CoinRainGame";
import { DiceGame } from "./games/DiceGame";
import { HiLoGame } from "./games/HiLoGame";
import { MemoryGame } from "./games/MemoryGame";
import { PickGame } from "./games/PickGame";
import { ScratchGame } from "./games/ScratchGame";
import { OddsModal, RewardModal } from "./MiniGameKit";
import { costIcon, costLabel, useMiniGames, type MiniGameProps } from "./useMiniGames";
import styles from "./MiniGames.module.css";
import { sysAsset } from "@/lib/assetPack";

const GAME_ART: Record<MiniGameId, ReactNode> = {
  scratch: <Image src={sysAsset("/assets/njambo/tickets/ticket-bronze-128.webp")} alt="" width={56} height={56} />,
  cauris: <Image src={sysAsset("/assets/njambo/economy/cauri-128.webp")} alt="" width={56} height={56} />,
  dice: (
    <span className={styles.artDice} aria-hidden="true">
      <i /><i /><i /><i /><i />
    </span>
  ),
  hilo: <span className={styles.artHiLo} aria-hidden="true"><b>7</b><span>▲▼</span></span>,
  pick: <Image src={sysAsset("/assets/njambo/books/card-back-128.webp")} alt="" width={44} height={60} />,
  chests: <Image src={sysAsset("/assets/njambo/economy/cauris-pouch-128.webp")} alt="" width={56} height={56} />,
  memory: <Image src={sysAsset("/assets/njambo/economy/energy-flask-128.webp")} alt="" width={56} height={56} />,
  coinrain: <Image src={sysAsset("/assets/njambo/economy/nkap-128.webp")} alt="" width={56} height={56} />,
};

function GameCard({ id, onOpen }: { id: MiniGameId; onOpen: () => void }) {
  const mg = useMiniGames();
  const { game, free, left } = mg.status(id);
  const icon = costIcon(game.cost);
  const badge = mg.guest
    ? null
    : left < 1
      ? <span className={`${styles.cardBadge} ${styles.badgeDone}`}>Demain</span>
      : free > 0
        ? <span className={`${styles.cardBadge} ${styles.badgeFree}`}>{free > 1 ? `${free} gratuits` : "1 gratuit"}</span>
        : null;
  return (
    <button data-nj-skin="none" type="button" className={`${styles.gameCard} ${styles[`tone_${game.tone}`]}`} onClick={onOpen}>
      {badge}
      <span className={styles.cardArt}>{GAME_ART[id]}</span>
      <span className={styles.cardCopy}>
        <strong>{game.title}</strong>
        <small>{game.tagline}</small>
      </span>
      <span className={styles.cardCost}>
        {icon && <Image src={icon} alt="" width={14} height={14} />}
        {costLabel(game.cost)}
      </span>
    </button>
  );
}

export function MiniGamesScreen() {
  const { goBack, backLabelFor, navigateTo } = useGame();
  const mg = useMiniGames();
  const [openId, setOpenId] = useState<MiniGameId | null>(null);
  const [reward, setReward] = useState<Reward | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [oddsOpen, setOddsOpen] = useState(false);
  const [round, setRound] = useState(0); // remonte le jeu après un gain (état neuf)

  const spins = mg.economy?.daily.availableSpins ?? 0;
  const props: MiniGameProps = {
    mg,
    onReward: setReward,
    onError: setError,
    onAuth: () => setAuthOpen(true),
    onOdds: () => setOddsOpen(true),
  };

  const renderGame = (id: MiniGameId) => {
    switch (id) {
      case "scratch": return <ScratchGame {...props} />;
      case "cauris": return <CaurisGame {...props} />;
      case "dice": return <DiceGame {...props} />;
      case "hilo": return <HiLoGame {...props} />;
      case "pick": return <PickGame {...props} variant="pick" />;
      case "chests": return <PickGame {...props} variant="chests" />;
      case "memory": return <MemoryGame {...props} />;
      case "coinrain": return <CoinRainGame {...props} />;
    }
  };

  const openGame = openId ? MINI_GAMES_BY_ID[openId] : null;

  return (
    <GameShell dock={false} scroll={false} contentClassName={styles.shell}>
      <header className={styles.hud}>
        {openGame ? (
          <button data-nj-skin="none" type="button" className="nj-sr-back" onClick={() => { setOpenId(null); setError(null); }}>
            <span className="nj-sr-back-arrow" aria-hidden="true">←</span>
            <span>Jeux</span>
          </button>
        ) : (
          <button data-nj-skin="none" type="button" className="nj-sr-back" onClick={() => goBack("menu")}>
            <span className="nj-sr-back-arrow" aria-hidden="true">←</span>
            <span>{backLabelFor("menu")}</span>
          </button>
        )}
        <div className={styles.hudCenter}>
          <span className={styles.hudKicker}>LE COIN DES JEUX</span>
          <h1 className={styles.hudTitle}>{openGame ? openGame.title : "Mini-jeux"}</h1>
        </div>
        <div className={styles.wallet} aria-label="Tes ressources">
          <span><Image src={sysAsset("/assets/njambo/economy/nkap-stack-64.webp")} alt="" width={16} height={16} />{mg.guest ? "–" : (mg.economy?.nkap ?? 0).toLocaleString("fr-FR")}</span>
          <span><Image src={sysAsset("/assets/njambo/economy/cauris-pouch-64.webp")} alt="" width={16} height={16} />{mg.guest ? "–" : mg.economy?.cauris ?? 0}</span>
          <span><Image src={sysAsset("/assets/njambo/tickets/ticket-bronze-64.webp")} alt="" width={16} height={16} />{mg.guest ? "–" : Number(mg.inventory.tickets?.bronze ?? 0)}</span>
        </div>
      </header>

      {error && (
        <div className={styles.errorBar} role="alert">
          <span>{error}</span>
          <button data-nj-skin="none" type="button" onClick={() => setError(null)} aria-label="Fermer">×</button>
        </div>
      )}

      {openGame ? (
        <div key={`${openGame.id}-${round}`} className={styles.gameView}>{renderGame(openGame.id)}</div>
      ) : (
        <div className={styles.grid}>
          <button
            data-nj-skin="none"
            type="button"
            className={`${styles.gameCard} ${styles.tone_pink} ${styles.wheelCard}`}
            onClick={() => { requestShopTab("wheel"); navigateTo("shop"); }}
          >
            {!mg.guest && spins > 0 && <span className={`${styles.cardBadge} ${styles.badgeFree}`}>{spins} lancer{spins > 1 ? "s" : ""}</span>}
            <span className={styles.cardArt}><Image src={sysAsset("/assets/njambo/economy/loyalty-wheel-128.webp")} alt="" width={56} height={56} /></span>
            <span className={styles.cardCopy}>
              <strong>Roue des retrouvailles</strong>
              <small>7 connexions = 1 lancer</small>
            </span>
            <span className={styles.cardCost}>Fidélité</span>
          </button>
          {MINI_GAMES.map((game) => (
            <GameCard key={game.id} id={game.id} onOpen={() => { setOpenId(game.id); setError(null); }} />
          ))}
        </div>
      )}

      {openGame && (
        <>
          <RewardModal game={openGame} reward={reward} onClose={() => { setReward(null); setRound((r) => r + 1); }} />
          <OddsModal game={openGame} open={oddsOpen} onClose={() => setOddsOpen(false)} />
        </>
      )}

      <GameModal open={authOpen} onClose={() => setAuthOpen(false)} kicker="Compte Njambo" title="Connecte-toi pour jouer" tone="gold">
        <AuthGate tone="gold" accountBar="none">
          <p className={styles.oddsNote}>Compte connecté ! Tu peux lancer ta partie.</p>
        </AuthGate>
      </GameModal>
    </GameShell>
  );
}
