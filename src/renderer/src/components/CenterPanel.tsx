import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { cloneImage, getPixel, type RgbaImage } from '@core/image';
import type { Rgba } from '@core/color';
import { drawLine, floodFill } from '@core/editing';
import { parseHexColor } from '@core/color';
import { useApp, type Tool } from '../store/appStore';
import type { DocSnapshot } from '../store/docHistory';
import { useDisplayImages, useSelected } from '../store/selectors';
import { ZOOM_LEVELS, clampZoom, fitZoom, nextZoom, rgbaHex, toImageData } from '../util';
import { CompareIcon, EraserIcon, FillIcon, GridIcon, PencilIcon, PickerIcon, RedoIcon, UndoIcon } from './Icons';

const TOOLS: { id: Tool; label: string; key: string; Icon: typeof PencilIcon }[] = [
  { id: 'pencil', label: 'Pencil', key: 'B', Icon: PencilIcon },
  { id: 'eraser', label: 'Eraser (makes pixels transparent)', key: 'E', Icon: EraserIcon },
  { id: 'picker', label: 'Color picker', key: 'I', Icon: PickerIcon },
  { id: 'fill', label: 'Fill (contiguous, exact color)', key: 'G', Icon: FillIcon },
];

function EditorToolbar({ size }: { size: number | null }) {
  const editor = useApp((s) => s.editor);
  const setEditor = useApp((s) => s.setEditor);
  const undo = useApp((s) => s.undo);
  const redo = useApp((s) => s.redo);
  const reset = useApp((s) => s.resetToOriginal);
  const selected = useSelected();
  const docs = useApp((s) => s.docs);
  const hist = selected ? docs[selected.variation.id] : undefined;
  const hex = rgbaHex(editor.color).slice(0, 7);
  const disabled = !selected;
  const hasFilters = !!selected?.variation.pipeline.some((s) => s.enabled);

  return (
    <div className="toolbar" role="toolbar" aria-label="Editing tools">
      <div className="tool-group" role="group" aria-label="Tools">
        {TOOLS.map(({ id, label, key, Icon }) => (
          <button
            key={id}
            className={`icon-btn ${editor.tool === id ? 'active' : ''}`}
            aria-pressed={editor.tool === id}
            aria-label={label}
            title={`${label} (${key})`}
            disabled={disabled}
            onClick={() => setEditor({ tool: id })}
          >
            <Icon />
          </button>
        ))}
      </div>
      <div className="tool-group" role="group" aria-label="Color">
        <input
          type="color"
          aria-label="Drawing color"
          title="Drawing color"
          value={hex}
          disabled={disabled}
          onChange={(e) => {
            const c = parseHexColor(e.target.value);
            if (c) setEditor({ color: [c[0], c[1], c[2], editor.color[3] || 255] });
          }}
        />
        <label className="alpha-control" title="Alpha of drawn pixels (0 = transparent)">
          α
          <input
            type="range"
            min={0}
            max={255}
            value={editor.color[3]}
            aria-label="Drawing alpha"
            disabled={disabled}
            onChange={(e) => setEditor({ color: [editor.color[0], editor.color[1], editor.color[2], Number(e.target.value)] })}
          />
          <span className="value">{editor.color[3]}</span>
        </label>
        <button
          className="swatch transparent"
          title="Draw transparent pixels"
          aria-label="Use transparent color"
          disabled={disabled}
          onClick={() => setEditor({ color: [editor.color[0], editor.color[1], editor.color[2], 0], tool: 'pencil' })}
        />
      </div>
      <div className="tool-group" role="group" aria-label="Zoom">
        <button className="icon-btn" aria-label="Zoom out" title="Zoom out (Ctrl+-)" disabled={!size} onClick={() => size && setEditor({ zoom: nextZoom(editor.zoom, -1, size) })}>
          −
        </button>
        <select
          aria-label="Zoom level"
          value={editor.zoom}
          disabled={!size}
          onChange={(e) => size && setEditor({ zoom: clampZoom(Number(e.target.value), size) })}
        >
          {(size ? ZOOM_LEVELS.filter((z) => z === clampZoom(z, size)) : ZOOM_LEVELS).map((z) => (
            <option key={z} value={z}>
              {z * 100}%
            </option>
          ))}
        </select>
        <button className="icon-btn" aria-label="Zoom in" title="Zoom in (Ctrl+=)" disabled={!size} onClick={() => size && setEditor({ zoom: nextZoom(editor.zoom, 1, size) })}>
          +
        </button>
        <button className="btn small" title="Zoom to fit (Ctrl+9)" disabled={!size} onClick={() => setEditor({ fitRequest: editor.fitRequest + 1 })}>
          Fit
        </button>
        <button className="btn small" title="Actual pixels — native resolution (Ctrl+0)" disabled={!size} onClick={() => setEditor({ zoom: 1 })}>
          1:1
        </button>
      </div>
      <div className="tool-group" role="group" aria-label="View">
        <button
          className={`icon-btn ${editor.showGrid ? 'active' : ''}`}
          aria-pressed={editor.showGrid}
          aria-label="Pixel grid"
          title="Pixel grid (Ctrl+') — visible at high zoom"
          onClick={() => setEditor({ showGrid: !editor.showGrid })}
        >
          <GridIcon />
        </button>
        <button
          className={`icon-btn ${editor.compare ? 'active' : ''}`}
          aria-pressed={editor.compare}
          aria-label="Before/after compare"
          title="Before/after filter comparison (Ctrl+B)"
          disabled={disabled}
          onClick={() => setEditor({ compare: !editor.compare })}
        >
          <CompareIcon />
        </button>
        <label className="check compact" title="Show the live filter stack on the canvas">
          <input type="checkbox" checked={editor.showFilters} onChange={(e) => setEditor({ showFilters: e.target.checked })} />
          Filters{hasFilters ? ' on' : ''}
        </label>
      </div>
      <div className="tool-group" role="group" aria-label="History">
        <button className="icon-btn" aria-label="Undo" title="Undo (Ctrl+Z)" disabled={!hist?.undo.length} onClick={undo}>
          <UndoIcon />
        </button>
        <button className="icon-btn" aria-label="Redo" title="Redo (Ctrl+Y / Cmd+Shift+Z)" disabled={!hist?.redo.length} onClick={redo}>
          <RedoIcon />
        </button>
        <button className="btn small" disabled={disabled} title="Restore the original generated sprite (undoable)" onClick={reset}>
          Reset
        </button>
      </div>
    </div>
  );
}

