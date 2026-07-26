"use client";

import { useId, useRef, type KeyboardEvent, type ReactNode } from "react";
import { Btn, type BtnFill, type BtnSize, type BtnTone } from "./Btn";
import styles from "./TabBar.module.css";

export interface TabBarItem {
  id: string;
  label: ReactNode;
  badge?: ReactNode;
  disabled?: boolean;
  /** Écrase le ton du groupe pour cet onglet précis (ex. un onglet "alerte" en rose dans un groupe vert). */
  tone?: BtnTone;
}

export interface TabBarProps {
  tabs: TabBarItem[];
  activeId: string;
  onChange: (id: string) => void;
  ariaLabel: string;
  /** Ton par défaut des onglets ; chaque `TabBarItem.tone` peut le remplacer. */
  tone: BtnTone;
  selectedFill?: BtnFill;
  idleFill?: BtnFill;
  size?: BtnSize;
  className?: string;
  tabClassName?: string;
}

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

/** Barre d'onglets accessible (clavier : flèches, début, fin), rendue avec Btn — un seul design partagé, coloré par onglet via `tone`. */
export function TabBar({
  tabs,
  activeId,
  onChange,
  ariaLabel,
  tone,
  selectedFill = "solid",
  idleFill = "soft",
  size = "sm",
  className,
  tabClassName,
}: TabBarProps) {
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
    <div className={cx(styles.bar, className)} role="tablist" aria-label={ariaLabel}>
      {tabs.map((tab, index) => {
        const isActive = tab.id === activeId;
        return (
          <Btn
            key={tab.id}
            ref={(node) => {
              buttonRefs.current[tab.id] = node;
            }}
            id={`${generatedId}-${tab.id}-tab`}
            role="tab"
            tone={tab.tone ?? tone}
            fill={isActive ? selectedFill : idleFill}
            size={size}
            ariaSelected={isActive}
            tabIndex={isActive ? 0 : -1}
            disabled={tab.disabled}
            onClick={() => onChange(tab.id)}
            onKeyDown={(event) => activateByKeyboard(event, index)}
            className={cx(styles.tab, tabClassName)}
          >
            {tab.label}
            {tab.badge !== undefined && <strong className={styles.badge}>{tab.badge}</strong>}
          </Btn>
        );
      })}
    </div>
  );
}
