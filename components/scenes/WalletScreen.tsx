"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { collection, limit, onSnapshot, orderBy, query } from "@/lib/firestoreClient";
import { useAuth } from "@/hooks/useAuth";
import { useEconomy } from "@/contexts/EconomyContext";
import { useGame } from "@/contexts/GameContext";
import { db } from "@/lib/firebase";
import { t } from "@/lib/i18n";
import { rankAssetSrc } from "@/lib/playerRank";
import { GameShell } from "@/components/ui/GameShell";
import { NjamboIcon, type NjamboIconName } from "@/components/ui/Art";
import styles from "./WalletScreen.module.css";

type LedgerFilter = "all" | "nkap" | "cauris";
type FirestoreDate = number | { seconds?: number; toMillis?: () => number };

interface LedgerEntry {
  id: string;
  command?: string;
  createdAt?: FirestoreDate;
  delta?: { nkap?: number; cauris?: number };
}

const LEDGER_FILTERS: Array<{ id: LedgerFilter; label: string }> = [
  { id: "all", label: "Tout" },
  { id: "nkap", label: "Nkap" },
  { id: "cauris", label: "Cauris" },
];

const COMMAND_LABELS: Record<string, { label: string; icon: NjamboIconName }> = {
  claimDailyReward: { label: "Bonus quotidien", icon: "sparkle" },
  purchaseOffer: { label: "Achat boutique", icon: "coin" },
  buyBoosterBook: { label: "Achat d’un livre", icon: "cards" },
  openBoosterBook: { label: "Ouverture d’un livre", icon: "cards" },
  openPack: { label: "Ouverture d’un pack", icon: "sparkle" },
  useEnergyPass: { label: "Pass énergie activé", icon: "sparkle" },
  chooseBoosterCard: { label: "Carte choisie", icon: "cards" },
  buyDailyGridSlot: { label: "Grille du jour", icon: "cards" },
  spinLoyaltyWheel: { label: "Gain roulette", icon: "trophy" },
  joinEvent: { label: "Entrée dans le Ter", icon: "trophy" },
  leaveEvent: { label: "Sortie du Ter", icon: "trophy" },
  startMatch: { label: "Mise de table", icon: "play" },
  abandonMatch: { label: "Partie abandonnée", icon: "play" },
  settleMatch: { label: "Résultat de partie", icon: "trophy" },
  createPaymentIntent: { label: "Commande créée", icon: "coin" },
  verifyStorePurchase: { label: "Achat confirmé", icon: "check" },
  refundPayment: { label: "Remboursement", icon: "history" },
  migration: { label: "Solde transféré", icon: "history" },
};

function entryDate(value?: FirestoreDate) {
  if (typeof value === "number") return new Date(value);
  if (value?.toMillis) return new Date(value.toMillis());
  if (typeof value?.seconds === "number") return new Date(value.seconds * 1_000);
  return new Date(0);
}

