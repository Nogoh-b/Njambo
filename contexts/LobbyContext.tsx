"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  where,
  type Unsubscribe,
} from "@/lib/firestoreClient";
import { db } from "@/lib/firebase";
import { callBackend } from "@/lib/backend";
import { useAuth } from "@/hooks/useAuth";
import type { RoomDoc } from "@/types/game";

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
  searchRooms: (filters?: RoomFilters) => () => void;
  findAvailableRoom: (filters?: RoomFilters) => Promise<RoomDoc | null>;
}

const LobbyContext = createContext<LobbyContextValue | null>(null);

/* ── Helpers ── */

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
    return () => {
      unsubPublic.current?.();
      unsubPublic.current = null;
      setPublicRooms([]);
    };
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

      // Priorité aux tables à la mise choisie, mais on ne laisse jamais un
      // joueur sur le carreau si une table à une autre mise attend du monde
      // (la mise réelle est celle de la salle, comme pour un clic direct).
      const candidates = matchingRooms.length > 0 ? matchingRooms : allRooms;
      if (candidates.length === 0) {
        setRoomError("Aucune table disponible. Crée une salle si tu veux ouvrir une table.");
        return null;
      }

      return candidates[0];
    } catch (err) {
      console.error("[LobbyContext] findAvailableRoom error:", err);
      setRoomError("Impossible de charger les salles disponibles.");
      return null;
    }
  }, [user]);

  /* La liste publique est activée uniquement par l'écran de recherche. */
  useEffect(() => {
    return () => {
      unsubPublic.current?.();
      unsubRoom.current?.();
    };
  }, []);

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

    try {
      const response = await callBackend<{ roomId: string; room: RoomDoc }>("createRoom", {
        stake,
        maxPlayers,
        roomType,
        name: user.name,
        emoji: user.emoji,
      });
      setCurrentRoom(response.data.room);
      listenRoom(response.data.roomId);
      return response.data.roomId;
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

    try {
      const response = await callBackend<{ roomId: string; room: RoomDoc }>("joinRoom", {
        roomId,
        name: user.name,
        emoji: user.emoji,
      });
      setCurrentRoom(response.data.room);
    } catch (err) {
      const message = err instanceof Error && err.message
        ? err.message
        : "Erreur en rejoignant la salle. Réessaie.";
      console.error("[LobbyContext] joinRoomById error:", err);
      setRoomError(message);
      return false;
    }

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

  /* ── Salle "playing" la plus récente où je figure (lecture seule).
     array-contains sur playerUids : on ne lit que MES salles (index
     mono-champ automatique) au lieu de scanner toutes les salles
     "playing" du backend ; le statut se filtre côté client. ── */
  const findMyPlayingRoom = useCallback(async (): Promise<RoomDoc | null> => {
    if (!user) return null;
    const q = query(collection(db, "rooms"), where("playerUids", "array-contains", user.uid));
    const snap = await getDocs(q);
    const rooms = snap.docs
      .map(roomFromDoc)
      .filter((room) => room.status === "playing")
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

      const response = await callBackend<{ roomId: string; room: RoomDoc }>("refreshRoomPlayer", {
        roomId: room.id,
        name: user.name,
        emoji: user.emoji,
      });

      setCurrentRoom(response.data.room);
      listenRoom(room.id);
      return response.data.room;
    } catch (err) {
      console.error("[LobbyContext] resumeActiveRoom error:", err);
      setRoomError("Impossible de reprendre la partie.");
      return null;
    }
  }, [user, listenRoom, findMyPlayingRoom]);

  /* ── Quitter la salle ── */
  const leaveRoom = useCallback(async () => {
    if (!user || !currentRoom) return;
    await callBackend("leaveRoom", { roomId: currentRoom.id });

    unsubRoom.current?.();
    setCurrentRoom(null);
  }, [user, currentRoom]);

  /* ── Changer le statut "prêt" ── */
  const setReady = useCallback(async (ready: boolean) => {
    if (!user || !currentRoom) return;
    await callBackend("setRoomReady", { roomId: currentRoom.id, ready });
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

    await callBackend("startGame", { roomId: currentRoom.id });
  }, [user, currentRoom]);

  const value = useMemo<LobbyContextValue>(() => ({
    currentRoom, roomError, clearError, createRoom, joinRoomByCode, joinRoomById,
    leaveRoom, setReady, startGame, resumeActiveRoom, activeRoomHint,
    refreshActiveRoomHint, publicRooms, searchRooms, findAvailableRoom,
  }), [currentRoom, roomError, clearError, createRoom, joinRoomByCode, joinRoomById, leaveRoom, setReady, startGame, resumeActiveRoom, activeRoomHint, refreshActiveRoomHint, publicRooms, searchRooms, findAvailableRoom]);

  return (
    <LobbyContext.Provider
      value={value}
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
