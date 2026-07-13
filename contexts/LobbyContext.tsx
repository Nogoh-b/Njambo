"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  addDoc,
  updateDoc,
  deleteDoc,
  where,
  runTransaction,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/hooks/useAuth";
import type { RoomDoc, RoomPlayer } from "@/types/game";

/* ═══════════════ LobbyContext — Firestore Rooms (shared state) ═══════════════
   Gère la création, la recherche, le suivi temps réel et la
   gestion des salles de jeu. Wrappe useLobby dans un Provider
   pour que tous les composants partagent le même état. */

type RoomFilters = { stake?: number };

/** Indice léger « une partie est en cours » — alimente l'affordance Reprendre
    du menu sans hydrater/écouter la salle (contrairement à resumeActiveRoom). */
export type ActiveRoomHint = { id: string; roomType: "online" | "friends" };

interface LobbyContextValue {
  currentRoom: RoomDoc | null;
  roomError: string | null;
  clearError: () => void;

  createRoom: (stake: number, maxPlayers: number, roomType?: "online" | "friends") => Promise<string>;
  joinRoomByCode: (code: string) => Promise<string | null>;
  joinRoomById: (roomId: string) => Promise<boolean>;
  leaveRoom: () => Promise<void>;
  setReady: (ready: boolean) => Promise<void>;
  startGame: () => Promise<void>;
  resumeActiveRoom: () => Promise<RoomDoc | null>;
  activeRoomHint: ActiveRoomHint | null;
  refreshActiveRoomHint: () => void;

  publicRooms: RoomDoc[];
  searchRooms: (filters?: RoomFilters) => void;
  findAvailableRoom: (filters?: RoomFilters) => Promise<RoomDoc | null>;
}

const LobbyContext = createContext<LobbyContextValue | null>(null);

/* ── Helpers ── */

function generateCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "NJAM";
  for (let i = 0; i < 3; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function roomFromDoc(d: { id: string; data: () => unknown }): RoomDoc {
  return { id: d.id, ...(d.data() as Omit<RoomDoc, "id">) };
}

function isJoinable(room: RoomDoc): boolean {
  return room.status === "waiting"
    && room.roomType !== "friends"
    && Array.isArray(room.players)
    && room.players.length < room.maxPlayers;
}

function normalizeRooms(
  docs: Array<{ id: string; data: () => unknown }>,
  filters: RoomFilters = {},
): RoomDoc[] {
  return docs
    .map(roomFromDoc)
    .filter((room) => isJoinable(room))
    .filter((room) => filters.stake === undefined || room.stake === filters.stake)
    .sort((a, b) => b.createdAt - a.createdAt);
}

/* ═══════════════ Provider ═══════════════ */

export function LobbyProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [currentRoom, setCurrentRoom] = useState<RoomDoc | null>(null);
  const [roomError, setRoomError] = useState<string | null>(null);
  const [publicRooms, setPublicRooms] = useState<RoomDoc[]>([]);
  const [activeRoomHint, setActiveRoomHint] = useState<ActiveRoomHint | null>(null);

  const unsubRoom = useRef<Unsubscribe | null>(null);
  const unsubPublic = useRef<Unsubscribe | null>(null);

  const clearError = useCallback(() => setRoomError(null), []);

  /* ── Écoute temps réel de la salle courante ── */
  const listenRoom = useCallback((roomId: string) => {
    unsubRoom.current?.();
    unsubRoom.current = onSnapshot(
      doc(db, "rooms", roomId),
      (snap) => {
        if (snap.exists()) {
          setCurrentRoom({ id: snap.id, ...snap.data() } as RoomDoc);
        } else {
          setCurrentRoom(null);
        }
      },
      (err) => {
        console.error("[LobbyContext] listenRoom error:", err);
        setRoomError("Erreur de connexion à la salle.");
      },
    );
  }, []);

  /* ── Écoute des salles publiques ── */
  const searchRooms = useCallback((filters: RoomFilters = {}) => {
    unsubPublic.current?.();
    const q = query(
      collection(db, "rooms"),
      where("status", "==", "waiting"),
    );
    unsubPublic.current = onSnapshot(q, (snap) => {
      setPublicRooms(normalizeRooms(snap.docs, filters));
    }, (err) => {
      console.error("[LobbyContext] searchRooms error:", err);
      setRoomError("Impossible de charger les salles disponibles.");
    });
  }, []);

  const findAvailableRoom = useCallback(async (filters: RoomFilters = {}): Promise<RoomDoc | null> => {
    if (!user) throw new Error("Non connecté");
    setRoomError(null);

    try {
      const q = query(collection(db, "rooms"), where("status", "==", "waiting"));
      const snap = await getDocs(q);
      const allRooms = normalizeRooms(snap.docs);
      const matchingRooms = normalizeRooms(snap.docs, filters);

      setPublicRooms(allRooms);

      if (matchingRooms.length === 0) {
        setRoomError("Aucune table disponible pour cette mise. Crée une salle si tu veux ouvrir une table.");
        return null;
      }

      return matchingRooms[0];
    } catch (err) {
      console.error("[LobbyContext] findAvailableRoom error:", err);
      setRoomError("Impossible de charger les salles disponibles.");
      return null;
    }
  }, [user]);

  /* Démarrer l'écoute publique au mount */
  useEffect(() => {
    searchRooms();
    return () => {
      unsubPublic.current?.();
      unsubRoom.current?.();
    };
  }, [searchRooms]);

  /* ── Si currentRoom passe à "playing" → nettoyage ── */
  useEffect(() => {
    if (currentRoom?.status === "playing") {
      unsubRoom.current?.();
      unsubRoom.current = null;
    }
  }, [currentRoom?.status]);

  /* ── Créer une salle ── */
  const createRoom = useCallback(async (stake: number, maxPlayers: number, roomType: "online" | "friends" = "online"): Promise<string> => {
    if (!user) {
      setRoomError("Tu dois être connecté pour créer une salle.");
      throw new Error("Non connecté");
    }
    setRoomError(null);

    // Validation: stake doit être valide
    if (![100, 250, 500].includes(stake)) {
      setRoomError("Mise invalide.");
      throw new Error("Mise invalide");
    }
    // Validation: nombre de joueurs
    if (![2, 3, 4].includes(maxPlayers)) {
      setRoomError("Nombre de joueurs invalide.");
      throw new Error("Nombre de joueurs invalide");
    }

    const player: RoomPlayer = {
      uid: user.uid,
      name: user.name,
      emoji: user.emoji,
      ready: true,
      balance: 5000,
      joinedAt: Date.now(),
    };

    const roomData: Omit<RoomDoc, "id"> = {
      code: generateCode(),
      hostId: user.uid,
      stake,
      status: "waiting" as const,
      roomType,
      maxPlayers,
      players: [player],
      playerUids: [user.uid],
      createdAt: Date.now(),
    };

    try {
      const docRef = await addDoc(collection(db, "rooms"), roomData);
      const roomId = docRef.id;
      setCurrentRoom({ id: roomId, ...roomData });
      listenRoom(roomId);
      return roomId;
    } catch (err) {
      console.error("[LobbyContext] createRoom error:", err);
      setRoomError("Impossible de créer la salle. Réessaie.");
      throw err;
    }
  }, [user, listenRoom]);

  /* ── Rejoindre par ID ── */
  const joinRoomById = useCallback(async (roomId: string): Promise<boolean> => {
    if (!user) throw new Error("Non connecté");
    setRoomError(null);

    const player: RoomPlayer = {
      uid: user.uid,
      name: user.name,
      emoji: user.emoji,
      ready: false,
      balance: 5000,
      joinedAt: Date.now(),
    };

    const roomRef = doc(db, "rooms", roomId);
    let joinedRoom: RoomDoc;

    try {
      joinedRoom = await runTransaction(db, async (transaction) => {
        const roomSnap = await transaction.get(roomRef);

        if (!roomSnap.exists()) {
          throw new Error("Cette salle n'existe plus.");
        }

        const room = { id: roomSnap.id, ...roomSnap.data() } as RoomDoc;
        const players = Array.isArray(room.players) ? room.players : [];

        if (players.some((p) => p.uid === user.uid)) {
          const updatedPlayers = players.map((p) =>
            p.uid === user.uid
              ? { ...p, name: user.name, emoji: user.emoji }
              : p,
          );
          transaction.update(roomRef, {
            players: updatedPlayers,
            playerUids: updatedPlayers.map((p) => p.uid),
          });
          return { ...room, players: updatedPlayers, playerUids: updatedPlayers.map((p) => p.uid) };
        }

        if (room.status !== "waiting") {
          throw new Error("La partie a déjà commencé.");
        }

        if (players.length >= room.maxPlayers) {
          throw new Error("La salle est pleine.");
        }

        // Validation: la mise de la room est-elle valide ?
        if (room.stake && ![100, 250, 500].includes(room.stake)) {
          throw new Error("Mise invalide dans cette salle.");
        }

        const updatedPlayers = [...players, player];
        transaction.update(roomRef, {
          players: updatedPlayers,
          playerUids: updatedPlayers.map((p) => p.uid),
        });

        return { ...room, players: updatedPlayers, playerUids: updatedPlayers.map((p) => p.uid) };
      });
    } catch (err) {
      const message = err instanceof Error && err.message
        ? err.message
        : "Erreur en rejoignant la salle. Réessaie.";
      console.error("[LobbyContext] joinRoomById error:", err);
      setRoomError(message);
      return false;
    }

    setCurrentRoom(joinedRoom);
    listenRoom(roomId);
    return true;
  }, [user, listenRoom]);

  /* ── Rejoindre par code ── */
  const joinRoomByCode = useCallback(async (code: string): Promise<string | null> => {
    if (!user) throw new Error("Non connecté");
    setRoomError(null);

    const q = query(collection(db, "rooms"), where("code", "==", code.toUpperCase()));
    const snap = await getDocs(q);

    if (snap.empty) {
      setRoomError("Aucune salle trouvée avec ce code.");
      return null;
    }

    const roomId = snap.docs[0].id;
    const joined = await joinRoomById(roomId);
    return joined ? roomId : null;
  }, [user, joinRoomById]);

  /* ── Salle "playing" la plus récente où je figure (lecture seule) ── */
  const findMyPlayingRoom = useCallback(async (): Promise<RoomDoc | null> => {
    if (!user) return null;
    const q = query(collection(db, "rooms"), where("status", "==", "playing"));
    const snap = await getDocs(q);
    const rooms = snap.docs
      .map(roomFromDoc)
      .filter((room) =>
        room.playerUids?.includes(user.uid)
        || room.players?.some((p) => p.uid === user.uid),
      )
      .sort((a, b) => b.createdAt - a.createdAt);
    return rooms[0] ?? null;
  }, [user]);

  /* ── Indice Reprendre : rafraîchi au login et à la demande (retour menu) ── */
  const refreshActiveRoomHint = useCallback(() => {
    if (!user) {
      setActiveRoomHint(null);
      return;
    }
    findMyPlayingRoom()
      .then((room) => {
        setActiveRoomHint(room
          ? { id: room.id, roomType: room.roomType === "friends" ? "friends" : "online" }
          : null);
      })
      .catch(() => setActiveRoomHint(null));
  }, [user, findMyPlayingRoom]);

  useEffect(() => {
    refreshActiveRoomHint();
  }, [refreshActiveRoomHint]);

  const resumeActiveRoom = useCallback(async (): Promise<RoomDoc | null> => {
    if (!user) throw new Error("Non connecté");
    setRoomError(null);

    try {
      const room = await findMyPlayingRoom();
      if (!room) {
        setActiveRoomHint(null);
        setRoomError("Aucune partie en cours à reprendre.");
        return null;
      }

      const updatedPlayers = room.players.map((p) =>
        p.uid === user.uid
          ? { ...p, name: user.name, emoji: user.emoji }
          : p,
      );
      const hydratedRoom = {
        ...room,
        players: updatedPlayers,
        playerUids: updatedPlayers.map((p) => p.uid),
      };

      await updateDoc(doc(db, "rooms", room.id), {
        players: updatedPlayers,
        playerUids: hydratedRoom.playerUids,
      });

      setCurrentRoom(hydratedRoom);
      listenRoom(room.id);
      return hydratedRoom;
    } catch (err) {
      console.error("[LobbyContext] resumeActiveRoom error:", err);
      setRoomError("Impossible de reprendre la partie.");
      return null;
    }
  }, [user, listenRoom, findMyPlayingRoom]);

  /* ── Quitter la salle ── */
  const leaveRoom = useCallback(async () => {
    if (!user || !currentRoom) return;
    const roomRef = doc(db, "rooms", currentRoom.id);

    const isHost = currentRoom.hostId === user.uid;

    if (isHost) {
      await deleteDoc(roomRef);
    } else {
      const remaining = currentRoom.players.filter((p) => p.uid !== user.uid);
      if (remaining.length === 0) {
        await deleteDoc(roomRef);
      } else {
        await updateDoc(roomRef, { players: remaining });
      }
    }

    unsubRoom.current?.();
    setCurrentRoom(null);
  }, [user, currentRoom]);

  /* ── Changer le statut "prêt" ── */
  const setReady = useCallback(async (ready: boolean) => {
    if (!user || !currentRoom) return;
    const roomRef = doc(db, "rooms", currentRoom.id);

    const updatedPlayers = currentRoom.players.map((p) =>
      p.uid === user.uid ? { ...p, ready } : p,
    );

    await updateDoc(roomRef, { players: updatedPlayers });
  }, [user, currentRoom]);

  /* ── Lancer la partie (host only) ── */
  const startGame = useCallback(async () => {
    if (!user || !currentRoom) return;
    if (currentRoom.hostId !== user.uid) {
      setRoomError("Seul l'hôte peut lancer la partie.");
      return;
    }

    const guestsReady = currentRoom.players
      .filter((p) => p.uid !== currentRoom.hostId)
      .every((p) => p.ready);
    if (!guestsReady) {
      setRoomError("Tous les autres joueurs doivent être prêts.");
      return;
    }

    if (currentRoom.players.length < 2) {
      setRoomError("Il faut au moins 2 joueurs.");
      return;
    }

    const roomRef = doc(db, "rooms", currentRoom.id);
    await updateDoc(roomRef, {
      status: "playing",
      playerUids: currentRoom.players.map((p) => p.uid),
    });
  }, [user, currentRoom]);

  return (
    <LobbyContext.Provider
      value={{
        currentRoom,
        roomError,
        clearError,
        createRoom,
        joinRoomByCode,
        joinRoomById,
        leaveRoom,
        setReady,
        startGame,
        resumeActiveRoom,
        activeRoomHint,
        refreshActiveRoomHint,
        publicRooms,
        searchRooms,
        findAvailableRoom,
      }}
    >
      {children}
    </LobbyContext.Provider>
  );
}

/* ═══════════════ Hook public ═══════════════ */

export function useLobby(): LobbyContextValue {
  const ctx = useContext(LobbyContext);
  if (!ctx) throw new Error("useLobby must be used inside <LobbyProvider>");
  return ctx;
}