function paint(canvas: HTMLCanvasElement | null, img: RgbaImage) {
  if (!canvas) return;
  if (canvas.width !== img.width) canvas.width = img.width;
  if (canvas.height !== img.height) canvas.height = img.height;
  canvas.getContext('2d')!.putImageData(toImageData(img), 0, 0);
}

function PixelCanvas() {
  const selected = useSelected();
  const images = useDisplayImages(selected?.variation);
  const editor = useApp((s) => s.editor);
  const gridMinZoom = useApp((s) => s.prefs?.editor.gridMinZoom ?? 6);
  const setEditor = useApp((s) => s.setEditor);
  const setCurrentTransient = useApp((s) => s.setCurrentTransient);
  const commitStroke = useApp((s) => s.commitStroke);
  const updateDoc = useApp((s) => s.updateDoc);
  const scrollRef = useRef<HTMLDivElement>(null);
  const afterRef = useRef<HTMLCanvasElement>(null);
  const beforeRef = useRef<HTMLCanvasElement>(null);
  const stroke = useRef<{ before: DocSnapshot; working: RgbaImage; last: [number, number]; color: Rgba } | null>(null);
  const size = selected?.record.request.size ?? null;

  useEffect(() => {
    if (images) {
      paint(afterRef.current, images.after);
      paint(beforeRef.current, images.base);
    }
  }, [images]);

  // Fit-to-view whenever requested (new generation, size change, Fit button).
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || !size) return;
    setEditor({ zoom: fitZoom(size, el.clientWidth, el.clientHeight) });
  }, [editor.fitRequest, size, setEditor]);

  const toPixel = useCallback(
    (e: { clientX: number; clientY: number; currentTarget: Element }): [number, number] | null => {
      if (!size) return null;
      const rect = e.currentTarget.getBoundingClientRect();
      const x = Math.floor(((e.clientX - rect.left) / rect.width) * size);
      const y = Math.floor(((e.clientY - rect.top) / rect.height) * size);
      return x >= 0 && y >= 0 && x < size && y < size ? [x, y] : null;
    },
    [size],
  );

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!selected || !images) return;
    const p = toPixel(e);
    if (!p) return;
    const tool: Tool = e.button === 2 ? 'eraser' : e.altKey ? 'picker' : editor.tool;
    if (tool === 'picker') {
      setEditor({ color: getPixel(images.after, p[0], p[1]) });
      return;
    }
    const before: DocSnapshot = { current: selected.variation.current, pipeline: selected.variation.pipeline };
    if (tool === 'fill') {
      updateDoc((d) => ({ ...d, current: floodFill(d.current, p[0], p[1], editor.color) }));
      return;
    }
    const color: Rgba = tool === 'eraser' ? [0, 0, 0, 0] : editor.color;
    const working = cloneImage(selected.variation.current);
    drawLine(working, p[0], p[1], p[0], p[1], color);
    stroke.current = { before, working, last: p, color };
    e.currentTarget.setPointerCapture(e.pointerId);
    setCurrentTransient(cloneImage(working));
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const p = toPixel(e);
    if (p && images) setEditor({ hover: { x: p[0], y: p[1], rgba: getPixel(images.after, p[0], p[1]) } });
    else if (!p && editor.hover) setEditor({ hover: null });
    const s = stroke.current;
    if (!s || !p || (p[0] === s.last[0] && p[1] === s.last[1])) return;
    drawLine(s.working, s.last[0], s.last[1], p[0], p[1], s.color);
    s.last = p;
    setCurrentTransient(cloneImage(s.working));
  };

  const endStroke = () => {
    const s = stroke.current;
    if (!s) return;
    stroke.current = null;
    commitStroke(s.before);
  };

  const onWheel = (e: React.WheelEvent) => {
    if (!size || !(e.ctrlKey || e.metaKey)) return;
    setEditor({ zoom: nextZoom(editor.zoom, e.deltaY < 0 ? 1 : -1, size) });
  };

  if (!selected || !images || !size) {
    return (
      <div className="canvas-scroll empty" ref={scrollRef}>
        <div className="empty-state">
          <h2>No sprite yet</h2>
          <p>Write a prompt with a concrete pixel-art style on the left, choose a size, then press Generate (Ctrl+Enter).</p>
          <p className="hint">Generated sprites appear here at native resolution with zoom, pixel grid and editing tools.</p>
        </div>
      </div>
    );
  }

  const px = size * editor.zoom;
  const showGrid = editor.showGrid && editor.zoom >= gridMinZoom;
  const compare = editor.compare;
  const cursor = editor.tool === 'picker' ? 'copy' : editor.tool === 'fill' ? 'cell' : 'crosshair';

  return (
    <div className="canvas-scroll" ref={scrollRef} onWheel={onWheel}>
      <div className="canvas-stage" style={{ width: px, height: px }}>
        <div
          className="canvas-frame checker"
          style={{ width: px, height: px, cursor, ['--checker' as string]: `${Math.max(4, Math.min(16, editor.zoom * 2))}px` }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endStroke}
          onPointerCancel={endStroke}
          onPointerLeave={() => setEditor({ hover: null })}
          onContextMenu={(e) => e.preventDefault()}
          data-testid="sprite-canvas"
          role="img"
          aria-label={`Sprite ${size}×${size} at ${editor.zoom * 100}% zoom`}
        >
          <canvas ref={afterRef} className="pixel layer" />
          <canvas ref={beforeRef} className="pixel layer" style={{ clipPath: `inset(0 ${100 - editor.compareSplit}% 0 0)`, visibility: compare ? 'visible' : 'hidden' }} />
          {showGrid && <div className="grid-overlay" style={{ backgroundSize: `${editor.zoom}px ${editor.zoom}px` }} />}
          {editor.hover && editor.zoom >= 4 && (
            <div className="hover-box" style={{ left: editor.hover.x * editor.zoom, top: editor.hover.y * editor.zoom, width: editor.zoom, height: editor.zoom }} />
          )}
          {compare && (
            <>
              <div className="split-line" style={{ left: `${editor.compareSplit}%` }} />
              <span className="compare-label left">Before filters</span>
              <span className="compare-label right">After</span>
            </>
          )}
        </div>
      </div>
      {compare && (
        <div className="compare-slider">
          <label>
            Before / after split
            <input type="range" min={0} max={100} value={editor.compareSplit} onChange={(e) => setEditor({ compareSplit: Number(e.target.value) })} />
          </label>
        </div>
      )}
    </div>
  );
}

