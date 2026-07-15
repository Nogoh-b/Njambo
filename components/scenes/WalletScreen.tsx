"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, limit, onSnapshot, orderBy, query } from "@/lib/firestoreClient";
import { useAuth } from "@/hooks/useAuth";
import { useEconomy } from "@/contexts/EconomyContext";
import { useGame } from "@/contexts/GameContext";
import { db } from "@/lib/firebase";
import { t } from "@/lib/i18n";
import { GameHubLayout } from "@/components/ui/GameHubLayout";
import { EmptyState, GameTabs, RankBadge, ResourcePill, Skeleton, StatusBanner } from "@/components/ui/GamePrimitives";
import { NjamboIcon, type NjamboIconName } from "@/components/ui/Art";
import styles from "./GameHubs.module.css";

type LedgerFilter = "all" | "nkap" | "cauris";
type FirestoreDate = number | { seconds?: number; toMillis?: () => number };

interface LedgerEntry {
  id: string;
  command?: string;
  createdAt?: FirestoreDate;
  delta?: { nkap?: number; cauris?: number };
}

const LEDGER_FILTERS = [
  { id: "all", label: "Tout" },
  { id: "nkap", label: "Nkap", icon: "coin" as const },
  { id: "cauris", label: "Cauris", icon: "sparkle" as const },
];

const COMMAND_LABELS: Record<string, { label: string; icon: NjamboIconName }> = {
  claimDailyReward: { label: "Bonus quotidien", icon: "sparkle" },
  purchaseOffer: { label: "Achat dans la boutique", icon: "coin" },
  openBoosterBook: { label: "Ouverture d’un livre", icon: "cards" },
  chooseBoosterCard: { label: "Carte choisie", icon: "cards" },
  buyDailyGridSlot: { label: "Carte de la grille du jour", icon: "cards" },
  spinLoyaltyWheel: { label: "Gain de la roulette", icon: "history" },
  joinEvent: { label: "Entrée dans le Ter", icon: "trophy" },
  leaveEvent: { label: "Sortie du Ter", icon: "trophy" },
  startMatch: { label: "Début de partie", icon: "play" },
  abandonMatch: { label: "Partie abandonnée", icon: "play" },
  settleMatch: { label: "Résultat de partie", icon: "trophy" },
  createPaymentIntent: { label: "Commande créée", icon: "coin" },
  verifyStorePurchase: { label: "Achat simulé confirmé", icon: "check" },
  refundPayment: { label: "Remboursement", icon: "history" },
  migration: { label: "Solde transféré vers Njambo", icon: "history" },
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
  return new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "Africa/Douala" }).format(date);
}

function commandDetails(command?: string) {
  return COMMAND_LABELS[command ?? ""] ?? { label: "Mouvement du portefeuille", icon: "history" as const };
}

