import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { cloneImage, getPixel, type RgbaImage } from '@core/image';
import type { Rgba } from '@core/color';
import { drawLine, floodFill } from '@core/editing';
import { useApp } from '@renderer/store/appStore';
import type { DocSnapshot } from '@renderer/store/docHistory';
import { useDisplayImages, useSelected } from '@renderer/store/selectors';
import { rgbaHex, toImageData } from '@renderer/util';
import { useMobileUi } from '../state';

interface View {
  scale: number;
  x: number;
  y: number;
}
type Point = { x: number; y: number };
type Gesture =
  | { kind: 'pan'; start: Point; startX: number; startY: number }
  | { kind: 'pinch'; startDist: number; startScale: number; startMid: Point; startX: number; startY: number }
  | { kind: 'stroke'; before: DocSnapshot; working: RgbaImage; last: [number, number]; color: Rgba }
  | { kind: 'fill'; start: Point; px: [number, number]; cancelled: boolean }
  | { kind: 'tap' };

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const mid = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

function paint(canvas: HTMLCanvasElement | null, img: RgbaImage) {
  if (!canvas) return;
  if (canvas.width !== img.width) canvas.width = img.width;
  if (canvas.height !== img.height) canvas.height = img.height;
  canvas.getContext('2d')!.putImageData(toImageData(img), 0, 0);
}

/** Largest on-screen edge we allow, to stay within mobile GPU texture limits. */
const MAX_DISPLAY_EDGE = 8192;

/**
 * Touch canvas: one finger draws with the active tool (or pans with Move), two fingers
 * pinch-zoom and pan. Display scaling is nearest-neighbor (image-rendering: pixelated).
 */
