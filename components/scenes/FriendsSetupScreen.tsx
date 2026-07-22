"use client";

import { useState } from "react";
import { useGame } from "@/contexts/GameContext";
import { useLobby } from "@/contexts/LobbyContext";
import { useOnlinePlayers } from "@/hooks/useOnlinePlayers";
import { AvatarIllustration, NjamboIcon } from "@/components/ui/Art";
import { Btn } from "@/components/ui/Btn";
import { ChoiceButtonGroup } from "@/components/ui/ChoiceButtonGroup";
import { NkapAmount } from "@/components/ui/NkapAmount";
import { Chip } from "@/components/ui/Chip";
import { AuthGate } from "@/components/ui/AuthGate";
import { HubReveal } from "@/components/ui/HubReveal";
import {
  PreGameFooter,
  PreGameLayout,
  PreGameWorkspace,
} from "@/components/ui/PreGameLayout";
import { Surface } from "@/components/ui/Shell";
import styles from "./PreGameScreens.module.css";

export function FriendsSetupScreen() {
  const { navigateTo, profile, cfg } = useGame();
  const { createRoom, joinRoomByCode, roomError, clearError } = useLobby();
  const { players, loading } = useOnlinePlayers();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [joinCode, setJoinCode] = useState("");
  const [mise, setMise] = useState(cfg.stakes[1]);
  const [seats, setSeats] = useState(2);
  const [busy, setBusy] = useState(false);

  // Le nombre de places reste la source de vérité pour la taille de la table.
  const changeSeats = (count: number) => {
    setSeats(count);
    setSelected((previous) => (
      previous.size <= count - 1
        ? previous
        : new Set(Array.from(previous).slice(0, count - 1))
    ));
  };

  const toggleFriend = (uid: string, online: boolean) => {
    if (!online) return;
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(uid)) next.delete(uid);
      else if (next.size < seats - 1) next.add(uid);
      return next;
    });
  };

  const canCreate = !busy && profile.balance >= mise;

  const handleCreate = async () => {
    if (!canCreate) return;
    try {
      setBusy(true);
      clearError();
      await createRoom(mise, seats, "friends");
      navigateTo("lobby");
    } catch {
      // Error handled by useLobby
    } finally {
      setBusy(false);
    }
  };

  const handleJoin = async () => {
    if (joinCode.length < 4) return;
    try {
      setBusy(true);
      clearError();
      const foundId = await joinRoomByCode(joinCode);
      if (foundId) navigateTo("lobby");
    } catch {
      // Error handled by useLobby
    } finally {
      setBusy(false);
    }
  };

  const configuration = (
    <div className={styles.railStack}>
      <Surface className={`nj-panel-pad-sm ${styles.panel} ${styles.panelTone} ${styles.panelPink}`}>
        <div className={styles.panelHeader}>
          <div className={styles.panelHeading}>
            <h2>Configurer la table</h2>
            <p>Choisis la mise et le nombre total de places.</p>
          </div>
          <Chip tone="pink">{canCreate ? "Prêt" : "Solde bas"}</Chip>
        </div>

        <ChoiceButtonGroup
          legend="Mise par manche"
          tone="pink"
          value={mise}
          onChange={setMise}
          options={cfg.stakes.map((stake) => ({
            value: stake,
            content: <NkapAmount value={stake} size="sm" />,
          }))}
        />

        <ChoiceButtonGroup
          legend="Nombre de joueurs"
          tone="pink"
          value={seats}
          onChange={changeSeats}
          options={[2, 3, 4].map((count) => ({
            value: count,
            content: count,
          }))}
        />
      </Surface>

      <Surface className={`nj-panel-pad-sm ${styles.panel} ${styles.panelTone} ${styles.panelGold}`}>
        <form
          className={styles.joinForm}
          onSubmit={(event) => {
            event.preventDefault();
            void handleJoin();
          }}
        >
          <div className={styles.joinLead}>
            <span className={styles.joinIcon} aria-hidden="true"><NjamboIcon name="code" tone="gold" size={22} /></span>
            <span className={styles.joinCopy}>
              <label className={styles.fieldLabel} htmlFor="friends-room-code">Rejoindre avec un code</label>
              <small>Entre le code partagé par ton ami.</small>
            </span>
          </div>
          <div className={styles.joinControls}>
            <input
              id="friends-room-code"
              value={joinCode}
              onChange={(event) => {
                setJoinCode(event.target.value.toUpperCase());
                clearError();
              }}
              placeholder="NJAM7K2"
              maxLength={7}
              autoComplete="off"
              className={`nj-input ${styles.joinInput}`}
            />
            <Btn
              type="submit"
              tone="gold"
              fill="outline"
              motif="indigo-dots"
              motifSides="both"
              icon={<NjamboIcon name="code" tone="gold" size={16} />}
              disabled={busy || joinCode.length < 4}
            >
              {busy ? "…" : "Rejoindre"}
            </Btn>
          </div>
        </form>
      </Surface>

      <Surface className={`nj-panel-pad-sm ${styles.panel} ${styles.panelTone} ${styles.panelTeal}`}>
        <div className={styles.potRow}>
          <span className={styles.summaryLabel}>
            <strong>{seats} joueurs</strong>
            <span>Pot total de la table</span>
          </span>
          <span className={styles.potValue}><NkapAmount value={mise * seats} size="lg" /></span>
        </div>
      </Surface>
    </div>
  );

  return (
    <PreGameLayout
      title="Inviter des amis"
      kicker="Table privée"
      subtitle="Sélectionne tes invités ou partage un code pour ouvrir ta table."
      icon="friends"
      tone="pink"
      onBack={() => navigateTo("menu")}
    >
      <AuthGate gateClassName={styles.authPanel} tone="pink">
        <PreGameWorkspace rail={configuration} railLabel="Création et accès à la table">
          <Surface className={`nj-panel-pad-sm ${styles.listPanel} ${styles.panelTone} ${styles.panelPink}`}>
            <div className={styles.panelHeader}>
              <div className={styles.panelHeading}>
                <h2>Joueurs disponibles</h2>
                <p>Optionnel : invite jusqu&apos;à {seats - 1} joueur{seats - 1 > 1 ? "s" : ""} en ligne.</p>
              </div>
              <Chip tone="pink">{selected.size}/{seats - 1}</Chip>
            </div>

            <div className={styles.listBody} aria-busy={loading} aria-live="polite">
              {loading && <div className={styles.emptyState} role="status">Chargement des joueurs…</div>}
              {!loading && players.length === 0 && (
                <div className={styles.emptyState}>Aucun autre joueur inscrit pour le moment.</div>
              )}
              {players.map((player, index) => {
                const isSelected = selected.has(player.uid);
                return (
                  <HubReveal key={player.uid} className={styles.listReveal} order={index}>
                    <button
                      data-nj-skin="dark"
                      type="button"
                      onClick={() => toggleFriend(player.uid, player.online)}
                      disabled={!player.online}
                      className={`nj-list-card${isSelected ? " nj-list-card--pink is-active" : ""} ${styles.playerCard}`}
                      aria-label={`${isSelected ? "Retirer" : "Inviter"} ${player.name}${player.online ? "" : ", hors ligne"}`}
                      aria-pressed={isSelected}
                    >
                      <span className={`${styles.selectMark}${isSelected ? ` ${styles.selectMarkActive}` : ""}`} aria-hidden="true">
                        {isSelected && <NjamboIcon name="check" tone="light" size={18} />}
                      </span>
                      <AvatarIllustration seed={player.emoji} size={46} online={player.online} />
                      <span className={styles.playerIdentity}>
                        <span className={styles.playerName}>{player.name}</span>
                        <span className={styles.playerState}>{player.online ? "En ligne" : "Hors ligne"}</span>
                      </span>
                    </button>
                  </HubReveal>
                );
              })}
            </div>
          </Surface>
        </PreGameWorkspace>

        <PreGameFooter status={roomError ? <div className={styles.error} role="alert">{roomError}</div> : undefined}>
          <div className={styles.actions} aria-busy={busy}>
            <Btn
              tone="pink"
              fill="solid"
              motif="indigo-dots"
              motifSides="both"
              onClick={handleCreate}
              disabled={!canCreate}
              icon={<NjamboIcon name="home" tone="pink" size={18} />}
            >
              {busy ? "Création…" : "Créer la salle"}
            </Btn>
          </div>
        </PreGameFooter>
      </AuthGate>
    </PreGameLayout>
  );
}
