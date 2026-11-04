import type { RgbaImage } from '@core/image';
import { toHex } from '@core/color';

export function uid(): string {
  return crypto.randomUUID();
}

export function slugify(text: string, max = 32): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, max)
      .replace(/-+$/, '') || 'sprite'
  );
}

export function isEditableTarget(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag === 'INPUT') {
    const type = (el as HTMLInputElement).type;
    return !['checkbox', 'radio', 'range', 'button', 'color', 'submit'].includes(type);
  }
  return (el as HTMLElement).isContentEditable;
}

export function rgbaHex(c: readonly number[]): string {
  return toHex(c[0], c[1], c[2], c[3]);
}

export function formatTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function basenameNoExt(path: string): string {
  const base = path.split(/[\\/]/).pop() ?? path;
  return base.replace(/\.[^.]+$/, '');
}

export function toImageData(img: RgbaImage): ImageData {
  return new ImageData(new Uint8ClampedArray(img.data), img.width, img.height);
}

export const ZOOM_LEVELS = [1, 2, 3, 4, 6, 8, 12, 16, 24, 32, 48, 64];
export const MAX_CANVAS_EDGE = 16384;

export function clampZoom(zoom: number, size: number): number {
  const max = Math.max(1, Math.floor(MAX_CANVAS_EDGE / size));
  return Math.max(1, Math.min(zoom, max, 64));
}

export function nextZoom(zoom: number, dir: 1 | -1, size: number): number {
  const levels = ZOOM_LEVELS.filter((z) => z * size <= MAX_CANVAS_EDGE);
  if (dir > 0) return levels.find((z) => z > zoom) ?? levels[levels.length - 1];
  return [...levels].reverse().find((z) => z < zoom) ?? levels[0];
}

export function fitZoom(size: number, width: number, height: number): number {
  const avail = Math.max(1, Math.min(width, height) - 48);
  const raw = Math.floor(avail / size);
  const levels = ZOOM_LEVELS.filter((z) => z <= Math.max(1, raw));
  return clampZoom(levels[levels.length - 1] ?? 1, size);
}
