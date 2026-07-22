"use client";

import { useEffect, useState } from "react";
import { useGame } from "@/contexts/GameContext";
import { useLobby } from "@/contexts/LobbyContext";
import { useAuth } from "@/hooks/useAuth";
import { useEconomy } from "@/contexts/EconomyContext";
import { listenDiscoverPlayers } from "@/lib/socialData";
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
import { SocialActions } from "@/components/social/SocialActions";
import { EquippedPowersBar } from "@/components/power/EquippedPowersBar";
import type { PublicPlayerProfile } from "@/types/game";
import styles from "./PreGameScreens.module.css";

export function OnlineSetupScreen() {
  const { navigateTo, cfg } = useGame();
  const { user } = useAuth();
  const { economy } = useEconomy();
  const { createRoom, joinRoomById, findAvailableRoom, publicRooms, searchRooms, roomError, clearError } = useLobby();
  const [playerSearch, setPlayerSearch] = useState("");
  const [players, setPlayers] = useState<PublicPlayerProfile[]>([]);
  const [selectedStake, setSelectedStake] = useState(cfg.stakes[1]);
  const [maxPlayers, setMaxPlayers] = useState(2);
  const [busy, setBusy] = useState(false);
  const canPayEnergy = economy?.energy.unlimited || (economy?.energy.available ?? 0) >= 10;
  const canPayStake = (economy?.nkap ?? 0) >= selectedStake;

  useEffect(() => searchRooms(), [searchRooms]);
  const canStart = Boolean(user && !user.isAnonymous && canPayEnergy && canPayStake);

  useEffect(() => {
    const unsub = listenDiscoverPlayers(user?.uid, playerSearch, setPlayers);
    return unsub;
  }, [playerSearch, user?.uid]);

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

      <Surface className={`nj-panel-pad-sm ${styles.panel} ${styles.panelTone} ${styles.panelTeal}`}>
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
          options={cfg.stakes.map((stake) => ({
            value: stake,
            content: <NkapAmount value={stake} size="sm" />,
          }))}
        />

        <ChoiceButtonGroup
          legend="Nombre de joueurs"
          tone="teal"
          value={maxPlayers}
          onChange={setMaxPlayers}
          options={[2, 3, 4].map((count) => ({
            value: count,
            content: count,
          }))}
        />
      </Surface>

      <Surface className={`nj-panel-pad-sm ${styles.panel} ${styles.panelTone} ${styles.panelGold}`}>
        <h2 className={styles.sectionTitle}>Pouvoirs équipés</h2>
        <div className={styles.sectionHint}>Prépare ton jeu avant de chercher une table.</div>
        <div style={{ marginTop: 12 }}>
          <EquippedPowersBar tone="gold" />
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
      onBack={goBack}
    >
      <AuthGate gateClassName={styles.authPanel} tone="teal">
        <PreGameWorkspace
          rail={configuration}
          railLabel="Configuration de la table en ligne"
        >
          <div className={styles.onlineLists}>
            <Surface className={`nj-panel-pad-sm ${styles.listPanel} ${styles.panelTone} ${styles.panelTeal}${publicRooms.length === 0 ? ` ${styles.widePanel}` : ""}`}>
              <div className={styles.panelHeader}>
                <div className={styles.panelHeading}>
                  <h2>Joueurs</h2>
                  <p>Ajoute, invite ou envoie un message.</p>
                </div>
                <Chip tone="teal">{players.length}</Chip>
              </div>

              <div className={styles.searchField}>
                <label className={styles.fieldLabel} htmlFor="online-player-search">Rechercher un joueur</label>
                <input
                  id="online-player-search"
                  type="search"
                  value={playerSearch}
                  onChange={(event) => setPlayerSearch(event.target.value)}
                  placeholder="Nom ou quartier"
                  autoComplete="off"
                  className="nj-input"
                />
              </div>

              <div className={styles.listBody} aria-live="polite">
                {players.length === 0 && (
                  <div className={styles.emptyState}>Aucun joueur ne correspond à cette recherche.</div>
                )}
                {players.map((player, index) => (
                  <HubReveal key={player.uid} className={styles.listReveal} order={index}>
                      <div className={`nj-list-card nj-list-card--teal${player.online ? " is-active" : ""} ${styles.playerCard}`}>
                      <AvatarIllustration seed={player.emoji} size={42} online={player.online} />
                      <div className={styles.playerIdentity}>
                        <span className={styles.playerName}>{player.name}</span>
                        <span className={styles.playerState}>{player.online ? "En ligne" : "Hors ligne"}</span>
                      </div>
                      <div className={styles.socialActions}>
                        <SocialActions player={player} compact tone="teal" />
                      </div>
                    </div>
                  </HubReveal>
                ))}
              </div>
            </Surface>

            {publicRooms.length > 0 && (
              <Surface className={`nj-panel-pad-sm ${styles.listPanel} ${styles.panelTone} ${styles.panelPink}`}>
                <div className={styles.panelHeader}>
                  <div className={styles.panelHeading}>
                    <h2>Salles disponibles</h2>
                    <p>Rejoins une table déjà ouverte.</p>
                  </div>
                  <Chip tone="pink">{publicRooms.length} salle{publicRooms.length > 1 ? "s" : ""}</Chip>
                </div>

                <div className={styles.listBody}>
                  {publicRooms.map((room, index) => (
                    <HubReveal key={room.id} className={styles.listReveal} order={index}>
                      <button
                        data-nj-skin="dark"
                        type="button"
                        disabled={busy || !canStart || room.stake > (economy?.nkap ?? 0)}
                        onClick={() => handleJoinRoom(room.id)}
                        className={`nj-list-card nj-list-card--pink ${styles.roomCard}`}
                        aria-label={`Rejoindre la salle ${room.code}, mise ${NKAP(room.stake)}, ${room.players.length} joueurs sur ${room.maxPlayers}`}
                      >
                        <span className={styles.roomMeta}>
                          <span className={styles.roomCodeSmall}>{room.code}</span>
                          <span className={styles.roomDetails}><NkapAmount value={room.stake} size="sm" /> · {room.players.length}/{room.maxPlayers}</span>
                        </span>
                        <NjamboIcon name="play" tone="pink" size={20} />
                      </button>
                    </HubReveal>
                  ))}
                </div>
              </Surface>
            )}
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
            <Btn
              tone="teal"
              fill="outline"
              motif="indigo-dots"
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
