"use client";

import Image from "next/image";
import {
  useId,
  useRef,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEventHandler,
  type ReactNode,
} from "react";
import { NjamboIcon, type NjamboIconName } from "@/components/ui/Art";
import styles from "./GamePrimitives.module.css";

export type GameTone = "gold" | "teal" | "pink" | "cobalt";

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function formatAmount(value: ReactNode) {
  return typeof value === "number" ? new Intl.NumberFormat("fr-FR").format(value) : value;
}

export interface GameCardProps {
  children: ReactNode;
  className?: string;
  tone?: GameTone;
  variant?: "default" | "raised" | "featured";
  interactive?: boolean;
  selected?: boolean;
  disabled?: boolean;
  onClick?: MouseEventHandler<HTMLButtonElement>;
  ariaLabel?: string;
}

export interface GameModeCardProps {
  image: string;
  children: ReactNode;
  className?: string;
  imageClassName?: string;
  shadeClassName?: string;
  variant?: "primary" | "secondary";
  locked?: boolean;
  resume?: boolean;
  priority?: boolean;
  sizes?: string;
  surface?: boolean;
  animateIn?: boolean;
}

/** Structure d'image commune aux tables du Home et du hub Jouer. */
export function GameModeCard({
  image,
  children,
  className,
  imageClassName,
  shadeClassName,
  variant = "secondary",
  locked = false,
  resume = false,
  priority = false,
  sizes = "100vw",
  surface = true,
  animateIn = false,
}: GameModeCardProps) {
  const content = (
    <>
      <Image src={image} alt="" fill sizes={sizes} priority={priority} className={imageClassName} aria-hidden="true" />
      {shadeClassName && <span className={shadeClassName} aria-hidden="true" />}
      {children}
    </>
  );

  if (surface) {
    return (
      <GameCard
        variant={variant === "primary" ? "featured" : "raised"}
        className={className}
      >
        {content}
      </GameCard>
    );
  }

  return (
    <article className={className} data-mode-variant={variant} data-locked={locked || undefined} data-resume={resume || undefined} data-home-card={animateIn || undefined}>
      {content}
    </article>
  );
}

/** Surface de jeu commune. Devient un vrai bouton lorsqu'une action est fournie. */
export function GameCard({
  children,
  className,
  tone = "gold",
  variant = "default",
  interactive = false,
  selected = false,
  disabled = false,
  onClick,
  ariaLabel,
}: GameCardProps) {
  const cardClassName = cx(
    styles.card,
    styles[`tone-${tone}`],
    styles[`card-${variant}`],
    (interactive || onClick) && styles.cardInteractive,
    selected && styles.cardSelected,
    className,
  );

  if (onClick) {
    return (
      <button data-nj-skin="none"
        type="button"
        className={cardClassName}
        onClick={onClick}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-pressed={selected || undefined}
      >
        {children}
      </button>
    );
  }

  return (
    <article className={cardClassName} data-disabled={disabled || undefined}>
      {children}
    </article>
  );
}

export type ResourceType = "energy" | "nkap" | "cauris" | "crowns";

const RESOURCE_META: Record<
  ResourceType,
  { label: string; asset: string; tone: GameTone }
> = {
  energy: { label: "Énergie", asset: "/assets/njambo/economy/energy-flask-64.webp", tone: "teal" },
  nkap: { label: "Nkap", asset: "/assets/njambo/economy/nkap-64.webp", tone: "gold" },
  cauris: { label: "Cauris", asset: "/assets/njambo/economy/cauri-64.webp", tone: "cobalt" },
  crowns: { label: "Couronnes", asset: "/assets/njambo/ranks/rank-mboa-64.webp", tone: "pink" },
};

export interface ResourcePillProps {
  type: ResourceType;
  value: ReactNode;
  label?: string;
  detail?: ReactNode;
  max?: number;
  progress?: number;
  compact?: boolean;
  className?: string;
  onClick?: MouseEventHandler<HTMLButtonElement>;
  ariaLabel?: string;
}