export function WalletScreen() {
  const { navigateTo } = useGame();
  const { user } = useAuth();
  const { economy, rank, loading, error } = useEconomy();
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [filter, setFilter] = useState<LedgerFilter>("all");
  const [ledgerLoading, setLedgerLoading] = useState(true);
  const [ledgerError, setLedgerError] = useState<string | null>(null);

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
  const energyValue = energy?.unlimited ? "∞" : energy?.available ?? "—";
  const energyDetail = energy?.unlimited
    ? `Illimitée jusqu’à ${new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(energy.unlimitedUntil)}`
    : energy?.available === 100
      ? "Jauge pleine"
      : energy?.nextUnitAt
        ? `Prochain point à ${new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(energy.nextUnitAt)}`
        : "1 point par minute";

  return (
    <GameHubLayout
      tone="wallet"
      active="shop"
      kicker={t("wallet.kicker")}
      title={t("wallet.title")}
      subtitle={t("wallet.subtitle")}
      headerAction={<RankBadge label={rank.badge.label} crowns={rank.crowns} compact />}
    >
      {(error || ledgerError) && <StatusBanner severity="error">{ledgerError ?? "Ton économie est temporairement indisponible."}</StatusBanner>}
      {economy?.debtCauris ? (
        <StatusBanner severity="error">
          <strong>Dette de {economy.debtCauris} cauris.</strong> Les dépenses sont bloquées jusqu’à régularisation, mais tes gains continuent d’être comptés.
        </StatusBanner>
      ) : null}

      {loading && !economy ? (
        <div className={styles.walletSkeleton} aria-label="Chargement du portefeuille">
          {Array.from({ length: 4 }, (_, index) => <Skeleton className={styles.counterSkeleton} key={index} />)}
        </div>
      ) : (
        <section className={styles.resourceGrid} aria-label="Soldes du portefeuille">
          <div className={`${styles.resourceCounter} ${styles.energyCounter}`}>
            <ResourcePill type="energy" label="Énergie" value={energyValue} max={100} detail={energyDetail} />
          </div>
          <div className={`${styles.resourceCounter} ${styles.nkapCounter}`}>
            <ResourcePill type="nkap" label="Nkap" value={economy?.nkap.toLocaleString("fr-FR") ?? "—"} detail="Monnaie des parties" />
          </div>
          <div className={`${styles.resourceCounter} ${styles.caurisCounter}`}>
            <ResourcePill type="cauris" label="Cauris" value={economy?.cauris ?? "—"} detail="Monnaie premium" />
          </div>
          <div className={`${styles.resourceCounter} ${styles.crownsCounter}`}>
            <ResourcePill type="crowns" label="Couronnes" value={rank.crowns.toLocaleString("fr-FR")} detail={rank.badge.label} />
          </div>
        </section>
      )}

      <section className={styles.energyPanel} aria-labelledby="energy-title">
        <span className={styles.energyOrb}><NjamboIcon name="spark" tone="teal" size={28} /></span>
        <div className={styles.energyCopy}>
          <div><span className={styles.eyebrow}>Recharge naturelle</span><h2 id="energy-title">{energy?.unlimited ? "Pass illimité actif" : "Ta réserve d’énergie"}</h2></div>
          <span className={styles.energyValue}>{energy?.unlimited ? "∞" : `${energy?.available ?? 0} / 100`}</span>
          <div className={styles.energyTrack} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={energy?.unlimited ? 100 : energy?.available ?? 0} aria-label="Niveau d’énergie">
            <span style={{ width: `${energy?.unlimited ? 100 : energy?.available ?? 0}%` }} />
          </div>
          <small>{energyDetail}</small>
        </div>
      </section>

      <section className={styles.ledgerSection} aria-labelledby="ledger-title">
        <div className={styles.ledgerHeading}>
          <div><span className={styles.eyebrow}>Journal sécurisé</span><h2 id="ledger-title">Derniers mouvements</h2></div>
          <div className={styles.ledgerFilters}>
            <GameTabs tabs={LEDGER_FILTERS} activeId={filter} onChange={(next) => setFilter(next as LedgerFilter)} ariaLabel="Filtrer l’historique" />
          </div>
        </div>

        {ledgerLoading ? (
          <div className={styles.ledgerSkeleton} aria-label="Chargement de l’historique">
            {Array.from({ length: 4 }, (_, index) => <Skeleton className={styles.rowSkeleton} key={index} />)}
          </div>
        ) : groupedEntries.length ? (
          <div className={styles.ledgerGroups}>
            {groupedEntries.map((group) => (
              <section className={styles.ledgerGroup} key={dayKey(group.date)}>
                <h3>{dayLabel(group.date)}</h3>
                <div className={styles.ledgerList}>
                  {group.entries.map((entry) => {
                    const details = commandDetails(entry.command);
                    const hasCredit = (entry.delta?.nkap ?? 0) > 0 || (entry.delta?.cauris ?? 0) > 0;
                    const hasDebit = (entry.delta?.nkap ?? 0) < 0 || (entry.delta?.cauris ?? 0) < 0;
                    return (
                      <article className={styles.ledgerRow} key={entry.id}>
                        <span className={`${styles.ledgerIcon} ${hasCredit ? styles.creditIcon : hasDebit ? styles.debitIcon : ""}`}>
                          <NjamboIcon name={details.icon} tone={hasCredit ? "teal" : hasDebit ? "pink" : "gold"} size={21} />
                        </span>
                        <span className={styles.ledgerCopy}>
                          <strong>{details.label}</strong>
                          <small>{new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Douala" }).format(entryDate(entry.createdAt))}</small>
                        </span>
                        <span className={styles.ledgerAmounts}>
                          {entry.delta?.nkap ? <strong className={entry.delta.nkap > 0 ? styles.credit : styles.debit}>{entry.delta.nkap > 0 ? "+" : ""}{entry.delta.nkap.toLocaleString("fr-FR")} <small>Nkap</small></strong> : null}
                          {entry.delta?.cauris ? <strong className={entry.delta.cauris > 0 ? styles.credit : styles.debit}>{entry.delta.cauris > 0 ? "+" : ""}{entry.delta.cauris.toLocaleString("fr-FR")} <small>cauris</small></strong> : null}
                        </span>
                      </article>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <EmptyState
            icon="history"
            title={!user || user.isAnonymous ? "Historique réservé au compte permanent" : filter === "all" ? "Ton journal est encore vide" : `Aucun mouvement en ${filter}`}
            description={!user || user.isAnonymous ? "Crée un compte pour synchroniser et retrouver toutes tes opérations." : "Tes gains, achats et mises apparaîtront ici dès leur confirmation."}
            action={!user || user.isAnonymous ? <button data-nj-skin="dark" type="button" className={styles.bannerButton} onClick={() => navigateTo("profile")}>Créer mon compte</button> : undefined}
          />
        )}
      </section>
    </GameHubLayout>
  );
}