function StatusBar() {
  const selected = useSelected();
  const editor = useApp((s) => s.editor);
  const size = selected?.record.request.size;
  return (
    <div className="statusbar" aria-live="off">
      {selected ? (
        <>
          <span>
            {size}×{size} px
          </span>
          <span>Zoom {editor.zoom * 100}%</span>
          {editor.hover ? (
            <span>
              x {editor.hover.x}, y {editor.hover.y} — <span className="mono">{rgbaHex(editor.hover.rgba)}</span>
              <span className="swatch-inline" style={{ background: rgbaHex(editor.hover.rgba) }} />
            </span>
          ) : (
            <span className="muted">Hover a pixel to inspect it</span>
          )}
          <span>Seed {selected.variation.seed ?? 'n/a'}</span>
          {selected.record.isMock && <span className="badge mock">MOCK — not AI</span>}
          <span className="muted right">Alt+click: pick color · Right-drag: erase · Ctrl+wheel: zoom</span>
        </>
      ) : (
        <span className="muted">Ready</span>
      )}
    </div>
  );
}

function GenerationStatus() {
  const job = useApp((s) => s.job);
  const error = useApp((s) => s.lastError);
  const warnings = useApp((s) => s.lastWarnings);
  const cancel = useApp((s) => s.cancelGeneration);
  const dismiss = useApp((s) => s.dismissError);
  const openDialog = useApp((s) => s.openDialog);
  const providerId = useApp((s) => s.providerId);
  const generate = useApp((s) => s.generate);
  const [elapsed, setElapsed] = useState(0);
  const [warnDismissed, setWarnDismissed] = useState(false);

  useEffect(() => {
    setWarnDismissed(false);
  }, [warnings]);
  useEffect(() => {
    if (!job) return;
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - job.startedAt) / 1000)), 500);
    return () => clearInterval(t);
  }, [job]);

  if (job) {
    const p = job.progress;
    const pct = p && p.total > 0 ? Math.round(((p.completed + (p.stage === 'converting' ? 0.5 : 0)) / p.total) * 100) : null;
    return (
      <div className="banner progress" role="status" aria-live="polite">
        <div className="banner-main">
          <strong>Generating with {job.providerName}…</strong> <span>{p?.message ?? 'Starting…'}</span> <span className="muted">{elapsed}s</span>
          <div className="progress-track" aria-hidden={pct === null}>
            <div className={`progress-fill ${pct === null ? 'indeterminate' : ''}`} style={pct === null ? undefined : { width: `${Math.min(100, pct)}%` }} />
          </div>
        </div>
        <button className="btn danger small" onClick={cancel} title="Cancel (Esc)">
          Cancel
        </button>
      </div>
    );
  }
  if (error) {
    const credential = error.code === 'auth' || error.code === 'missing_credentials' || error.code === 'model_not_found' || error.code === 'quota';
    const retryable = ['network', 'timeout', 'rate_limit', 'provider_unavailable', 'invalid_response', 'unknown'].includes(error.code);
    return (
      <div className="banner error" role="alert">
        <div className="banner-main">
          <strong>{error.message}</strong>
          {error.hint && <div>{error.hint}</div>}
          {error.details && <div className="muted mono small">{error.details}</div>}
        </div>
        <div className="banner-actions">
          {credential && (
            <button className="btn small" onClick={() => openDialog({ kind: 'settings', tab: 'providers', providerId })}>
              Open settings
            </button>
          )}
          {retryable && (
            <button className="btn small" onClick={() => void generate({ skipStyleCheck: true })}>
              Retry
            </button>
          )}
          <button className="btn small" onClick={dismiss}>
            Dismiss
          </button>
        </div>
      </div>
    );
  }
  if (warnings.length && !warnDismissed) {
    return (
      <div className="banner warning" role="status">
        <div className="banner-main">
          {warnings.map((w) => (
            <div key={w}>{w}</div>
          ))}
        </div>
        <button className="btn small" onClick={() => setWarnDismissed(true)}>
          Dismiss
        </button>
      </div>
    );
  }
  return null;
}

export function CenterPanel() {
  const selected = useSelected();
  return (
    <div className="center-panel">
      <EditorToolbar size={selected?.record.request.size ?? null} />
      <GenerationStatus />
      <PixelCanvas />
      <StatusBar />
    </div>
  );
}
