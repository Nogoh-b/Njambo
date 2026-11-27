"use client";

/* ═══════════════ Calque du coach de l'Académie ═══════════════
   Monté une seule fois au niveau de l'application : il vise les zones par
   leurs repères DOM (`data-academy-anchor`, `data-academy-card`,
   `data-power-slot`), sur la table comme ailleurs (A13). Le voile est
   purement visuel : c'est la scène elle-même qui refuse un coup trop tôt ou
   faux. Seuls la bulle et le bouton « Passer » reçoivent les clics. */

import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { Btn } from "@/components/ui/Btn";
import { AvatarIllustration } from "@/components/ui/Art";
import { coachDirector, type AcademyAnchor } from "@/lib/academy/coachDirector";
import { placeBubble, type Box } from "@/lib/academy/placement";
import styles from "./CoachLayer.module.css";

/** Élément à l'écran d'un repère ; null s'il n'est pas (ou plus) affiché. */
export function anchorElement(anchor: AcademyAnchor): Element | null {
  const split = anchor.indexOf(":");
  const kind = split < 0 ? anchor : anchor.slice(0, split);
  const value = split < 0 ? "" : anchor.slice(split + 1);
  const escaped = typeof CSS !== "undefined" && CSS.escape ? CSS.escape(value) : value;
  if (kind === "card") return document.querySelector(`[data-academy-card="${escaped}"]`);
  if (kind === "power") return document.querySelector(`[data-power-slot="${escaped}"]`);
  return document.querySelector(`[data-academy-anchor="${typeof CSS !== "undefined" && CSS.escape ? CSS.escape(anchor) : anchor}"]`);
}

function union(rects: DOMRect[]): DOMRect | null {
  const shown = rects.filter((rect) => rect.width > 0);
  if (shown.length === 0) return null;
  const left = Math.min(...shown.map((rect) => rect.left));
  const top = Math.min(...shown.map((rect) => rect.top));
  return new DOMRect(left, top, Math.max(...shown.map((rect) => rect.right)) - left, Math.max(...shown.map((rect) => rect.bottom)) - top);
}

/** Carte telle qu'on la voit : son cadre et la carte dessinée dedans, inclinée et soulevée. */
const cardRect = (card: Element) => union([card.getBoundingClientRect(), ...(card.firstElementChild ? [card.firstElementChild.getBoundingClientRect()] : [])]);

/** Rectangle d'un repère. La main = toutes ses cartes : une carte jouable est soulevée hors de l'éventail. */
function anchorRect(anchor: AcademyAnchor): DOMRect | null {
  if (anchor === "hand") {
    const cards = [...document.querySelectorAll("[data-academy-card]")].flatMap((card) => cardRect(card) ?? []);
    return union(cards) ?? anchorElement(anchor)?.getBoundingClientRect() ?? null;
  }
  const element = anchorElement(anchor);
  if (!element) return null;
  return anchor.startsWith("card:") ? cardRect(element) : element.getBoundingClientRect();
}

const HOLE_PAD = 8;
const HAND: AcademyAnchor[] = ["hand"];
/** Haut d'écran laissé libre : en-tête de la table et bouton « Passer ». */
const TOP_RESERVE = 92;

const sameBoxes = (a: Box[], b: Box[]) =>
  a.length === b.length && a.every((box, index) => box.left === b[index].left && box.top === b[index].top && box.width === b[index].width && box.height === b[index].height);

/** Rectangles des zones éclairées, suivis à chaque image (les cartes bougent). */
function useAnchorBoxes(anchors: AcademyAnchor[], active: boolean): Box[] {
  const [boxes, setBoxes] = useState<Box[]>([]);
  const key = anchors.join("|");
  useEffect(() => {
    if (!active || !key) {
      setBoxes((current) => (current.length ? [] : current));
      return;
    }
    let frame = 0;
    const measure = () => {
      const next = key.split("|").flatMap((anchor) => {
        const rect = anchorRect(anchor);
        if (!rect || rect.width === 0) return [];
        return [{ left: Math.round(rect.left), top: Math.round(rect.top), width: Math.round(rect.width), height: Math.round(rect.height) }];
      });
      setBoxes((current) => (sameBoxes(current, next) ? current : next));
      frame = requestAnimationFrame(measure);
    };
    measure();
    return () => cancelAnimationFrame(frame);
  }, [active, key]);
  return boxes;
}