function dayKey(date: Date) {
  return new Intl.DateTimeFormat("fr-CA", { timeZone: "Africa/Douala", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function dayLabel(date: Date) {
  const today = new Date();
  const yesterday = new Date(Date.now() - 86_400_000);
  const key = dayKey(date);
  if (key === dayKey(today)) return "Aujourd’hui";
  if (key === dayKey(yesterday)) return "Hier";
  return new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "short", timeZone: "Africa/Douala" }).format(date);
}

export function WalletScreen() {
  const { navigateTo } = useGame();
  const { user } = useAuth();
  const { economy, rank, error } = useEconomy();
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [filter, setFilter] = useState<LedgerFilter>("all");
  const [ledgerLoading, setLedgerLoading] = useState(true);
  const [ledgerError, setLedgerError] = useState<string | null>(null);
  const isGuest = !user || user.isAnonymous;

  useEffect(() => {
    if (!user || user.isAnonymous) {
      setEntries([]);
      setLedgerLoading(false);
      return;
    }
    setLedgerLoading(true);
    setLedgerError(null);
    return onSnapshot(
      query(collection(db, "economies", user.uid, "ledger"), orderBy("createdAt", "desc"), limit(25)),
      (snapshot) => {
        setEntries(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }) as LedgerEntry));
        setLedgerLoading(false);
      },
      () => {
        setLedgerError("L’historique ne peut pas être chargé pour le moment.");
        setLedgerLoading(false);
      },
    );
  }, [user]);

  const groupedEntries = useMemo(() => {
    const visible = entries.filter((entry) => filter === "all" || Boolean(entry.delta?.[filter]));
    const groups = new Map<string, { date: Date; entries: LedgerEntry[] }>();
    visible.forEach((entry) => {
      const date = entryDate(entry.createdAt);
      const key = dayKey(date);
      const current = groups.get(key) ?? { date, entries: [] };
      current.entries.push(entry);
      groups.set(key, current);
    });
    return Array.from(groups.values());
  }, [entries, filter]);

  const energy = economy?.energy;
  const energyPct = energy?.unlimited ? 100 : Math.min(100, Math.max(0, energy?.available ?? 0));
  const energyText = isGuest ? "—" : energy?.unlimited ? "∞" : `${energy?.available ?? 0}/100`;
  const energyHint = isGuest
    ? "Compte invité"
    : energy?.unlimited
      ? "Pass illimité actif"
      : energy?.available === 100
        ? "Jauge pleine"
        : "Recharge +1/min";

  return (
    <GameShell active="shop" dock={false} scroll={false} className={styles.scene} contentClassName={styles.frame}>
      {/* ═══ HUD HAUT ═══ */}
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
            <span className={styles.hudKicker}>{t("wallet.kicker")}</span>
            <h1>{t("wallet.title")}</h1>
          </div>
        </div>

        <button data-nj-skin="none" type="button" className={styles.shopShortcut} onClick={() => navigateTo("shop")}>
          <NjamboIcon name="coin" tone="gold" size={18} />
          <span>Boutique</span>
        </button>
      </header>

      {(error || ledgerError) && (
        <div className={styles.errorStrip} role="alert">{ledgerError ?? "Économie temporairement indisponible."}</div>
      )}

      {/* ═══ COFFRE ROYAL : 4 DEVISES EN 1 BANDEAU UNIFIÉ ═══ */}
      <section className={styles.vaultStrip} aria-label="Soldes du coffre">
        <article className={`${styles.vaultCell} ${styles.cellGold}`}>
          <Image src="/assets/njambo/economy/nkap-stack-64.webp" alt="" width={34} height={34} />
          <div className={styles.cellMeta}>
            <small>Nkap</small>
            <strong>{isGuest ? "—" : (economy?.nkap ?? 0).toLocaleString("fr-FR")}</strong>
            <span>Mises & gains</span>
          </div>
        </article>

        <article className={`${styles.vaultCell} ${styles.cellPink}`}>
          <Image src="/assets/njambo/economy/cauris-pouch-64.webp" alt="" width={34} height={34} />
          <div className={styles.cellMeta}>
            <small>Cauris</small>
            <strong>{isGuest ? "—" : (economy?.cauris ?? 0).toLocaleString("fr-FR")}</strong>
            <span>Boutique & livres</span>
          </div>
        </article>

        <article className={`${styles.vaultCell} ${styles.cellTeal}`}>
          <Image src="/assets/njambo/economy/energy-flask-64.webp" alt="" width={34} height={34} />
          <div className={styles.cellMeta}>
            <small>Énergie</small>
            <strong>{energyText}</strong>
            <div className={styles.energyBar} aria-hidden="true">
              <span style={{ width: `${isGuest ? 0 : energyPct}%` }} />
            </div>
            <span>{energyHint}</span>
          </div>
        </article>

        <article className={`${styles.vaultCell} ${styles.cellCrown}`}>
          <Image src={rankAssetSrc(rank.badge)} alt="" width={34} height={34} />
          <div className={styles.cellMeta}>
            <small>Couronnes</small>
            <strong>{rank.crowns.toLocaleString("fr-FR")}</strong>
            <span>{rank.badge.label}</span>
          </div>
        </article>
      </section>

      {/* ═══ JOURNAL DES MOUVEMENTS (seule cette liste défile) ═══ */}
      <section className={styles.ledgerCard} aria-labelledby="wallet-ledger-title">
        <div className={styles.ledgerHead}>
          <div>
            <span className={styles.ledgerKicker}>Journal sécurisé</span>
            <h2 id="wallet-ledger-title">Derniers mouvements</h2>
          </div>

          <div className={styles.filterPills} role="tablist" aria-label="Filtrer le journal">
            {LEDGER_FILTERS.map((entry) => {
              const active = filter === entry.id;
              return (
                <button
                  key={entry.id}
                  data-nj-skin="none"
                  type="button"
                  role="tab"
                  aria-selected={active}
                  className={`${styles.filterPill}${active ? ` ${styles.filterPillActive}` : ""}`}
                  onClick={() => setFilter(entry.id)}
                >
                  {entry.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className={styles.ledgerBody}>
          {ledgerLoading ? (
            <div className={styles.emptyBox}>Chargement de ton historique…</div>
          ) : groupedEntries.length === 0 ? (
            <div className={styles.emptyBox}>
              <span className={styles.emptyIcon} aria-hidden="true">
                <NjamboIcon name="history" tone="gold" size={32} />
              </span>
              <strong>{isGuest ? "Historique réservé au compte permanent" : "Ton coffre est encore calme"}</strong>
              <p>
                {isGuest
                  ? "Crée un compte pour sauvegarder tes Nkap, Cauris et chaque gain de table."
                  : "Tes gains de manche, cadeaux quotidiens et achats apparaîtront ici."}
              </p>
              {isGuest && (
                <button data-nj-skin="none" type="button" className={styles.createBtn} onClick={() => navigateTo("profile")}>
                  Créer mon compte →
                </button>
              )}
            </div>
          ) : (
            <div className={styles.ledgerScroll}>
              {groupedEntries.map((group) => (
                <div key={dayKey(group.date)} className={styles.dayGroup}>
                  <h3>{dayLabel(group.date)}</h3>
                  <div className={styles.dayRows}>
                    {group.entries.map((entry) => {
                      const info = COMMAND_LABELS[entry.command ?? ""] ?? { label: "Mouvement", icon: "history" as const };
                      const credit = (entry.delta?.nkap ?? 0) > 0 || (entry.delta?.cauris ?? 0) > 0;
                      const debit = (entry.delta?.nkap ?? 0) < 0 || (entry.delta?.cauris ?? 0) < 0;
                      return (
                        <article key={entry.id} className={styles.txRow}>
                          <span className={`${styles.txIcon} ${credit ? styles.txCredit : debit ? styles.txDebit : ""}`}>
                            <NjamboIcon name={info.icon} tone={credit ? "teal" : debit ? "pink" : "gold"} size={19} />
                          </span>
                          <div className={styles.txCopy}>
                            <strong>{info.label}</strong>
                            <small>{new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Douala" }).format(entryDate(entry.createdAt))}</small>
                          </div>
                          <div className={styles.txDeltas}>
                            {entry.delta?.nkap ? (
                              <span className={entry.delta.nkap > 0 ? styles.deltaPlus : styles.deltaMinus}>
                                {entry.delta.nkap > 0 ? "+" : ""}{entry.delta.nkap.toLocaleString("fr-FR")} Nkap
                              </span>
                            ) : null}
                            {entry.delta?.cauris ? (
                              <span className={entry.delta.cauris > 0 ? styles.deltaPlus : styles.deltaMinus}>
                                {entry.delta.cauris > 0 ? "+" : ""}{entry.delta.cauris.toLocaleString("fr-FR")} cauris
                              </span>
                            ) : null}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </GameShell>
  );
}
