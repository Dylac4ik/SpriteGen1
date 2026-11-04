import { useEffect, useRef } from 'react';
import type { RgbaImage } from '@core/image';
import { toImageData } from '../util';

interface Props {
  image: RgbaImage;
  /** Displayed edge length in CSS px. Scaling uses nearest-neighbor (image-rendering: pixelated). */
  display: number;
  label?: string;
  className?: string;
}

export function Thumbnail({ image, display, label, className }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    c.width = image.width;
    c.height = image.height;
    c.getContext('2d')!.putImageData(toImageData(image), 0, 0);
  }, [image]);
  return (
    <canvas
      ref={ref}
      className={`pixel checker ${className ?? ''}`}
      style={{ width: display, height: display }}
      role="img"
      aria-label={label ?? `${image.width}×${image.height} sprite`}
    />
  );
}
