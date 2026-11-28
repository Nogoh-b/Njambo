"use client";

/* Porte d'entrée (A5, D1) : au tout premier lancement, deux gros boutons et un
   lien discret. « Je découvre » mène droit sur la table, sans écran de plus. */

import { useEffect, useRef } from "react";
import { AvatarIllustration, NjamboMark } from "@/components/ui/Art";
import styles from "./EntryDoor.module.css";

interface EntryDoorProps {
  onDiscover: () => void;
  onKnown: () => void;
  onSkip: () => void;
}

export function EntryDoor({ onDiscover, onKnown, onSkip }: EntryDoorProps) {
  const firstButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    firstButton.current?.focus();
  }, []);

  return (
    <div className={styles.backdrop} role="dialog" aria-modal="true" aria-labelledby="nj-entry-title">
      <div className={styles.card}>
        <NjamboMark size={64} />
        <div className={styles.guide}>
          <span className={styles.avatar} aria-hidden="true">
            <AvatarIllustration seed="tonton-rene" size={44} />
          </span>
          <p className={styles.welcome}>
            <strong>Tonton René</strong>
            Bienvenue à la table ! Tu découvres le Njambo, ou tu le joues déjà ?
          </p>
        </div>
        <h1 id="nj-entry-title" className={styles.srOnly}>Bienvenue au Njambo</h1>

        <button ref={firstButton} type="button" data-nj-skin="none" className={`${styles.choice} ${styles.discover}`} onClick={onDiscover}>
          <strong>Je découvre Njambo</strong>
          <small>Quelques minutes sur une vraie table, avec Tonton René</small>
        </button>
        <button type="button" data-nj-skin="none" className={`${styles.choice} ${styles.known}`} onClick={onKnown}>
          <strong>Je connais le Njambo</strong>
          <small>Revois vite les règles et découvre les cartes Pouvoir</small>
        </button>

        <button type="button" data-nj-skin="none" className={styles.skip} onClick={onSkip}>
          Passer
        </button>
      </div>
    </div>
  );
}