export function MobileCanvas() {
  const selected = useSelected();
  const images = useDisplayImages(selected?.variation);
  const editor = useApp((s) => s.editor);
  const gridMinZoom = useApp((s) => s.prefs?.editor.gridMinZoom ?? 6);
  const setEditor = useApp((s) => s.setEditor);
  const setCurrentTransient = useApp((s) => s.setCurrentTransient);
  const commitStroke = useApp((s) => s.commitStroke);
  const updateDoc = useApp((s) => s.updateDoc);
  const tool = useMobileUi((s) => s.tool);
  const size = selected?.record.request.size ?? 0;

  const viewportRef = useRef<HTMLDivElement>(null);
  const afterRef = useRef<HTMLCanvasElement>(null);
  const beforeRef = useRef<HTMLCanvasElement>(null);
  const [view, setView] = useState<View>({ scale: 1, x: 0, y: 0 });
  const viewRef = useRef(view);
  viewRef.current = view;
  const pointers = useRef(new Map<number, Point>());
  const gesture = useRef<Gesture | null>(null);
  const [inspect, setInspect] = useState<{ x: number; y: number; rgba: Rgba } | null>(null);

  useEffect(() => {
    if (images) {
      paint(afterRef.current, images.after);
      paint(beforeRef.current, images.base);
    }
  }, [images]);

  const fitScale = useCallback(() => {
    const el = viewportRef.current;
    if (!el || !size) return 1;
    const avail = Math.max(16, Math.min(el.clientWidth, el.clientHeight) - 24);
    const s = avail / size;
    return s >= 1 ? Math.floor(s) : s; // integer zoom keeps every sprite pixel the same size
  }, [size]);

  const centerAt = useCallback(
    (scale: number) => {
      const el = viewportRef.current;
      if (!el || !size) return;
      setView({ scale, x: (el.clientWidth - size * scale) / 2, y: (el.clientHeight - size * scale) / 2 });
    },
    [size],
  );

  const fit = useCallback(() => centerAt(fitScale()), [centerAt, fitScale]);

  useLayoutEffect(() => {
    fit();
  }, [fit, editor.fitRequest, selected?.record.id]);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => fit());
    ro.observe(el);
    return () => ro.disconnect();
  }, [fit]);

  const maxScale = size ? Math.max(1, Math.min(64, MAX_DISPLAY_EDGE / size)) : 64;
  const minScale = Math.min(0.25, fitScale());
  const clampScale = (s: number) => Math.max(minScale, Math.min(maxScale, s));

  const local = (e: { clientX: number; clientY: number }): Point => {
    const r = viewportRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const toPixel = (p: Point): [number, number] | null => {
    const v = viewRef.current;
    const x = Math.floor((p.x - v.x) / v.scale);
    const y = Math.floor((p.y - v.y) / v.scale);
    return x >= 0 && y >= 0 && x < size && y < size ? [x, y] : null;
  };
  const updateInspect = (px: [number, number] | null) => {
    if (px && images) setInspect({ x: px[0], y: px[1], rgba: getPixel(images.after, px[0], px[1]) });
  };

  const cancelStroke = () => {
    const g = gesture.current;
    if (g?.kind === 'stroke') setCurrentTransient(g.before.current); // second finger landed: this was a pinch, not a stroke
    gesture.current = null;
  };

  const startPinch = () => {
    const [a, b] = [...pointers.current.values()];
    const v = viewRef.current;
    gesture.current = { kind: 'pinch', startDist: Math.max(1, dist(a, b)), startScale: v.scale, startMid: mid(a, b), startX: v.x, startY: v.y };
  };

  const startPan = (p: Point) => {
    const v = viewRef.current;
    gesture.current = { kind: 'pan', start: p, startX: v.x, startY: v.y };
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!selected || !images) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const p = local(e);
    pointers.current.set(e.pointerId, p);
    if (pointers.current.size === 2) {
      cancelStroke();
      startPinch();
      return;
    }
    if (pointers.current.size > 2) return;
    const px = toPixel(p);
    updateInspect(px);
    if (tool === 'move' || !px || e.button === 1) return startPan(p);
    if (tool === 'picker') {
      setEditor({ color: getPixel(images.after, px[0], px[1]) });
      gesture.current = { kind: 'tap' };
      return;
    }
    if (tool === 'fill') {
      gesture.current = { kind: 'fill', start: p, px, cancelled: false };
      return;
    }
    const color: Rgba = tool === 'eraser' ? [0, 0, 0, 0] : editor.color;
    const working = cloneImage(selected.variation.current);
    drawLine(working, px[0], px[1], px[0], px[1], color);
    gesture.current = { kind: 'stroke', before: { current: selected.variation.current, pipeline: selected.variation.pipeline }, working, last: px, color };
    setCurrentTransient(cloneImage(working));
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(e.pointerId)) return;
    const p = local(e);
    pointers.current.set(e.pointerId, p);
    const g = gesture.current;
    if (!g) return;
    if (g.kind === 'pinch' && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const s = clampScale((g.startScale * dist(a, b)) / g.startDist);
      const m = mid(a, b);
      // Keep the sprite point that was under the fingers' midpoint under the new midpoint.
      const cx = (g.startMid.x - g.startX) / g.startScale;
      const cy = (g.startMid.y - g.startY) / g.startScale;
      setView({ scale: s, x: m.x - cx * s, y: m.y - cy * s });
    } else if (g.kind === 'pan') {
      setView((v) => ({ ...v, x: g.startX + p.x - g.start.x, y: g.startY + p.y - g.start.y }));
    } else if (g.kind === 'stroke') {
      const px = toPixel(p);
      updateInspect(px);
      if (!px || (px[0] === g.last[0] && px[1] === g.last[1])) return;
      drawLine(g.working, g.last[0], g.last[1], px[0], px[1], g.color);
      g.last = px;
      setCurrentTransient(cloneImage(g.working));
    } else if (g.kind === 'fill' && dist(p, g.start) > 10) {
      g.cancelled = true;
    }
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.delete(e.pointerId);
    const g = gesture.current;
    if (g?.kind === 'stroke') {
      gesture.current = null;
      commitStroke(g.before);
    } else if (g?.kind === 'fill') {
      gesture.current = null;
      if (!g.cancelled && e.type === 'pointerup') updateDoc((d) => ({ ...d, current: floodFill(d.current, g.px[0], g.px[1], editor.color) }));
    } else if (g?.kind === 'pinch') {
      const rest = [...pointers.current.values()][0];
      if (rest) startPan(rest);
      else gesture.current = null;
    } else if (pointers.current.size === 0) {
      gesture.current = null;
    }
  };

  const onWheel = (e: React.WheelEvent) => {
    // Desktop-browser convenience for the web build: wheel zooms around the cursor.
    const p = local(e);
    const v = viewRef.current;
    const s = clampScale(v.scale * (e.deltaY < 0 ? 1.25 : 0.8));
    setView({ scale: s, x: p.x - ((p.x - v.x) / v.scale) * s, y: p.y - ((p.y - v.y) / v.scale) * s });
  };

  if (!selected || !images || !size) return null;
  const px = size * view.scale;
  const showGrid = editor.showGrid && view.scale >= gridMinZoom;
  const zoomPct = Math.round(view.scale * 100);

  return (
    <div className="m-canvas-wrap">
      <div
        ref={viewportRef}
        className="m-viewport"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={onWheel}
        onContextMenu={(e) => e.preventDefault()}
        data-testid="m-viewport"
        data-tool={tool}
      >
        <div
          className="m-stage checker"
          style={{ left: view.x, top: view.y, width: px, height: px, ['--checker' as string]: `${Math.max(4, Math.min(16, view.scale * 2))}px` }}
          data-testid="sprite-canvas"
          role="img"
          aria-label={`Sprite ${size}×${size} at ${zoomPct}% zoom`}
        >
          <canvas ref={afterRef} className="pixel layer" />
          <canvas
            ref={beforeRef}
            className="pixel layer"
            style={{ clipPath: `inset(0 ${100 - editor.compareSplit}% 0 0)`, visibility: editor.compare ? 'visible' : 'hidden' }}
          />
          {showGrid && <div className="grid-overlay" style={{ backgroundSize: `${view.scale}px ${view.scale}px` }} />}
          {inspect && view.scale >= 4 && (
            <div className="hover-box" style={{ left: inspect.x * view.scale, top: inspect.y * view.scale, width: view.scale, height: view.scale }} />
          )}
          {editor.compare && <div className="split-line" style={{ left: `${editor.compareSplit}%` }} />}
        </div>
        <div className="m-zoom" onPointerDown={(e) => e.stopPropagation()}>
          <button className="btn small" onClick={fit} aria-label="Zoom to fit">
            Fit
          </button>
          <button className="btn small" onClick={() => centerAt(1)} aria-label="Actual pixels, one sprite pixel per screen point">
            1:1
          </button>
          <button className="btn small" onClick={() => centerAt(clampScale(view.scale * 1.5))} aria-label="Zoom in">
            +
          </button>
          <button className="btn small" onClick={() => centerAt(clampScale(view.scale / 1.5))} aria-label="Zoom out">
            −
          </button>
          <span className="m-zoom-label" data-testid="m-zoom">
            {zoomPct}%
          </span>
        </div>
      </div>
      {editor.compare && (
        <label className="m-compare">
          <span>Before ← → After filters</span>
          <input type="range" min={0} max={100} value={editor.compareSplit} onChange={(e) => setEditor({ compareSplit: Number(e.target.value) })} aria-label="Before/after split" />
        </label>
      )}
      <div className="m-inspector" aria-live="off">
        <span>
          {size}×{size}
        </span>
        {inspect ? (
          <span>
            x {inspect.x}, y {inspect.y} <span className="mono">{rgbaHex(inspect.rgba)}</span>
            <span className="swatch-inline" style={{ background: rgbaHex(inspect.rgba) }} />
          </span>
        ) : (
          <span className="muted">Touch a pixel to inspect it</span>
        )}
        {selected.record.isMock && <span className="badge mock">MOCK</span>}
      </div>
    </div>
  );
}
