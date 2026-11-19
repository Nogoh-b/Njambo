"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useGame } from "@/contexts/GameContext";
import { useLobby } from "@/contexts/LobbyContext";
import { useAuth } from "@/hooks/useAuth";
import { useMotionProfile } from "@/lib/motion";
import { resolveRank } from "@/lib/playerRank";
import { NKAP } from "@/data/mock";
import {
  acceptFriendRequest,
  listenDiscoverPlayers,
  listenFriendRequests,
  listenFriends,
  listenSocialCounts,
  rejectFriendRequest,
  sendFriendRequest,
  sendRoomInvite,
} from "@/lib/socialData";
import { AvatarIllustration, NjamboIcon } from "@/components/ui/Art";
import { GameShell } from "@/components/ui/GameShell";
import type {
  FriendRequest,
  PublicPlayerProfile,
  SocialFriendEntry,
  SocialUserLite,
} from "@/types/game";
import styles from "./FriendsScreen.module.css";

type Tab = "friends" | "requests" | "players";
type FriendsFilter = "all" | "online";
type RequestsFilter = "all" | "incoming" | "outgoing";
type ToastTone = "gold" | "emerald" | "ruby";

interface ToastMessage {
  id: number;
  text: string;
  tone: ToastTone;
}

const SPARKS = [
  { left: "11%", top: "16%", size: 4, delay: "0s" },
  { left: "86%", top: "14%", size: 5, delay: "1.2s" },
  { left: "24%", top: "48%", size: 3, delay: "2.1s" },
  { left: "91%", top: "54%", size: 4, delay: "0.7s" },
  { left: "8%", top: "78%", size: 5, delay: "1.8s" },
  { left: "76%", top: "84%", size: 3, delay: "2.8s" },
];