/** Compteur économique lisible, avec jauge facultative pour l'énergie. */
export function ResourcePill({
  type,
  value,
  label,
  detail,
  max,
  progress,
  compact = false,
  className,
  onClick,
  ariaLabel,
}: ResourcePillProps) {
  const meta = RESOURCE_META[type];
  const numericValue = typeof value === "number" ? value : undefined;
  const rawProgress = progress ?? (numericValue !== undefined && max ? (numericValue / max) * 100 : undefined);
  const normalizedProgress = rawProgress === undefined ? undefined : Math.min(100, Math.max(0, rawProgress));
  const content = (
    <>
      <span className={styles.resourceIcon} aria-hidden="true">
        <Image src={meta.asset} alt="" width={compact ? 27 : 32} height={compact ? 27 : 32} />
      </span>
      <span className={styles.resourceCopy}>
        <span className={styles.resourceLabel}>{label ?? meta.label}</span>
        <strong className={styles.resourceValue}>{formatAmount(value)}</strong>
        {detail !== undefined && <span className={styles.resourceDetail}>{detail}</span>}
      </span>
      {normalizedProgress !== undefined && (
        <span
          className={styles.resourceTrack}
          role="progressbar"
          aria-label={`${label ?? meta.label} disponible`}
          aria-valuemin={0}
          aria-valuemax={max ?? 100}
          aria-valuenow={numericValue ?? normalizedProgress}
        >
          <span
            className={styles.resourceFill}
            style={{ "--nj-resource-progress": `${normalizedProgress}%` } as CSSProperties}
          />
        </span>
      )}
    </>
  );
  const pillClassName = cx(
    styles.resource,
    styles[`tone-${meta.tone}`],
    compact && styles.resourceCompact,
    onClick && styles.resourceInteractive,
    className,
  );

  return onClick ? (
    <button data-nj-skin="none"
      type="button"
      className={pillClassName}
      onClick={onClick}
      aria-label={ariaLabel ?? `${label ?? meta.label} : ${String(value)}`}
    >
      {content}
    </button>
  ) : (
    <div className={pillClassName}>{content}</div>
  );
}

export interface RankBadgeProps {
  label: string;
  crowns?: number;
  level?: ReactNode;
  compact?: boolean;
  className?: string;
}

const RANK_ASSETS: Array<[RegExp, string]> = [
  [/braise/i, "rank-braise"],
  [/mboa/i, "rank-mboa"],
  [/notable/i, "rank-notable"],
  [/chef/i, "rank-chef-table"],
  [/tambour/i, "rank-tambour"],
  [/légende|legende|237/i, "rank-legende-237"],
  [/ancêtre|ancetre/i, "rank-ancetre"],
];

function rankAsset(label: string) {
  return RANK_ASSETS.find(([pattern]) => pattern.test(label))?.[1] ?? "rank-mboa";
}

export function RankBadge({ label, crowns, level, compact = false, className }: RankBadgeProps) {
  return (
    <div className={cx(styles.rankBadge, compact && styles.rankBadgeCompact, className)}>
      <span className={styles.rankIcon} aria-hidden="true">
        <Image
          src={`/assets/njambo/ranks/${rankAsset(label)}-${compact ? 64 : 128}.webp`}
          alt=""
          width={compact ? 34 : 43}
          height={compact ? 34 : 43}
        />
      </span>
      <span className={styles.rankCopy}>
        {level !== undefined && <span className={styles.rankLevel}>{level}</span>}
        <strong>{label}</strong>
        {crowns !== undefined && <span>{formatAmount(crowns)} couronnes</span>}
      </span>
    </div>
  );
}

export type TicketKind = "bronze" | "silver" | "gold" | "argent" | "or";

export interface TicketBadgeProps {
  kind: TicketKind;
  count?: number;
  label?: string;
  compact?: boolean;
  className?: string;
}

const TICKET_LABELS: Record<TicketKind, string> = {
  bronze: "Bronze",
  silver: "Argent",
  argent: "Argent",
  gold: "Or",
  or: "Or",
};

export function TicketBadge({ kind, count, label, compact = false, className }: TicketBadgeProps) {
  const normalizedKind = kind === "argent" ? "silver" : kind === "or" ? "gold" : kind;
  const assetKind = normalizedKind === "silver" ? "argent" : normalizedKind === "gold" ? "or" : "bronze";
  return (
    <span className={cx(styles.ticket, styles[`ticket-${normalizedKind}`], compact && styles.ticketCompact, className)}>
      <span className={styles.ticketNotch} aria-hidden="true" />
      <Image
        className={styles.ticketArt}
        src={`/assets/njambo/tickets/ticket-${assetKind}-64.webp`}
        alt=""
        width={compact ? 24 : 29}
        height={compact ? 24 : 29}
        aria-hidden="true"
      />
      <span>{label ?? TICKET_LABELS[kind]}</span>
      {count !== undefined && <strong>×{formatAmount(count)}</strong>}
    </span>
  );
}

export interface GameTab {
  id: string;
  label: ReactNode;
  badge?: ReactNode;
  disabled?: boolean;
}

export interface GameTabsProps {
  tabs: GameTab[];
  activeId: string;
  onChange: (id: string) => void;
  ariaLabel: string;
  className?: string;
}

