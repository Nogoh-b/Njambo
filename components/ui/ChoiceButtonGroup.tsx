"use client";

import type { ReactNode } from "react";
import {
  Btn,
  type BtnFill,
  type BtnMotif,
  type BtnMotifSides,
  type BtnTone,
} from "./Btn";
import styles from "./ChoiceButtonGroup.module.css";

type ChoiceValue = string | number;

export interface ChoiceButtonOption<T extends ChoiceValue> {
  value: T;
  content: ReactNode;
  ariaLabel?: string;
  className?: string;
  disabled?: boolean;
}

interface ChoiceButtonGroupProps<T extends ChoiceValue> {
  legend: ReactNode;
  options: readonly ChoiceButtonOption<T>[];
  value: T;
  onChange: (value: T) => void;
  tone: BtnTone;
  selectedFill?: BtnFill;
  idleFill?: BtnFill;
  motif?: BtnMotif;
  motifSides?: BtnMotifSides;
  className?: string;
  gridClassName?: string;
  buttonClassName?: string;
  disabled?: boolean;
}

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

/**
 * Gère une sélection exclusive ; Btn reste l'unique source de son design.
 * L'écran fournit seulement les données, la couleur et les côtés du Ndop.
 */
export function ChoiceButtonGroup<T extends ChoiceValue>({
  legend,
  options,
  value,
  onChange,
  tone,
  selectedFill = "soft",
  idleFill = "outline",
  motif = "indigo-dots",
  motifSides = "both",
  className,
  gridClassName,
  buttonClassName,
  disabled = false,
}: ChoiceButtonGroupProps<T>) {
  return (
    <fieldset className={cx(styles.set, className)}>
      <legend className={styles.legend}>{legend}</legend>
      <div className={cx(styles.grid, gridClassName)}>
        {options.map((option) => {
          const selected = value === option.value;
          return (
            <Btn
              key={option.value}
              tone={tone}
              fill={selected ? selectedFill : idleFill}
              motif={motif}
              motifSides={motifSides}
              ariaLabel={option.ariaLabel}
              ariaPressed={selected}
              disabled={disabled || option.disabled}
              onClick={() => onChange(option.value)}
              className={cx(styles.button, buttonClassName, option.className)}
            >
              {option.content}
            </Btn>
          );
        })}
      </div>
    </fieldset>
  );
}