function formatRelative(ts: number): string {
  if (!ts) return "";
  const diffSec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (diffSec < 60) return "À l'instant";
  const mins = Math.floor(diffSec / 60);
  if (mins < 60) return `Il y a ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Il y a ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `Il y a ${days} j`;
  return `Il y a ${Math.floor(days / 30)} mois`;
}

function winRateOf(stats?: { played: number; won: number }): number | null {
  if (!stats || stats.played <= 0) return null;
  return Math.round((stats.won / stats.played) * 100);
}

export function FriendsScreen() {
  const { navigateTo, setSocialTarget, cfg } = useGame();
  const { currentRoom, createRoom } = useLobby();
  const { user } = useAuth();
  const motionProfile = useMotionProfile();

  const [tab, setTab] = useState<Tab>("friends");
  const [friendsFilter, setFriendsFilter] = useState<FriendsFilter>("all");
  const [requestsFilter, setRequestsFilter] = useState<RequestsFilter>("all");
  const [playersOnlineOnly, setPlayersOnlineOnly] = useState(false);
  const [search, setSearch] = useState("");
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  const [friends, setFriends] = useState<SocialFriendEntry[]>([]);
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [players, setPlayers] = useState<PublicPlayerProfile[]>([]);
  const [profileCache, setProfileCache] = useState<Record<string, PublicPlayerProfile>>({});
  const [unreadMessages, setUnreadMessages] = useState(0);

  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [sentRequestUids, setSentRequestUids] = useState<Set<string>>(() => new Set());
  const [invitedUids, setInvitedUids] = useState<Set<string>>(() => new Set());
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((text: string, tone: ToastTone = "gold") => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ id: Date.now(), text, tone });
    toastTimerRef.current = setTimeout(() => {
      setToast(null);
      toastTimerRef.current = null;
    }, 2600);
  }, []);

  useEffect(() => () => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
  }, []);

  useEffect(() => {
    if (!user?.uid) return;
    return listenFriends(user.uid, setFriends);
  }, [user?.uid]);

  useEffect(() => {
    if (!user?.uid) return;
    return listenFriendRequests(user.uid, setRequests);
  }, [user?.uid]);

  useEffect(() => {
    if (!user?.uid) return;
    return listenSocialCounts(user.uid, (counts) => setUnreadMessages(counts.messages));
  }, [user?.uid]);

  useEffect(() => {
    return listenDiscoverPlayers(user?.uid, search, (list) => {
      setPlayers(list);
      setProfileCache((prev) => {
        const next = { ...prev };
        for (const p of list) next[p.uid] = p;
        return next;
      });
    });
  }, [search, user?.uid]);

  /* ── Dérivés & Relations croisées ── */
  const me: SocialUserLite | null = useMemo(
    () => (user ? { uid: user.uid, name: user.name, emoji: user.emoji } : null),
    [user],
  );

  const friendUidSet = useMemo(() => new Set(friends.map((f) => f.uid)), [friends]);
  const incomingByFromUid = useMemo(() => {
    const map = new Map<string, FriendRequest>();
    for (const r of requests) {
      if (r.toUid === user?.uid) map.set(r.fromUid, r);
    }
    return map;
  }, [requests, user?.uid]);

  const outgoingUidSet = useMemo(() => {
    const set = new Set<string>(sentRequestUids);
    for (const r of requests) {
      if (r.fromUid === user?.uid) set.add(r.toUid);
    }
    return set;
  }, [requests, sentRequestUids, user?.uid]);

  const incomingCount = useMemo(
    () => requests.filter((req) => req.toUid === user?.uid).length,
    [requests, user?.uid],
  );
  const outgoingCount = requests.length - incomingCount;
  const onlineFriendsCount = useMemo(
    () => friends.filter((f) => f.online).length,
    [friends],
  );

  const visibleFriends = useMemo(() => {
    const sorted = [...friends].sort((a, b) => Number(b.online) - Number(a.online) || a.name.localeCompare(b.name));
    if (friendsFilter === "online") return sorted.filter((f) => f.online);
    return sorted;
  }, [friends, friendsFilter]);

  const visibleRequests = useMemo(() => {
    if (requestsFilter === "incoming") return requests.filter((r) => r.toUid === user?.uid);
    if (requestsFilter === "outgoing") return requests.filter((r) => r.fromUid === user?.uid);
    return requests;
  }, [requests, requestsFilter, user?.uid]);

  const visiblePlayers = useMemo(() => {
    const filtered = playersOnlineOnly ? players.filter((p) => p.online) : players;
    return [...filtered].sort(
      (a, b) => Number(b.online) - Number(a.online) || (b.crowns ?? 0) - (a.crowns ?? 0),
    );
  }, [players, playersOnlineOnly]);

  /* ── Actions sociales interactives ── */
  const openProfile = useCallback((target: SocialUserLite) => {
    setSocialTarget({
      playerUid: target.uid,
      peerUid: target.uid,
      peerName: target.name,
      peerEmoji: target.emoji,
    });
    navigateTo("public_profile");
  }, [navigateTo, setSocialTarget]);

  const openChat = useCallback((target: SocialUserLite) => {
    setSocialTarget({
      peerUid: target.uid,
      peerName: target.name,
      peerEmoji: target.emoji,
    });
    navigateTo("chat");
  }, [navigateTo, setSocialTarget]);

  const handleSendFriendRequest = useCallback(async (target: SocialUserLite) => {
    if (!me || me.uid === target.uid || outgoingUidSet.has(target.uid)) return;
    const key = `add:${target.uid}`;
    setBusyKey(key);
    try {
      await sendFriendRequest(me, target);
      setSentRequestUids((prev) => new Set(prev).add(target.uid));
      showToast(`Demande envoyée à ${target.name}`, "gold");
    } catch {
      showToast("Envoi impossible pour le moment", "ruby");
    } finally {
      setBusyKey(null);
    }
  }, [me, outgoingUidSet, showToast]);

  const handleInviteToTable = useCallback(async (target: SocialUserLite) => {
    if (!me || me.uid === target.uid) return;
    const key = `inv:${target.uid}`;
    setBusyKey(key);
    try {
      const roomId = currentRoom?.id ?? await createRoom(cfg.stakes[1], 2, "friends");
      await sendRoomInvite(me, target, roomId);
      setInvitedUids((prev) => new Set(prev).add(target.uid));
      showToast(`Invitation de table envoyée à ${target.name}`, "emerald");
      if (!currentRoom?.id) navigateTo("lobby");
    } catch {
      showToast("Impossible d'inviter ce joueur", "ruby");
    } finally {
      setBusyKey(null);
    }
  }, [cfg.stakes, createRoom, currentRoom?.id, me, navigateTo, showToast]);

  const handleAcceptRequest = useCallback(async (req: FriendRequest) => {
    const key = `acc:${req.id}`;
    setBusyKey(key);
    try {
      await acceptFriendRequest(req);
      showToast(`${req.fromName} rejoint ton cercle !`, "emerald");
    } catch {
      showToast("Acceptation impossible", "ruby");
    } finally {
      setBusyKey(null);
    }
  }, [showToast]);

  const handleRejectRequest = useCallback(async (req: FriendRequest, cancelled = false) => {
    const key = `rej:${req.id}`;
    setBusyKey(key);
    try {
      await rejectFriendRequest(req.id, cancelled);
      showToast(cancelled ? "Demande annulée" : `Invitation de ${req.fromName} refusée`, "ruby");
    } catch {
      showToast("Action impossible", "ruby");
    } finally {
      setBusyKey(null);
    }
  }, [showToast]);

  const toggleExpand = (key: string) => {
    setExpandedKey((prev) => (prev === key ? null : key));
  };

  const animateCards = motionProfile.enabled && !motionProfile.reduced;
  const allowLoops = motionProfile.enabled && motionProfile.allowDecorativeLoop;

  return (
    <GameShell dock={false} scroll={false} contentClassName={styles.socialShell}>
      {/* ═══ AMBIANCE SALON ROYAL (lustre & lucioles dorées) ═══ */}
      <div className={styles.villageSpotlight} aria-hidden="true" />
      {allowLoops && (
        <div className={styles.villageSparks} aria-hidden="true">
          {SPARKS.map((sp, idx) => (
            <span
              key={idx}
              style={{
                left: sp.left,
                top: sp.top,
                width: sp.size,
                height: sp.size,
                animationDelay: sp.delay,
              }}
            />
          ))}
        </div>
      )}

      {/* ═══ TOP HUD ROYAL ═══ */}
      <header className={styles.hud}>
        <button
          data-nj-skin="none"
          type="button"
          className={styles.backBtn}
          onClick={() => navigateTo("menu")}
          aria-label="Retour au salon principal"
        >
          <span className={styles.backArrow} aria-hidden="true">←</span>
          <span>Salon</span>
        </button>

        <div className={styles.hudCenter}>
          <span className={styles.hudKicker}>CERCLE PRIVÉ</span>
          <h1 className={styles.hudTitle}>Le village social</h1>
        </div>

        <div className={styles.hudRight}>
          <button
            data-nj-skin="none"
            type="button"
            className={`${styles.statusPill}${tab === "friends" && friendsFilter === "online" ? ` ${styles.statusPillActive}` : ""}`}
            title="Voir tes amis en ligne"
            onClick={() => {
              setTab("friends");
              setFriendsFilter((prev) => (tab === "friends" && prev === "online" ? "all" : "online"));
            }}
          >
            <span className={`${styles.onlineDot}${onlineFriendsCount > 0 && allowLoops ? ` ${styles.onlineDotPulse}` : ""}`} aria-hidden="true" />
            <strong>{onlineFriendsCount}</strong>
            <span className={styles.statusLabel}>en ligne</span>
          </button>

          <button
            data-nj-skin="none"
            type="button"
            className={styles.msgQuickBtn}
            onClick={() => navigateTo("messages")}
            aria-label={unreadMessages > 0 ? `Messages (${unreadMessages} non lus)` : "Ouvrir mes messages"}
            title="Messages"
          >
            <NjamboIcon name="message" tone="teal" size={18} />
            {unreadMessages > 0 && (
              <span className={styles.msgBadge}>{unreadMessages > 9 ? "9+" : unreadMessages}</span>
            )}
          </button>
        </div>
      </header>

      {/* ═══ 3 ONGLETS BIJOUX À PILULE COULISSANTE ═══ */}
      <nav className={styles.tabBar} role="tablist" aria-label="Sections sociales">
        {(
          [
            {
              id: "friends" as const,
              label: "Amis",
              icon: "friends" as const,
              tone: "palm" as const,
              count: friends.length,
              alert: 0,
              accentClass: styles.tabPillEmerald,
            },
            {
              id: "requests" as const,
              label: "Demandes",
              icon: "notification" as const,
              tone: "pink" as const,
              count: requests.length,
              alert: incomingCount,
              accentClass: styles.tabPillRuby,
            },
            {
              id: "players" as const,
              label: "Joueurs",
              icon: "online" as const,
              tone: "teal" as const,
              count: players.length,
              alert: 0,
              accentClass: styles.tabPillTeal,
            },
          ] as const
        ).map((item) => {
          const isActive = tab === item.id;
          return (
            <button
              key={item.id}
              data-nj-skin="none"
              type="button"
              role="tab"
              aria-selected={isActive}
              className={`${styles.tabBtn}${isActive ? ` ${styles.tabBtnActive}` : ""}`}
              onClick={() => {
                setTab(item.id);
                setExpandedKey(null);
              }}
            >
              {isActive && (
                <motion.span
                  layoutId="villageActiveTabPill"
                  className={`${styles.tabActiveBg} ${item.accentClass}`}
                  transition={
                    animateCards
                      ? { type: "spring", stiffness: 460, damping: 34 }
                      : { duration: 0.01 }
                  }
                  aria-hidden="true"
                />
              )}
              <span className={styles.tabInner}>
                <NjamboIcon name={item.icon} tone={item.tone} size={17} />
                <span className={styles.tabLabel}>{item.label}</span>
                {item.alert > 0 ? (
                  <span className={styles.tabAlert}>{item.alert}</span>
                ) : (
                  <span className={styles.tabCount}>{item.count}</span>
                )}
              </span>
            </button>
          );
        })}
      </nav>

      {/* ═══ PANNEAU CENTRAL SALON ROYAL ═══ */}
      <section className={styles.board} aria-label="Liste sociale Njambo">
        <span className={`${styles.rivet} ${styles.rivetTl}`} aria-hidden="true" />
        <span className={`${styles.rivet} ${styles.rivetTr}`} aria-hidden="true" />
        <span className={`${styles.rivet} ${styles.rivetBl}`} aria-hidden="true" />
        <span className={`${styles.rivet} ${styles.rivetBr}`} aria-hidden="true" />

        {/* ── Barre contextuelle interactive par onglet ── */}
        {tab === "friends" && (
          <div className={styles.contextBar}>
            <div className={styles.filterGroup} role="group" aria-label="Filtrer les amis">
              <button
                data-nj-skin="none"
                type="button"
                className={`${styles.filterPill}${friendsFilter === "all" ? ` ${styles.filterPillActive}` : ""}`}
                onClick={() => setFriendsFilter("all")}
              >
                Tous <span>{friends.length}</span>
              </button>
              <button
                data-nj-skin="none"
                type="button"
                className={`${styles.filterPill}${friendsFilter === "online" ? ` ${styles.filterPillOnline}` : ""}`}
                onClick={() => setFriendsFilter("online")}
              >
                <i className={styles.miniDot} aria-hidden="true" />
                En ligne <span>{onlineFriendsCount}</span>
              </button>
            </div>

            <button
              data-nj-skin="none"
              type="button"
              className={styles.privateTableBtn}
              onClick={() => navigateTo("friends_invite")}
            >
              <NjamboIcon name="cards" tone="gold" size={15} />
              <span>Table privée</span>
            </button>
          </div>
        )}

        {tab === "requests" && requests.length > 0 && (
          <div className={styles.contextBar}>
            <div className={styles.filterGroup} role="group" aria-label="Filtrer les demandes">
              <button
                data-nj-skin="none"
                type="button"
                className={`${styles.filterPill}${requestsFilter === "all" ? ` ${styles.filterPillActive}` : ""}`}
                onClick={() => setRequestsFilter("all")}
              >
                Toutes <span>{requests.length}</span>
              </button>
              <button
                data-nj-skin="none"
                type="button"
                className={`${styles.filterPill}${requestsFilter === "incoming" ? ` ${styles.filterPillRuby}` : ""}`}
                onClick={() => setRequestsFilter("incoming")}
              >
                Reçues <span>{incomingCount}</span>
              </button>
              <button
                data-nj-skin="none"
                type="button"
                className={`${styles.filterPill}${requestsFilter === "outgoing" ? ` ${styles.filterPillActive}` : ""}`}
                onClick={() => setRequestsFilter("outgoing")}
              >
                Envoyées <span>{outgoingCount}</span>
              </button>
            </div>
          </div>
        )}

        {tab === "players" && (
          <div className={styles.searchRow}>
            <div className={styles.searchWrap}>
              <span className={styles.searchIcon} aria-hidden="true">
                <NjamboIcon name="search" tone="teal" size={16} />
              </span>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className={styles.searchInput}
                placeholder="Rechercher un pseudo dans le quartier…"
                aria-label="Rechercher un joueur par pseudo"
              />
              {search && (
                <button
                  data-nj-skin="none"
                  type="button"
                  className={styles.searchClear}
                  onClick={() => setSearch("")}
                  aria-label="Effacer la recherche"
                >
                  ×
                </button>
              )}
            </div>

            <button
              data-nj-skin="none"
              type="button"
              aria-pressed={playersOnlineOnly}
              className={`${styles.onlineToggle}${playersOnlineOnly ? ` ${styles.onlineToggleActive}` : ""}`}
              onClick={() => setPlayersOnlineOnly((v) => !v)}
              title="Afficher uniquement les joueurs en ligne"
            >
              <i className={styles.miniDot} aria-hidden="true" />
              <span>En ligne</span>
            </button>
          </div>
        )}

        {/* ── Toast flottant de confirmation ── */}
        <AnimatePresence>
          {toast && (
            <motion.div
              key={toast.id}
              role="status"
              aria-live="polite"
              className={`${styles.toast} ${
                toast.tone === "emerald"
                  ? styles.toastEmerald
                  : toast.tone === "ruby"
                    ? styles.toastRuby
                    : styles.toastGold
              }`}
              initial={animateCards ? { opacity: 0, y: -12, scale: 0.94 } : false}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={animateCards ? { opacity: 0, y: -10, scale: 0.95 } : undefined}
              transition={{ type: "spring", stiffness: 460, damping: 32 }}
            >
              <span className={styles.toastIcon} aria-hidden="true">
                {toast.tone === "ruby" ? "!" : "✓"}
              </span>
              <span>{toast.text}</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Liste scrollable interne ── */}
        <div className={styles.listScroll}>
          {/* ═══════════════════ ONGLET AMIS ═══════════════════ */}
          {tab === "friends" && visibleFriends.length === 0 && (
            <motion.div
              key="empty-friends"
              className={styles.emptyCard}
              initial={animateCards ? { opacity: 0, y: 12, scale: 0.96 } : false}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.28 }}
            >
              <span className={`${styles.emptyBadge} ${styles.emptyEmerald}`}>
                <NjamboIcon name="friends" tone="palm" size={42} />
              </span>
              <h2>
                {friendsFilter === "online" && friends.length > 0
                  ? "Personne en ligne à cet instant"
                  : "Ton cercle t'attend"}
              </h2>
              <p>
                {friendsFilter === "online" && friends.length > 0
                  ? "Tes amis sont momentanément absents. Affiche toute la liste ou pars rencontrer d'autres joueurs."
                  : "Ajoute des joueurs du quartier pour ouvrir des tables privées et suivre leurs parties en direct."}
              </p>
              {friendsFilter === "online" && friends.length > 0 ? (
                <button
                  data-nj-skin="none"
                  type="button"
                  className={styles.emptyCta}
                  onClick={() => setFriendsFilter("all")}
                >
                  Voir tous mes amis ({friends.length})
                </button>
              ) : (
                <button
                  data-nj-skin="none"
                  type="button"
                  className={styles.emptyCta}
                  onClick={() => setTab("players")}
                >
                  <span>Découvrir les joueurs</span>
                  <span aria-hidden="true">→</span>
                </button>
              )}
            </motion.div>
          )}

          {tab === "friends" && (
            <AnimatePresence mode="popLayout">
              {visibleFriends.map((friend, idx) => {
                const enriched = profileCache[friend.uid];
                const rank = enriched ? resolveRank(enriched.crowns) : null;
                const wr = winRateOf(enriched?.stats);
                const cardKey = `friend:${friend.uid}`;
                const expanded = expandedKey === cardKey;
                const invited = invitedUids.has(friend.uid);
                const inviting = busyKey === `inv:${friend.uid}`;

                return (
                  <motion.article
                    key={cardKey}
                    layout={animateCards}
                    initial={animateCards ? { opacity: 0, y: 14, scale: 0.98 } : false}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={animateCards ? { opacity: 0, scale: 0.95, y: -8 } : undefined}
                    transition={{
                      type: "spring",
                      stiffness: 420,
                      damping: 32,
                      delay: animateCards ? Math.min(idx * 0.04, 0.24) : 0,
                    }}
                    className={`${styles.socialCard}${friend.online ? ` ${styles.cardOnline}` : ""}${expanded ? ` ${styles.cardExpanded}` : ""}`}
                  >
                    <div className={styles.cardMainRow}>
                      <button
                        data-nj-skin="none"
                        type="button"
                        className={styles.cardIdentityBtn}
                        onClick={() => toggleExpand(cardKey)}
                        aria-expanded={expanded}
                        aria-label={`Détails de ${friend.name}`}
                      >
                        <span className={`${styles.avatarFrame}${friend.online ? ` ${styles.avatarOnline}` : ""}`}>
                          {friend.online && allowLoops && (
                            <span className={styles.avatarSonar} aria-hidden="true" />
                          )}
                          <AvatarIllustration
                            seed={friend.emoji}
                            size={46}
                            active={friend.online}
                            online={friend.online}
                          />
                          {rank && (
                            <span className={styles.rankBadge} title={rank.label}>
                              <img src={rank.assetSrc} alt="" draggable={false} />
                            </span>
                          )}
                        </span>

                        <span className={styles.identityBody}>
                          <span className={styles.nameRow}>
                            <strong className={styles.playerName}>{friend.name}</strong>
                            <span className={`${styles.presenceTag}${friend.online ? ` ${styles.presenceLive}` : ""}`}>
                              {friend.online ? "En ligne" : (formatRelative(friend.lastSeen) || "Hors ligne")}
                            </span>
                          </span>

                          <span className={styles.metaStrip}>
                            {rank ? (
                              <span className={styles.rankLabel}>{rank.label}</span>
                            ) : (
                              <span className={styles.rankLabel}>Ami du cercle</span>
                            )}
                            {enriched && (
                              <span className={styles.crownChip}>
                                <NjamboIcon name="crown" tone="gold" size={11} />
                                {(enriched.crowns ?? 1000).toLocaleString("fr-FR")}
                              </span>
                            )}
                            {wr !== null && (
                              <span className={styles.statChip}>{wr}% vict.</span>
                            )}
                          </span>
                        </span>
                      </button>

                      <div className={styles.cardActions}>
                        <button
                          data-nj-skin="none"
                          type="button"
                          className={`${styles.actionBtn} ${styles.btnMsg}`}
                          onClick={() => openChat(friend)}
                          aria-label={`Écrire à ${friend.name}`}
                          title="Message"
                        >
                          <NjamboIcon name="message" tone="teal" size={16} />
                          <span className={styles.btnText}>Message</span>
                        </button>

                        <button
                          data-nj-skin="none"
                          type="button"
                          className={`${styles.actionBtn} ${invited ? styles.btnDone : styles.btnGold}`}
                          onClick={() => { void handleInviteToTable(friend); }}
                          disabled={inviting}
                          aria-label={`Inviter ${friend.name} à une table`}
                          title="Inviter à une table privée"
                        >
                          {invited ? (
                            <span className={styles.btnGlyph} aria-hidden="true">✓</span>
                          ) : (
                            <NjamboIcon name="cards" tone="gold" size={16} />
                          )}
                          <span>{inviting ? "…" : invited ? "Invité" : "Inviter"}</span>
                        </button>

                        <button
                          data-nj-skin="none"
                          type="button"
                          className={`${styles.expandBtn}${expanded ? ` ${styles.expandBtnOpen}` : ""}`}
                          onClick={() => toggleExpand(cardKey)}
                          aria-label={expanded ? "Réduire" : "Plus d'options"}
                        >
                          ▾
                        </button>
                      </div>
                    </div>

                    <AnimatePresence initial={false}>
                      {expanded && (
                        <motion.div
                          key="drawer"
                          initial={animateCards ? { height: 0, opacity: 0 } : false}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={animateCards ? { height: 0, opacity: 0 } : undefined}
                          transition={{ duration: 0.22, ease: "easeOut" }}
                          className={styles.cardDrawer}
                        >
                          <div className={styles.drawerInner}>
                            {enriched && (
                              <div className={styles.drawerStats}>
                                <div className={styles.drawerStatBox}>
                                  <small>Parties</small>
                                  <strong>{enriched.stats.played}</strong>
                                </div>
                                <div className={styles.drawerStatBox}>
                                  <small>Victoires</small>
                                  <strong>{enriched.stats.won}</strong>
                                </div>
                                <div className={styles.drawerStatBox}>
                                  <small>Meilleur pot</small>
                                  <strong>{enriched.stats.bestWin > 0 ? NKAP(enriched.stats.bestWin) : "—"}</strong>
                                </div>
                              </div>
                            )}

                            <div className={styles.drawerBtns}>
                              <button
                                data-nj-skin="none"
                                type="button"
                                className={`${styles.drawerBtn} ${styles.btnGlass}`}
                                onClick={() => openProfile(friend)}
                              >
                                <NjamboIcon name="profile" tone="gold" size={15} />
                                <span>Voir le profil</span>
                              </button>
                              <button
                                data-nj-skin="none"
                                type="button"
                                className={`${styles.drawerBtn} ${styles.btnMsg}`}
                                onClick={() => openChat(friend)}
                              >
                                <NjamboIcon name="message" tone="teal" size={15} />
                                <span>Discuter</span>
                              </button>
                              <button
                                data-nj-skin="none"
                                type="button"
                                className={`${styles.drawerBtn} ${styles.btnGold}`}
                                onClick={() => { void handleInviteToTable(friend); }}
                                disabled={inviting}
                              >
                                <NjamboIcon name="cards" tone="gold" size={15} />
                                <span>{inviting ? "Ouverture…" : "Table privée"}</span>
                              </button>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.article>
                );
              })}
            </AnimatePresence>
          )}

          {/* ═══════════════════ ONGLET DEMANDES ═══════════════════ */}
          {tab === "requests" && visibleRequests.length === 0 && (
            <motion.div
              key="empty-requests"
              className={styles.emptyCard}
              initial={animateCards ? { opacity: 0, y: 12, scale: 0.96 } : false}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.28 }}
            >
              <span className={`${styles.emptyBadge} ${styles.emptyRuby}`}>
                <NjamboIcon name="notification" tone="pink" size={42} />
              </span>
              <h2>Aucune invitation en attente</h2>
              <p>
                Tes invitations reçues ou envoyées apparaîtront ici dès qu&apos;un joueur te contacte.
              </p>
              <button
                data-nj-skin="none"
                type="button"
                className={styles.emptyCta}
                onClick={() => setTab("players")}
              >
                <span>Inviter un joueur</span>
                <span aria-hidden="true">→</span>
              </button>
            </motion.div>
          )}

          {tab === "requests" && (
            <AnimatePresence mode="popLayout">
              {visibleRequests.map((req, idx) => {
                const incoming = req.toUid === user?.uid;
                const peer: SocialUserLite = incoming
                  ? { uid: req.fromUid, name: req.fromName, emoji: req.fromEmoji }
                  : { uid: req.toUid, name: req.toName, emoji: req.toEmoji };
                const accepting = busyKey === `acc:${req.id}`;
                const rejecting = busyKey === `rej:${req.id}`;
                const relTime = formatRelative(req.createdAt);

                return (
                  <motion.article
                    key={req.id}
                    layout={animateCards}
                    initial={animateCards ? { opacity: 0, y: 14, scale: 0.98 } : false}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={animateCards ? { opacity: 0, x: 32, scale: 0.94 } : undefined}
                    transition={{
                      type: "spring",
                      stiffness: 420,
                      damping: 32,
                      delay: animateCards ? Math.min(idx * 0.04, 0.24) : 0,
                    }}
                    className={`${styles.socialCard}${incoming ? ` ${styles.cardIncoming}` : ` ${styles.cardOutgoing}`}`}
                  >
                    <div className={styles.cardMainRow}>
                      <button
                        data-nj-skin="none"
                        type="button"
                        className={styles.cardIdentityBtn}
                        onClick={() => openProfile(peer)}
                        aria-label={`Voir le profil de ${peer.name}`}
                      >
                        <span className={`${styles.avatarFrame}${incoming ? ` ${styles.avatarRuby}` : ""}`}>
                          <AvatarIllustration seed={peer.emoji} size={46} active={incoming} />
                        </span>

                        <span className={styles.identityBody}>
                          <span className={styles.nameRow}>
                            <strong className={styles.playerName}>{peer.name}</strong>
                          </span>
                          <span className={styles.metaStrip}>
                            <span className={`${styles.reqBadge}${incoming ? ` ${styles.reqBadgeIn}` : ` ${styles.reqBadgeOut}`}`}>
                              {incoming ? "Invitation reçue" : "En attente…"}
                            </span>
                            {relTime && <span className={styles.timeText}>{relTime}</span>}
                          </span>
                        </span>
                      </button>

                      <div className={styles.cardActions}>
                        {incoming ? (
                          <>
                            <button
                              data-nj-skin="none"
                              type="button"
                              className={`${styles.actionBtn} ${styles.btnAccept}`}
                              disabled={accepting || rejecting}
                              onClick={() => { void handleAcceptRequest(req); }}
                              aria-label={`Accepter l'invitation de ${peer.name}`}
                            >
                              <span className={styles.btnGlyph} aria-hidden="true">✓</span>
                              <span>{accepting ? "…" : "Accepter"}</span>
                            </button>
                            <button
                              data-nj-skin="none"
                              type="button"
                              className={`${styles.actionBtn} ${styles.btnReject}`}
                              disabled={accepting || rejecting}
                              onClick={() => { void handleRejectRequest(req, false); }}
                              aria-label={`Refuser l'invitation de ${peer.name}`}
                            >
                              <span className={styles.btnGlyph} aria-hidden="true">✕</span>
                              <span className={styles.btnText}>Refuser</span>
                            </button>
                          </>
                        ) : (
                          <button
                            data-nj-skin="none"
                            type="button"
                            className={`${styles.actionBtn} ${styles.btnCancel}`}
                            disabled={rejecting}
                            onClick={() => { void handleRejectRequest(req, true); }}
                            aria-label={`Annuler la demande envoyée à ${peer.name}`}
                          >
                            <span>{rejecting ? "…" : "Annuler"}</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </motion.article>
                );
              })}
            </AnimatePresence>
          )}

          {/* ═══════════════════ ONGLET JOUEURS ═══════════════════ */}
          {tab === "players" && visiblePlayers.length === 0 && (
            <motion.div
              key="empty-players"
              className={styles.emptyCard}
              initial={animateCards ? { opacity: 0, y: 12, scale: 0.96 } : false}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.28 }}
            >
              <span className={`${styles.emptyBadge} ${styles.emptyTeal}`}>
                <NjamboIcon name="online" tone="teal" size={42} />
              </span>
              <h2>Aucun joueur trouvé</h2>
              <p>
                {search
                  ? `Aucun pseudo ne correspond à « ${search} » pour l'instant.`
                  : playersOnlineOnly
                    ? "Aucun joueur du quartier n'est en ligne en ce moment."
                    : "Les joueurs inscrits dans le salon apparaîtront ici dès qu'ils se connectent."}
              </p>
              {(search || playersOnlineOnly) && (
                <button
                  data-nj-skin="none"
                  type="button"
                  className={styles.emptyCta}
                  onClick={() => {
                    setSearch("");
                    setPlayersOnlineOnly(false);
                  }}
                >
                  Afficher tout le monde
                </button>
              )}
            </motion.div>
          )}

          {tab === "players" && (
            <AnimatePresence mode="popLayout">
              {visiblePlayers.map((player, idx) => {
                const rank = resolveRank(player.crowns);
                const wr = winRateOf(player.stats);
                const isFriend = friendUidSet.has(player.uid);
                const incomingReq = incomingByFromUid.get(player.uid);
                const isRequested = outgoingUidSet.has(player.uid);
                const invited = invitedUids.has(player.uid);
                const adding = busyKey === `add:${player.uid}`;
                const inviting = busyKey === `inv:${player.uid}`;
                const accepting = incomingReq ? busyKey === `acc:${incomingReq.id}` : false;
                const cardKey = `player:${player.uid}`;
                const expanded = expandedKey === cardKey;

                return (
                  <motion.article
                    key={cardKey}
                    layout={animateCards}
                    initial={animateCards ? { opacity: 0, y: 14, scale: 0.98 } : false}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={animateCards ? { opacity: 0, scale: 0.95 } : undefined}
                    transition={{
                      type: "spring",
                      stiffness: 420,
                      damping: 32,
                      delay: animateCards ? Math.min(idx * 0.035, 0.24) : 0,
                    }}
                    className={`${styles.socialCard}${player.online ? ` ${styles.cardOnline}` : ""}${expanded ? ` ${styles.cardExpanded}` : ""}`}
                  >
                    <div className={styles.cardMainRow}>
                      <button
                        data-nj-skin="none"
                        type="button"
                        className={styles.cardIdentityBtn}
                        onClick={() => toggleExpand(cardKey)}
                        aria-expanded={expanded}
                        aria-label={`Détails de ${player.name}`}
                      >
                        <span className={`${styles.avatarFrame}${player.online ? ` ${styles.avatarOnline}` : ""}`}>
                          {player.online && allowLoops && (
                            <span className={styles.avatarSonar} aria-hidden="true" />
                          )}
                          <AvatarIllustration
                            seed={player.emoji}
                            size={46}
                            active={player.online}
                            online={player.online}
                          />
                          <span className={styles.rankBadge} title={rank.label}>
                            <img src={rank.assetSrc} alt="" draggable={false} />
                          </span>
                        </span>

                        <span className={styles.identityBody}>
                          <span className={styles.nameRow}>
                            <strong className={styles.playerName}>{player.name}</strong>
                            {isFriend && <span className={styles.friendTag}>✓ Ami</span>}
                          </span>

                          <span className={styles.metaStrip}>
                            <span className={styles.rankLabel}>{rank.label}</span>
                            <span className={styles.crownChip}>
                              <NjamboIcon name="crown" tone="gold" size={11} />
                              {(player.crowns ?? 1000).toLocaleString("fr-FR")}
                            </span>
                            {player.stats.played > 0 && (
                              <span className={styles.statChip}>{player.stats.played} p.</span>
                            )}
                          </span>
                        </span>
                      </button>

                      <div className={styles.cardActions}>
                        {isFriend ? (
                          <button
                            data-nj-skin="none"
                            type="button"
                            className={`${styles.actionBtn} ${invited ? styles.btnDone : styles.btnGold}`}
                            onClick={() => { void handleInviteToTable(player); }}
                            disabled={inviting}
                            aria-label={`Inviter ${player.name} à une table`}
                          >
                            {invited ? (
                              <span className={styles.btnGlyph} aria-hidden="true">✓</span>
                            ) : (
                              <NjamboIcon name="cards" tone="gold" size={16} />
                            )}
                            <span>{inviting ? "…" : invited ? "Invité" : "Inviter"}</span>
                          </button>
                        ) : incomingReq ? (
                          <button
                            data-nj-skin="none"
                            type="button"
                            className={`${styles.actionBtn} ${styles.btnAccept}`}
                            disabled={accepting}
                            onClick={() => { void handleAcceptRequest(incomingReq); }}
                            aria-label={`Accepter l'invitation de ${player.name}`}
                          >
                            <span className={styles.btnGlyph} aria-hidden="true">✓</span>
                            <span>{accepting ? "…" : "Accepter"}</span>
                          </button>
                        ) : isRequested ? (
                          <span className={styles.sentPill}>✓ Envoyée</span>
                        ) : (
                          <button
                            data-nj-skin="none"
                            type="button"
                            className={`${styles.actionBtn} ${styles.btnGold}`}
                            disabled={adding || !me}
                            onClick={() => { void handleSendFriendRequest(player); }}
                            aria-label={`Ajouter ${player.name} aux amis`}
                          >
                            <NjamboIcon name="plus" tone="gold" size={15} />
                            <span>{adding ? "…" : "Ajouter"}</span>
                          </button>
                        )}

                        <button
                          data-nj-skin="none"
                          type="button"
                          className={`${styles.actionBtn} ${styles.btnMsg} ${styles.btnIconOnly}`}
                          onClick={() => openChat(player)}
                          aria-label={`Écrire à ${player.name}`}
                          title="Message"
                        >
                          <NjamboIcon name="message" tone="teal" size={16} />
                        </button>

                        <button
                          data-nj-skin="none"
                          type="button"
                          className={`${styles.expandBtn}${expanded ? ` ${styles.expandBtnOpen}` : ""}`}
                          onClick={() => toggleExpand(cardKey)}
                          aria-label={expanded ? "Réduire" : "Plus d'infos"}
                        >
                          ▾
                        </button>
                      </div>
                    </div>

                    <AnimatePresence initial={false}>
                      {expanded && (
                        <motion.div
                          key="drawer"
                          initial={animateCards ? { height: 0, opacity: 0 } : false}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={animateCards ? { height: 0, opacity: 0 } : undefined}
                          transition={{ duration: 0.22, ease: "easeOut" }}
                          className={styles.cardDrawer}
                        >
                          <div className={styles.drawerInner}>
                            <div className={styles.drawerStats}>
                              <div className={styles.drawerStatBox}>
                                <small>Parties</small>
                                <strong>{player.stats.played}</strong>
                              </div>
                              <div className={styles.drawerStatBox}>
                                <small>Victoires</small>
                                <strong>{wr !== null ? `${player.stats.won} (${wr}%)` : player.stats.won}</strong>
                              </div>
                              <div className={styles.drawerStatBox}>
                                <small>Meilleur pot</small>
                                <strong>{player.stats.bestWin > 0 ? NKAP(player.stats.bestWin) : "—"}</strong>
                              </div>
                            </div>

                            {wr !== null && (
                              <div className={styles.winBarWrap} aria-label={`Taux de victoire : ${wr}%`}>
                                <div className={styles.winBarTrack}>
                                  <span className={styles.winBarFill} style={{ width: `${Math.min(100, wr)}%` }} />
                                </div>
                              </div>
                            )}

                            <div className={styles.drawerBtns}>
                              <button
                                data-nj-skin="none"
                                type="button"
                                className={`${styles.drawerBtn} ${styles.btnGlass}`}
                                onClick={() => openProfile(player)}
                              >
                                <NjamboIcon name="profile" tone="gold" size={15} />
                                <span>Profil complet</span>
                              </button>
                              <button
                                data-nj-skin="none"
                                type="button"
                                className={`${styles.drawerBtn} ${styles.btnMsg}`}
                                onClick={() => openChat(player)}
                              >
                                <NjamboIcon name="message" tone="teal" size={15} />
                                <span>Écrire</span>
                              </button>
                              <button
                                data-nj-skin="none"
                                type="button"
                                className={`${styles.drawerBtn} ${styles.btnRuby}`}
                                onClick={() => { void handleInviteToTable(player); }}
                                disabled={inviting || !me}
                              >
                                <NjamboIcon name="cards" tone="light" size={15} />
                                <span>{inviting ? "Ouverture…" : "Inviter à jouer"}</span>
                              </button>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.article>
                );
              })}
            </AnimatePresence>
          )}
        </div>
      </section>
    </GameShell>
  );
}
