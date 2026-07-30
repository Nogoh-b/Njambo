"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useGame } from "@/contexts/GameContext";
import { useLobby } from "@/contexts/LobbyContext";
import { useAuth } from "@/hooks/useAuth";
import { useEconomy } from "@/contexts/EconomyContext";
import { NKAP } from "@/data/mock";
import { Btn } from "@/components/ui/Btn";
import { ChoiceButtonGroup } from "@/components/ui/ChoiceButtonGroup";
import { NkapAmount } from "@/components/ui/NkapAmount";
import { Chip } from "@/components/ui/Chip";
import { AvatarIllustration, NjamboIcon } from "@/components/ui/Art";
import { AuthGate } from "@/components/ui/AuthGate";
import { HubReveal } from "@/components/ui/HubReveal";
import {
  PreGameFooter,
  PreGameLayout,
  PreGameWorkspace,
} from "@/components/ui/PreGameLayout";
import { Surface } from "@/components/ui/Shell";
import { EquippedPowersBar } from "@/components/power/EquippedPowersBar";
import styles from "./PreGameScreens.module.css";

/* Escalade visuelle des mises, lue en masse : une pièce, une pile, deux
   piles. Rien de nouveau côté assets — c'est la famille Nkap déjà utilisée
   par le portefeuille et l'arène de règlement. */
const STAKE_TIERS = [
  { src: "/assets/njambo/economy/nkap-128.webp", count: 1 },
  { src: "/assets/njambo/economy/nkap-stack-128.webp", count: 1 },
  { src: "/assets/njambo/economy/nkap-stack-128.webp", count: 2 },
] as const;

const SEAT_SEEDS = ["avatar-douala", "avatar-bamoun", "avatar-beti", "avatar-sawa"];

