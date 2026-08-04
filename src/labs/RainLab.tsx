import { useRef, useState } from 'react';
import type { ChaosFaults, FormWeights } from '@/visuals/ascii/rain/rain-types';
import type { QualityTier } from '@/visuals/ascii/types';
import {
  BUTTON,
  CANVAS,
  Group,
  PANEL,
  Slider,
  Title,
  Toggle,
  downloadCanvas,
  queryFlag,
  queryNumber,
  showPanel,
} from './lab-kit';
import { useRainCanvas, type RainParams, type RainStats } from './rain-canvas';

/**
 * `?lab=rain` — the medium on its own.
 *
 * This lab exists to answer one question that no screenshot of the finished
 * site can: is the rain still rain? Every fault in the CHAOS vocabulary is on
 * a slider here, at any amount, in any combination, over a field that is
 * otherwise doing exactly what the CURRENT screen does. If a fault reads as a
 * post-effect rather than as the rain misbehaving, it is visible here first.
 *
 * A single `form` slider is included because two of the faults — mask drift
 * and anatomy repeat — are *relationships* between the rain and the thing it
 * is drawing, and cannot be judged against an empty field.
 */

interface Preset {
  label: string;
  chaos: Partial<ChaosFaults>;
  form?: number;
}

/**
 * The four states worth returning to. These are read off the CHAOS scene's
 * own escalation curve, not invented, so a preset here is a moment the reader
 * actually passes through.
 */
const PRESETS: Preset[] = [
  { label: 'clean', chaos: {}, form: 0 },
  {
    label: 'desync',
    form: 0.55,
    chaos: { intensity: 0.45, phaseError: 0.6, maskDrift: 0.5 },
  },
  {
    label: 'break',
    form: 0.4,
    chaos: {
      intensity: 0.8,
      phaseError: 0.75,
      maskDrift: 0.85,
      frozen: 0.5,
      directionInversion: 0.6,
      repeat: 0.55,
    },
  },
  {
    label: 'collapse',
    form: 0.12,
    chaos: { intensity: 1, phaseError: 0.9, frozen: 0.8, collapse: 0.85 },
  },
];

const ZERO_CHAOS: ChaosFaults = {
  intensity: 0,
  phaseError: 0,
  maskDrift: 0,
  frozen: 0,
  directionInversion: 0,
  collapse: 0,
  repeat: 0,
};

const FAULTS: (keyof ChaosFaults)[] = [
  'intensity',
  'phaseError',
  'maskDrift',
  'frozen',
  'directionInversion',
  'collapse',
  'repeat',
];

export function RainLab(): React.JSX.Element {
  const [seed, setSeed] = useState(() => queryNumber('seed', 2407));
  const [panel] = useState(showPanel);
  const [stats, setStats] = useState<RainStats | null>(null);

  const [ui, setUi] = useState(() => ({
    quality: (queryNumber('quality', 0) as QualityTier) ?? 0,
    paused: queryFlag('paused'),
    time: queryNumber('time', 8),
    progress: queryNumber('progress', 0.5),
    reducedMotion: queryFlag('reduced'),
    debug: queryFlag('debug'),
    form: queryNumber('form', 0),
    chaos: readChaos(),
  }));

  // The loop reads this, never React state: a slider must not restart the rain.
  const paramsRef = useRef<RainParams>({
    quality: ui.quality,
    paused: ui.paused,
    time: ui.time,
    progress: ui.progress,
    reducedMotion: ui.reducedMotion,
    debug: ui.debug,
    form: formOf(ui.form),
    chaos: ui.chaos,
    publish: false,
  });
  paramsRef.current = {
    quality: ui.quality,
    paused: ui.paused,
    time: ui.time,
    progress: ui.progress,
    reducedMotion: ui.reducedMotion,
    debug: ui.debug,
    form: formOf(ui.form),
    chaos: ui.chaos,
    publish: false,
  };

  const canvasRef = useRainCanvas(seed, paramsRef, setStats);

  const apply = (preset: Preset): void => {
    setUi((prev) => ({
      ...prev,
      form: preset.form ?? prev.form,
      chaos: { ...ZERO_CHAOS, ...preset.chaos },
    }));
  };

  return (
    <>
      <canvas ref={canvasRef} style={CANVAS} />
      {panel && (
        <div style={PANEL}>
          <Title>RAIN LAB</Title>

          <Slider
            label="progress"
            value={ui.progress}
            min={0}
            max={1}
            onChange={(progress) => setUi((p) => ({ ...p, progress }))}
          />
          <Slider
            label="form (a shape to break)"
            value={ui.form}
            min={0}
            max={1}
            onChange={(form) => setUi((p) => ({ ...p, form }))}
          />

          <Group label="faults" />
          {FAULTS.map((key) => (
            <Slider
              key={key}
              label={key}
              value={ui.chaos[key]}
              min={0}
              max={1}
              onChange={(value) =>
                setUi((p) => ({ ...p, chaos: { ...p.chaos, [key]: value } }))
              }
            />
          ))}

          <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
            {PRESETS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                style={BUTTON}
                onClick={() => apply(preset)}
              >
                {preset.label}
              </button>
            ))}
          </div>

          <Group label="field" />
          <Slider
            label="quality tier"
            value={ui.quality}
            min={0}
            max={2}
            step={1}
            decimals={0}
            onChange={(value) => setUi((p) => ({ ...p, quality: value as QualityTier }))}
          />
          <Toggle
            label="paused"
            value={ui.paused}
            onChange={(paused) => setUi((p) => ({ ...p, paused }))}
          />
          {ui.paused && (
            <Slider
              label="time"
              value={ui.time}
              min={0}
              max={40}
              step={0.1}
              decimals={1}
              onChange={(time) => setUi((p) => ({ ...p, time }))}
            />
          )}
          <Toggle
            label="reduced motion"
            value={ui.reducedMotion}
            onChange={(reducedMotion) => setUi((p) => ({ ...p, reducedMotion }))}
          />
          <Toggle
            label="mask debug"
            value={ui.debug}
            onChange={(debug) => setUi((p) => ({ ...p, debug }))}
          />

          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            <button
              type="button"
              style={BUTTON}
              onClick={() => {
                const canvas = canvasRef.current;
                if (canvas) downloadCanvas(canvas, `rain-${seed}`);
              }}
            >
              PNG
            </button>
            <button
              type="button"
              style={BUTTON}
              onClick={() => setSeed((Math.random() * 9999) | 0)}
            >
              seed {seed}
            </button>
          </div>

          {stats && (
            <div style={{ marginTop: 8, opacity: 0.75 }}>
              {stats.cols}×{stats.rows} · {stats.glyphs} glyphs · {stats.cost.toFixed(1)}ms ·{' '}
              {stats.fps.toFixed(0)}fps
            </div>
          )}
        </div>
      )}
    </>
  );
}

/**
 * One slider, three masks. The face carries the drift fault most legibly and
 * the figure gives the repeat fault something wide enough to duplicate.
 */
function formOf(amount: number): FormWeights {
  return { face: amount, figure: amount * 0.7, hand: amount * 0.35 };
}

function readChaos(): ChaosFaults {
  const out = { ...ZERO_CHAOS };
  for (const key of FAULTS) out[key] = queryNumber(key, 0);
  return out;
}