/** Onglets accessibles au clavier (flèches, début et fin). */
export function GameTabs({ tabs, activeId, onChange, ariaLabel, className }: GameTabsProps) {
  const generatedId = useId().replaceAll(":", "");
  const buttonRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  function activateByKeyboard(event: KeyboardEvent<HTMLButtonElement>, currentIndex: number) {
    const enabledTabs = tabs
      .map((tab, index) => ({ tab, index }))
      .filter(({ tab }) => !tab.disabled);
    const enabledIndex = enabledTabs.findIndex(({ index }) => index === currentIndex);
    if (enabledIndex < 0) return;

    let targetIndex: number | undefined;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      targetIndex = (enabledIndex + 1) % enabledTabs.length;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      targetIndex = (enabledIndex - 1 + enabledTabs.length) % enabledTabs.length;
    } else if (event.key === "Home") {
      targetIndex = 0;
    } else if (event.key === "End") {
      targetIndex = enabledTabs.length - 1;
    }

    if (targetIndex === undefined) return;
    event.preventDefault();
    const target = enabledTabs[targetIndex].tab;
    onChange(target.id);
    buttonRefs.current[target.id]?.focus();
  }

  return (
    <div className={cx(styles.tabs, className)} role="tablist" aria-label={ariaLabel}>
      {tabs.map((tab, index) => {
        const isActive = tab.id === activeId;
        return (
          <button data-nj-skin="none"
            key={tab.id}
            ref={(node) => {
              buttonRefs.current[tab.id] = node;
            }}
            id={`${generatedId}-${tab.id}-tab`}
            type="button"
            role="tab"
            className={cx(styles.tab, isActive && styles.tabActive)}
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
            disabled={tab.disabled}
            onClick={() => onChange(tab.id)}
            onKeyDown={(event) => activateByKeyboard(event, index)}
          >
            <span>{tab.label}</span>
            {tab.badge !== undefined && <strong>{tab.badge}</strong>}
          </button>
        );
      })}
    </div>
  );
}

export type StatusSeverity = "neutral" | "info" | "success" | "warning" | "error";

const STATUS_ICON: Record<StatusSeverity, { icon: NjamboIconName; tone: "gold" | "teal" | "pink" | "cobalt" | "light" }> = {
  neutral: { icon: "spark", tone: "light" },
  info: { icon: "sparkle", tone: "cobalt" },
  success: { icon: "check", tone: "teal" },
  warning: { icon: "hourglass", tone: "gold" },
  error: { icon: "empty", tone: "pink" },
};

export interface StatusBannerProps {
  severity?: StatusSeverity;
  title?: ReactNode;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function StatusBanner({ severity = "neutral", title, children, action, className }: StatusBannerProps) {
  const meta = STATUS_ICON[severity];
  return (
    <aside
      className={cx(styles.status, styles[`status-${severity}`], className)}
      role={severity === "error" ? "alert" : "status"}
    >
      <span className={styles.statusIcon} aria-hidden="true">
        <NjamboIcon name={meta.icon} tone={meta.tone} size={23} />
      </span>
      <span className={styles.statusCopy}>
        {title !== undefined && <strong>{title}</strong>}
        <span>{children}</span>
      </span>
      {action !== undefined && <span className={styles.statusAction}>{action}</span>}
    </aside>
  );
}

export interface RewardPreviewProps {
  label: ReactNode;
  amount?: ReactNode;
  detail?: ReactNode;
  icon?: NjamboIconName;
  tone?: GameTone;
  visual?: ReactNode;
  className?: string;
}

export function RewardPreview({
  label,
  amount,
  detail,
  icon = "sparkle",
  tone = "gold",
  visual,
  className,
}: RewardPreviewProps) {
  return (
    <div className={cx(styles.reward, styles[`tone-${tone}`], className)}>
      <span className={styles.rewardVisual} aria-hidden="true">
        {visual ?? <NjamboIcon name={icon} tone={tone} size={28} />}
      </span>
      <span className={styles.rewardCopy}>
        <span>{label}</span>
        {amount !== undefined && <strong>{formatAmount(amount)}</strong>}
        {detail !== undefined && <small>{detail}</small>}
      </span>
    </div>
  );
}

export interface EmptyStateProps {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  icon?: NjamboIconName;
  tone?: GameTone;
  className?: string;
}

export function EmptyState({
  title,
  description,
  action,
  icon = "empty",
  tone = "gold",
  className,
}: EmptyStateProps) {
  return (
    <section className={cx(styles.empty, styles[`tone-${tone}`], className)}>
      <span className={styles.emptyIcon} aria-hidden="true">
        <NjamboIcon name={icon} tone={tone} size={40} />
      </span>
      <h2>{title}</h2>
      {description !== undefined && <p>{description}</p>}
      {action !== undefined && <div className={styles.emptyAction}>{action}</div>}
    </section>
  );
}

export interface SkeletonProps {
  width?: CSSProperties["width"];
  height?: CSSProperties["height"];
  radius?: CSSProperties["borderRadius"];
  lines?: number;
  label?: string;
  className?: string;
}

export function Skeleton({
  width,
  height,
  radius,
  lines = 1,
  label = "Chargement…",
  className,
}: SkeletonProps) {
  const skeletonStyle: CSSProperties = { width, height, borderRadius: radius };
  return (
    <span className={cx(styles.skeletonGroup, className)} style={skeletonStyle} role="status" aria-label={label}>
      {Array.from({ length: Math.max(1, lines) }, (_, index) => (
        <span
          key={index}
          className={styles.skeleton}
          style={{
            width: index === lines - 1 && lines > 1 ? "72%" : "100%",
          }}
          aria-hidden="true"
        />
      ))}
    </span>
  );
}