export function OnlineSetupScreen() {
  const { navigateTo, cfg } = useGame();
  const { user } = useAuth();
  const { economy } = useEconomy();
  const { createRoom, joinRoomById, findAvailableRoom, publicRooms, searchRooms, roomError, clearError } = useLobby();
  const [selectedStake, setSelectedStake] = useState(cfg.stakes[1]);
  const [maxPlayers, setMaxPlayers] = useState(2);
  const [busy, setBusy] = useState(false);
  /* LobbyContext n'expose pas d'état de chargement : sans ce drapeau, la
     bande afficherait « Aucune salle » pendant la première frame, juste
     avant que les cartes n'arrivent. */
  const [searched, setSearched] = useState(false);
  const nkap = economy?.nkap ?? 0;
  const canPayEnergy = economy?.energy.unlimited || (economy?.energy.available ?? 0) >= 10;
  const canPayStake = nkap >= selectedStake;

  useEffect(() => {
    searchRooms();
    const timer = setTimeout(() => setSearched(true), 900);
    return () => clearTimeout(timer);
  }, [searchRooms]);

  const canStart = Boolean(user && !user.isAnonymous && canPayEnergy && canPayStake);

  const goBack = () => navigateTo("menu");
  const goToLobby = () => navigateTo("lobby");

  const handleCreate = async () => {
    try {
      setBusy(true);
      clearError();
      await createRoom(selectedStake, maxPlayers);
      goToLobby();
    } catch {
      // Error handled by useLobby
    } finally {
      setBusy(false);
    }
  };

  const handleJoinRoom = async (roomId: string) => {
    setBusy(true);
    try {
      clearError();
      const joined = await joinRoomById(roomId);
      if (joined) goToLobby();
    } catch {
      // Error handled by useLobby
    } finally {
      setBusy(false);
    }
  };

  const handleAutoMatch = async () => {
    try {
      setBusy(true);
      clearError();
      const available = await findAvailableRoom({ stake: selectedStake });
      if (available) {
        const joined = await joinRoomById(available.id);
        if (joined) goToLobby();
      }
    } catch {
      // Error handled by useLobby
    } finally {
      setBusy(false);
    }
  };

  const configuration = (
    <div className={styles.railStack}>
      <div className={styles.noticeStack} role="status" aria-live="polite" aria-atomic="true">
        {!canPayEnergy && <div className={styles.notice}>Il faut 10 énergie pour une manche classée.</div>}
        {!canPayStake && <div className={styles.notice}>Nkap insuffisants pour cette mise.</div>}
      </div>

      <Surface className={`nj-panel-pad-sm ${styles.panel} ${styles.panelTone} ${styles.panelTeal} ${styles.configPanel}`}>
        <ChoiceButtonGroup
          legend={(
            <span className={styles.legendRow}>
              <span>Mise par manche</span>
              <span className={styles.legendAmount}>Pot <NkapAmount value={selectedStake * maxPlayers} size="sm" /></span>
            </span>
          )}
          tone="teal"
          value={selectedStake}
          onChange={setSelectedStake}
          options={cfg.stakes.map((stake, index) => {
            /* La mise reste sélectionnable même hors budget : le bandeau
               au-dessus l'explique, et `selectedStake` démarre au palier
               intermédiaire — désactiver échouerait un joueur pauvre sur
               une sélection qu'il ne pourrait plus quitter. */
            const short = stake > nkap;
            return {
              value: stake,
              ariaLabel: `Mise de ${NKAP(stake)} par manche${short ? ", solde insuffisant" : ""}`,
              className: `${styles.tile} ${styles.stakeTile}${short ? ` ${styles.tileShort}` : ""}`,
              content: <StakeArt tier={index} stake={stake} />,
            };
          })}
        />

        <ChoiceButtonGroup
          legend="Nombre de joueurs"
          tone="teal"
          value={maxPlayers}
          onChange={setMaxPlayers}
          options={[2, 3, 4].map((count) => ({
            value: count,
            ariaLabel: `Table de ${count} joueurs`,
            className: `${styles.tile} ${styles.seatTile} nj-player-count-choice`,
            content: <SeatArt count={count} userEmoji={user?.emoji} />,
          }))}
        />

        <div className={styles.configPowers}>
          <EquippedPowersBar tone="teal" density="compact" />
        </div>
      </Surface>
    </div>
  );

  const footerStatus = roomError ? (
    <div className={styles.error} role="alert">{roomError}</div>
  ) : undefined;

  return (
    <PreGameLayout
      title="En ligne"
      kicker="Quartiers connectés"
      subtitle="Configure ta mise, retrouve les joueurs disponibles ou rejoins une salle publique."
      icon="online"
      tone="teal"
      headerArt="/assets/njambo/menu/mode-online-480.webp"
      pageClassName={styles.onlineFit}
      fit
      onBack={goBack}
    >
      <AuthGate gateClassName={styles.authPanel} tone="teal" accountBar="none">
        <PreGameWorkspace
          rail={configuration}
          railLabel="Configuration de la table en ligne"
          railFirst
        >
          <div className={styles.onlineLists}>
            {/* Panneau rendu inconditionnellement : le faire apparaître et
                disparaître ferait varier la hauteur à l'exécution, ce que la
                mise en page contrainte ne peut pas absorber. */}
            <Surface className={`nj-panel-pad-sm ${styles.listPanel} ${styles.panelTone} ${styles.panelPink} ${styles.roomsPanel}`}>
              <div className={styles.roomsHead}>
                <h2 className={styles.sectionTitle}>Salles disponibles</h2>
                <Chip tone="pink">{publicRooms.length}</Chip>
              </div>

              {/* `group` et non `list` : HubReveal insère un motion.div entre
                  le conteneur et le bouton, ce qui casserait la relation
                  list/listitem. */}
              <div className={styles.roomStrip} role="group" aria-label="Salles publiques disponibles" aria-live="polite">
                {publicRooms.length === 0 ? (
                  <div className={styles.roomEmpty}>
                    <NjamboIcon name="empty" tone="pink" size={22} />
                    <span>{searched ? "Aucune salle ouverte pour l’instant." : "Recherche des salles…"}</span>
                  </div>
                ) : publicRooms.map((room, index) => (
                  <HubReveal key={room.id} className={styles.roomSlot} order={index} axis="x" distance={10}>
                    <button
                      data-nj-skin="none"
                      type="button"
                      disabled={busy || !canStart || room.stake > nkap}
                      onClick={() => handleJoinRoom(room.id)}
                      className={`nj-list-card nj-list-card--pink ${styles.roomCard} ${styles.roomTile}`}
                      aria-label={`Rejoindre la salle ${room.code}, mise ${NKAP(room.stake)}, ${room.players.length} joueurs sur ${room.maxPlayers}`}
                    >
                      <span className={styles.roomCodeSmall}>{room.code}</span>
                      <span className={styles.roomTileMeta}>
                        <NkapAmount value={room.stake} size="sm" />
                        <span>{room.players.length}/{room.maxPlayers}</span>
                      </span>
                      <span className={styles.roomTileGo} aria-hidden="true">
                        <NjamboIcon name="play" tone="pink" size={15} />Rejoindre
                      </span>
                    </button>
                  </HubReveal>
                ))}
              </div>
              <span className={styles.stripFade} aria-hidden="true" />
            </Surface>
          </div>
        </PreGameWorkspace>

        <PreGameFooter status={footerStatus}>
          <div className={styles.actions} aria-busy={busy}>
            <Btn
              tone="teal"
              fill="solid"
              motif="indigo-dots"
              motifSides="both"
              onClick={handleCreate}
              disabled={busy || !canStart}
              icon={<NjamboIcon name="home" tone="teal" size={18} />}
            >
              {busy ? "…" : "Créer"}
            </Btn>
            {/* Second niveau : `soft` et un motif différent séparent les deux
                actions sans introduire une seconde couleur d'appel. */}
            <Btn
              tone="teal"
              fill="soft"
              motif="sun-stripes"
              motifSides="both"
              disabled={busy || !canStart}
              icon={<NjamboIcon name="play" tone="teal" size={18} />}
              onClick={handleAutoMatch}
            >
              {busy ? "…" : "Trouver"}
            </Btn>
          </div>
        </PreGameFooter>
      </AuthGate>
    </PreGameLayout>
  );
}

/** Palier de mise : pièces Nkap dont la masse croît avec le montant. */
function StakeArt({ tier, stake }: { tier: number; stake: number }) {
  const art = STAKE_TIERS[Math.min(tier, STAKE_TIERS.length - 1)];
  return (
    <>
      <span className={styles.tileArt} data-tier={Math.min(tier, STAKE_TIERS.length - 1)} aria-hidden="true">
        {Array.from({ length: art.count }, (_, index) => (
          <Image key={index} src={art.src} alt="" width={40} height={40} />
        ))}
      </span>
      <span className={styles.tileValue} aria-hidden="true">{stake.toLocaleString("fr-FR")}</span>
    </>
  );
}

/** Sièges : le premier avatar est celui du joueur — « 2 joueurs » se lit
    alors « toi + un », ce qui est la sémantique réelle. */
function SeatArt({ count, userEmoji }: { count: number; userEmoji?: string }) {
  return (
    <>
      <span className={styles.seatAvatars} aria-hidden="true">
        {Array.from({ length: count }, (_, index) => (
          <span key={index}>
            <AvatarIllustration seed={index === 0 ? (userEmoji ?? SEAT_SEEDS[0]) : SEAT_SEEDS[index]} fluid />
          </span>
        ))}
      </span>
      <span className="nj-player-count-value" aria-hidden="true">{count}</span>
    </>
  );
}
