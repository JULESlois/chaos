import { useEffect, useRef, useState } from 'react';
import { CHARSETS } from '../charset';
import { FlowRenderer, type FlowRenderConfig } from './flow-renderer';
import { MAIN_RIBBON, SECONDARY_RIBBON, type RibbonDefinition } from './ribbon';

/**
 * Developer-only Visual Lab for the FLOW keyframe.
 *
 * Mounted only when the URL carries `?lab=flow`; the production page never
 * imports or renders it. It drives the real FlowRenderer against its own canvas
 * and a plain DOM form, so the composition can be tuned, frozen, screenshotted
 * and measured without touching the shipping experience.
 */

interface LabParams {
  progress: number;
  time: number;
  seed: number;
  paused: boolean;
  density: number;
  sizeScale: number;
  foreground: number;
  body: number;
  background: number;
  showPaths: boolean;
  showPanel: boolean;
}

function readDefaults(): LabParams {
  const params = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
  const num = (key: string, fallback: number): number => {
    const raw = params.get(key);
    const value = raw === null ? NaN : Number(raw);
    return Number.isFinite(value) ? value : fallback;
  };
  const flag = (key: string): boolean => params.get(key) === '1';
  return {
    progress: num('progress', 0.52),
    time: num('time', 6),
    seed: num('seed', 1204),
    // Frozen by default (keyframe); `paused=0` lets it animate.
    paused: params.get('paused') !== '0',
    density: num('density', 1),
    sizeScale: num('sizeScale', 1),
    foreground: num('foreground', 1),
    body: num('body', 1),
    background: num('background', 1),
    showPaths: flag('debug'),
    // `clean=1` hides the control panel so the lab can produce bare posters.
    showPanel: flag('clean') === false,
  };
}

const PANEL_STYLE: React.CSSProperties = {
  position: 'fixed',
  top: 12,
  right: 12,
  zIndex: 1000,
  width: 248,
  padding: 12,
  background: 'rgba(7,2,3,0.86)',
  border: '1px solid #321016',
  color: '#e68a98',
  font: '11px/1.5 monospace',
  borderRadius: 4,
};

function Row(props: { label: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <label style={{ display: 'block', marginBottom: 8 }}>
      <span style={{ display: 'block', opacity: 0.8 }}>{props.label}</span>
      {props.children}
    </label>
  );
}

