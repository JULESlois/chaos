import { useMemo } from 'react';

/** Generates a small tiling noise texture as a data URL, once per session. */
function createNoiseDataUrl(size = 96): string {
  if (typeof document === 'undefined') return 'none';
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return 'none';

  const image = ctx.createImageData(size, size);
  const { data } = image;
  for (let i = 0; i < data.length; i += 4) {
    const value = (Math.random() * 255) | 0;
    data[i] = value;
    data[i + 1] = value;
    data[i + 2] = value;
    data[i + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
  return `url(${canvas.toDataURL('image/png')})`;
}

/**
 * Layer 2 — scanlines, film noise and vignette.
 * Purely decorative and always aria-hidden.
 */
export function TextureLayer(): React.JSX.Element {
  const noiseUrl = useMemo(() => createNoiseDataUrl(), []);

  return (
    <div
      className="texture-layer"
      aria-hidden="true"
      style={{ ['--noise-url' as string]: noiseUrl }}
    >
      <div className="texture-layer__noise" />
      <div className="texture-layer__scanlines" />
      <div className="texture-layer__vignette" />
    </div>
  );
}