function useViewport() {
  const [view, setView] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const update = () => setView({ width: window.innerWidth, height: window.innerHeight });
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  return view;
}

export function CoachLayer() {
  const view = useSyncExternalStore(coachDirector.subscribe, coachDirector.getSnapshot, coachDirector.getServerSnapshot);
  const viewport = useViewport();
  const boxes = useAnchorBoxes(view.focus, view.active);
  // La bulle ne cache pas non plus la main du joueur : il doit voir ses cartes pendant qu'on lui parle.
  const handBoxes = useAnchorBoxes(HAND, view.active);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const [bubbleSize, setBubbleSize] = useState({ width: 0, height: 0 });
  const showBubble = Boolean(view.line || view.end);
  const bubbleKey = view.line?.id ?? (view.end ? "end" : "none");

  // Taille réelle de la bulle (une bulle par réplique) pour la placer.
  useLayoutEffect(() => {
    const node = bubbleRef.current;
    if (!node) return;
    const measure = () => setBubbleSize((current) => (
      current.width === node.offsetWidth && current.height === node.offsetHeight ? current : { width: node.offsetWidth, height: node.offsetHeight }
    ));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [bubbleKey]);

  // Carte refusée : elle tremble sur place (propriété `translate`, sans toucher au `transform` de l'éventail).
  const shake = view.shake;
  useEffect(() => {
    if (!shake) return;
    const element = anchorElement(`card:${shake.cardId}`) as HTMLElement | null;
    element?.animate(
      [{ translate: "0 0" }, { translate: "-7px 0" }, { translate: "7px 0" }, { translate: "-5px 0" }, { translate: "4px 0" }, { translate: "0 0" }],
      { duration: 420, easing: "ease-out" },
    );
  }, [shake]);

  if (!view.active) return null;

  const holes = boxes.map((box) => ({ left: box.left - HOLE_PAD, top: box.top - HOLE_PAD, width: box.width + HOLE_PAD * 2, height: box.height + HOLE_PAD * 2 }));
  const placed = bubbleSize.width > 0 && viewport.width > 0 ? placeBubble(viewport, bubbleSize, [...holes, ...handBoxes], 12, TOP_RESERVE) : null;
  const end = view.end;

  return (
    <div className={styles.layer} aria-live="polite">
      <svg className={`${styles.veil}${view.veil ? ` ${styles.veilOn}` : ""}`} width="100%" height="100%" aria-hidden="true">
        <defs>
          <mask id="nj-academy-holes">
            <rect width="100%" height="100%" fill="white" />
            {holes.map((hole, index) => (
              <rect key={index} x={hole.left} y={hole.top} width={hole.width} height={hole.height} rx={14} fill="black" />
            ))}
          </mask>
        </defs>
        <rect width="100%" height="100%" className={styles.veilFill} mask="url(#nj-academy-holes)" />
        {holes.map((hole, index) => (
          <rect key={index} x={hole.left} y={hole.top} width={hole.width} height={hole.height} rx={14} className={styles.ring} />
        ))}
      </svg>

      <button type="button" data-nj-skin="none" className={styles.skip} onClick={coachDirector.skip}>
        Passer
      </button>

      {showBubble && (
        <div
          ref={bubbleRef}
          key={bubbleKey}
          className={`${styles.bubble}${placed ? "" : ` ${styles.bubbleMeasuring}`}`}
          style={placed ? { left: placed.left, top: placed.top } : undefined}
          role="status"
        >
          <span className={styles.guide} aria-hidden="true">
            <AvatarIllustration seed="tonton-rene" size={40} />
          </span>
          <div className={styles.body}>
            <strong className={styles.name}>Tonton René</strong>
            {view.line && <p className={styles.text}>{view.line.text}</p>}
            {view.line?.blocking && (
              <button type="button" data-nj-skin="none" className={styles.next} onClick={coachDirector.next}>
                Suivant ›
              </button>
            )}
            {end && (
              <div className={styles.actions}>
                {end.outcome === "failure" ? (
                  <Btn tone="gold" fill="solid" size="sm" onClick={coachDirector.retry}>Réessayer ce pli</Btn>
                ) : (
                  <>
                    <Btn tone="teal" fill="soft" size="sm" onClick={coachDirector.retry}>Rejouer</Btn>
                    <Btn tone="gold" fill="solid" size="sm" onClick={coachDirector.finish}>Continuer</Btn>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
