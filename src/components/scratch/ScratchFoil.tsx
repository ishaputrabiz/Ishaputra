import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

/** The bronze foil's colour stops; `.scratch-foil` in index.css uses the same ones for the wallet tiles. */
const FOIL_STOPS: [number, string][] = [
  [0, '#6f5230'],
  [0.22, '#b8925a'],
  [0.42, '#8c6834'],
  [0.62, '#d4b27a'],
  [0.82, '#94703c'],
  [1, '#6a4d2a'],
];
/** Share of the foil that must be scratched off before the prize is revealed. */
const REVEAL_AT = 0.5;
/** Measure the cleared share every Nth pointer move, sampling every Nth pixel. */
const CHECK_EVERY = 6;
const SAMPLE_EVERY = 24;

type Point = { x: number; y: number };

function paintFoil(ctx: CanvasRenderingContext2D, w: number, h: number, dpr: number) {
  ctx.globalCompositeOperation = 'source-over';
  const g = ctx.createLinearGradient(0, 0, w, h);
  FOIL_STOPS.forEach(([p, c]) => g.addColorStop(p, c));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  // Brushed-metal hairlines, the same on every paint.
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let y = 0; y < h; y += 2 * dpr) {
    ctx.globalAlpha = 0.03 + rnd() * 0.07;
    ctx.fillStyle = rnd() > 0.5 ? '#fff' : '#000';
    ctx.fillRect(0, y, w, dpr);
  }
  ctx.globalAlpha = 1;
  // Inner bevel.
  ctx.strokeStyle = 'rgba(255,240,210,.35)';
  ctx.lineWidth = 1.5 * dpr;
  ctx.strokeRect(6 * dpr, 6 * dpr, w - 12 * dpr, h - 12 * dpr);
  // Monogram ring and the instructions.
  const cx = w / 2;
  const spaced = ctx as unknown as { letterSpacing: string };
  ctx.strokeStyle = 'rgba(27,26,24,.55)';
  ctx.beginPath();
  ctx.arc(cx, h * 0.38, h * 0.13, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = 'rgba(27,26,24,.72)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `700 ${Math.round(h * 0.12)}px Archivo, sans-serif`;
  ctx.fillText('IS', cx, h * 0.385);
  ctx.font = `700 ${Math.round(h * 0.068)}px Archivo, sans-serif`;
  spaced.letterSpacing = `${Math.round(h * 0.022)}px`;
  ctx.fillText('SCRATCH TO REVEAL', cx, h * 0.68);
  spaced.letterSpacing = '0px';
  ctx.font = `500 ${Math.round(h * 0.052)}px Manrope, sans-serif`;
  ctx.fillStyle = 'rgba(27,26,24,.6)';
  ctx.fillText('or press Reveal prize below', cx, h * 0.8);
}

interface ScratchFoilProps {
  /** Change it to repaint a fresh, unscratched foil (after a failed reveal). */
  resetKey: number;
  /** Fade the foil away and stop taking input (the prize is revealed). */
  fading: boolean;
  onFirstStroke: () => void;
  /** Called once, when over half the foil is scratched off. */
  onCleared: () => void;
}

/**
 * The scratchable bronze foil: a canvas over the prize face, erased with a
 * round brush. Purely visual (`aria-hidden`); the Reveal prize button is the
 * keyboard and screen-reader path.
 */
export function ScratchFoil({ resetKey, fading, onFirstStroke, onCleared }: ScratchFoilProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  const last = useRef<Point | null>(null);
  const moves = useRef(0);
  const touched = useRef(false);
  const cleared = useRef(false);
  const callbacks = useRef({ onFirstStroke, onCleared });
  callbacks.current = { onFirstStroke, onCleared };

  const context = () => ref.current?.getContext('2d', { willReadFrequently: true }) ?? null;

  // Paint at the canvas's device-pixel size, and again if it changes before the first stroke.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    touched.current = false;
    cleared.current = false;
    moves.current = 0;
    last.current = null;
    let painted = '';
    let live = true;
    const paint = () => {
      if (!live || touched.current) return;
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (!w || !h) return;
      const dpr = window.devicePixelRatio || 1;
      const size = `${w}x${h}@${dpr}`;
      if (size === painted) return;
      painted = size;
      el.width = Math.round(w * dpr);
      el.height = Math.round(h * dpr);
      const ctx = context();
      if (ctx) paintFoil(ctx, el.width, el.height, dpr);
    };
    const observer = new ResizeObserver(paint);
    observer.observe(el);
    paint();
    // The printed label uses the site fonts: paint again once they have loaded.
    document.fonts?.ready.then(() => {
      painted = '';
      paint();
    });
    return () => {
      live = false;
      observer.disconnect();
    };
  }, [resetKey]);

  const stroke = (from: Point, to: Point) => {
    const el = ref.current;
    const ctx = context();
    if (!el || !ctx) return;
    // destination-out erases by the stroke's alpha: an opaque colour clears the foil fully
    // (the painter's last colour is 55% opaque, which left a translucent trail).
    ctx.globalCompositeOperation = 'destination-out';
    ctx.strokeStyle = '#000';
    ctx.globalAlpha = 1;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(34, el.height * 0.17);
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
  };

  const clearedShare = () => {
    const el = ref.current;
    const ctx = context();
    if (!el || !ctx || !el.width || !el.height) return 0;
    const { data } = ctx.getImageData(0, 0, el.width, el.height);
    let clear = 0;
    let total = 0;
    for (let i = 3; i < data.length; i += 4 * SAMPLE_EVERY) {
      total++;
      if (data[i] < 128) clear++;
    }
    return total ? clear / total : 0;
  };

  const checkCleared = () => {
    if (cleared.current || clearedShare() < REVEAL_AT) return;
    cleared.current = true;
    callbacks.current.onCleared();
  };

  const point = (e: React.PointerEvent<HTMLCanvasElement>): Point => {
    const el = e.currentTarget;
    const r = el.getBoundingClientRect();
    return { x: ((e.clientX - r.left) * el.width) / r.width, y: ((e.clientY - r.top) * el.height) / r.height };
  };

  const end = () => {
    if (!last.current) return;
    last.current = null;
    checkCleared();
  };

  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      className={cn(
        'absolute inset-0 size-full cursor-grab touch-none select-none transition-opacity duration-drawer ease-out active:cursor-grabbing',
        fading && 'pointer-events-none opacity-0',
      )}
      onPointerDown={(e) => {
        if (fading || e.button > 0) return;
        // A mouse drag would otherwise start selecting the text around the card.
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        if (!touched.current) {
          touched.current = true;
          callbacks.current.onFirstStroke();
        }
        last.current = point(e);
        stroke(last.current, last.current);
      }}
      onPointerMove={(e) => {
        if (!last.current || cleared.current) return;
        const p = point(e);
        stroke(last.current, p);
        last.current = p;
        if (++moves.current % CHECK_EVERY === 0) checkCleared();
      }}
      onPointerUp={end}
      onPointerCancel={end}
    />
  );
}