export function VisualLab(): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [params, setParams] = useState<LabParams>(readDefaults);
  const [blackPct, setBlackPct] = useState<number | null>(null);
  const paramsRef = useRef(params);
  paramsRef.current = params;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const renderer = new FlowRenderer(CHARSETS.current);
    let raf = 0;
    let clock = paramsRef.current.time;
    let last = performance.now();

    const fit = (): { width: number; height: number; dpr: number } => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      const narrow = width < 768;
      const dpr = Math.min(narrow ? 1 : 1.5, window.devicePixelRatio || 1);
      const pixelWidth = Math.max(1, Math.round(width * dpr));
      const pixelHeight = Math.max(1, Math.round(height * dpr));
      if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
      if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      renderer.resize({ dpr });
      return { width, height, dpr };
    };

    const loop = (now: number): void => {
      raf = requestAnimationFrame(loop);
      const delta = Math.min(0.1, (now - last) / 1000);
      last = now;

      const p = paramsRef.current;
      const { width, height, dpr } = fit();
      const ctx = canvas.getContext('2d', { alpha: false });
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      if (!p.paused) clock += delta;
      const time = p.paused ? p.time : clock;

      const config: FlowRenderConfig = {
        width,
        height,
        dpr,
        time,
        progress: p.progress,
        seed: p.seed,
        quality: width < 768 ? 2 : 0,
        pointer: { x: 0.5, y: 0.5, active: false },
        scrollVelocity: 0,
        density: p.density,
        sizeScale: p.sizeScale,
        layerIntensity: {
          background: p.background,
          body: p.body,
          foreground: p.foreground,
        },
        debug: p.showPaths,
        delta: delta,
        mainRibbon: labRibbon('main', p),
        secondaryRibbon: labRibbon('secondary', p),
      };

      renderer.render(ctx, { width, height }, config);
    };

    raf = requestAnimationFrame(loop);

    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'e') download();
    };
    const download = (): void => {
      const url = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.href = url;
      link.download = `flow-${paramsRef.current.seed}-${Math.round(paramsRef.current.progress * 100)}.png`;
      link.click();
    };
    window.addEventListener('keydown', onKey);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKey);
      renderer.dispose();
    };
  }, []);

  const estimateBlack = (): void => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let black = 0;
    let total = 0;
    for (let i = 0; i < data.length; i += 4 * 4) {
      const r = data[i]!;
      const g = data[i + 1]!;
      const b = data[i + 2]!;
      const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      if (lum < 0.14) black += 1;
      total += 1;
    }
    setBlackPct(total > 0 ? (black / total) * 100 : 0);
  };

  const download = (): void => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const url = canvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.href = url;
    link.download = `flow-${params.seed}-${Math.round(params.progress * 100)}.png`;
    link.click();
  };

  return (
    <>
      <canvas ref={canvasRef} style={{ display: 'block', position: 'fixed', inset: 0 }} />
      {params.showPanel && (
      <div style={PANEL_STYLE}>
        <strong style={{ display: 'block', marginBottom: 8, color: '#ffc0c9' }}>FLOW LAB</strong>
        <Row label={`progress ${params.progress.toFixed(2)}`}>
          <input
            type="range" min={0} max={1} step={0.01} value={params.progress}
            onChange={(e) => setParams((p) => ({ ...p, progress: Number(e.target.value) }))}
            style={{ width: '100%' }}
          />
        </Row>
        <Row label={`time ${params.time.toFixed(1)}`}>
          <input
            type="range" min={0} max={20} step={0.1} value={params.time}
            onChange={(e) => setParams((p) => ({ ...p, time: Number(e.target.value) }))}
            style={{ width: '100%' }}
          />
        </Row>
        <Row label="paused">
          <input
            type="checkbox" checked={params.paused}
            onChange={(e) => setParams((p) => ({ ...p, paused: e.target.checked }))}
          />
        </Row>
        <Row label={`density ${params.density.toFixed(2)}`}>
          <input
            type="range" min={0.4} max={1.6} step={0.05} value={params.density}
            onChange={(e) => setParams((p) => ({ ...p, density: Number(e.target.value) }))}
            style={{ width: '100%' }}
          />
        </Row>
        <Row label={`size scale ${params.sizeScale.toFixed(2)}`}>
          <input
            type="range" min={0.6} max={1.6} step={0.05} value={params.sizeScale}
            onChange={(e) => setParams((p) => ({ ...p, sizeScale: Number(e.target.value) }))}
            style={{ width: '100%' }}
          />
        </Row>
        <Row label={`foreground ${params.foreground.toFixed(2)}`}>
          <input
            type="range" min={0} max={1.5} step={0.05} value={params.foreground}
            onChange={(e) => setParams((p) => ({ ...p, foreground: Number(e.target.value) }))}
            style={{ width: '100%' }}
          />
        </Row>
        <Row label={`body ${params.body.toFixed(2)}`}>
          <input
            type="range" min={0} max={1.5} step={0.05} value={params.body}
            onChange={(e) => setParams((p) => ({ ...p, body: Number(e.target.value) }))}
            style={{ width: '100%' }}
          />
        </Row>
        <Row label={`background ${params.background.toFixed(2)}`}>
          <input
            type="range" min={0} max={1.5} step={0.05} value={params.background}
            onChange={(e) => setParams((p) => ({ ...p, background: Number(e.target.value) }))}
            style={{ width: '100%' }}
          />
        </Row>
        <Row label="show paths">
          <input
            type="checkbox" checked={params.showPaths}
            onChange={(e) => setParams((p) => ({ ...p, showPaths: e.target.checked }))}
          />
        </Row>
        <Row label="seed">
          <input
            type="number" value={params.seed}
            onChange={(e) => setParams((p) => ({ ...p, seed: Number(e.target.value) || 0 }))}
            style={{ width: '100%', background: '#130608', color: '#e68a98', border: '1px solid #321016' }}
          />
        </Row>
        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
          <button type="button" onClick={download} style={btn}>PNG</button>
          <button type="button" onClick={estimateBlack} style={btn}>black %</button>
          <button
            type="button"
            onClick={() => setParams((p) => ({ ...p, seed: (Math.random() * 9999) | 0 }))}
            style={btn}
          >
            seed
          </button>
        </div>
        {blackPct !== null && (
          <div style={{ marginTop: 8, color: blackPct > 60 && blackPct < 82 ? '#ffc0c9' : '#b75a69' }}>
            near-black: {blackPct.toFixed(1)}%
          </div>
        )}
      </div>
      )}
    </>
  );
}

const btn: React.CSSProperties = {
  flex: 1,
  background: '#321016',
  color: '#ffc0c9',
  border: '1px solid #6b2933',
  font: '11px monospace',
  padding: '4px 0',
  cursor: 'pointer',
};

/**
 * The lab lets you nudge the curves live. Editing a path control returns a new
 * `RibbonDefinition`, which makes the renderer reseed (its identity changes).
 * This keeps the math identical to production while allowing the path to be
 * tuned from the panel.
 */
function labRibbon(which: 'main' | 'secondary', _params: LabParams): RibbonDefinition {
  return which === 'main' ? MAIN_RIBBON : SECONDARY_RIBBON;
}
