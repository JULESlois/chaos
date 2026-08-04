import { useEffect, useRef, useState } from 'react';
import { createFormSample, FormModulator } from '@/visuals/ascii/rain/form-modulator';
import type { ChaosFaults, FormWeights } from '@/visuals/ascii/rain/rain-types';
import { clamp01, NORMAL_CHAOS } from '@/visuals/ascii/rain/rain-types';
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
 * `?lab=form` — the forms, and the proof they are not pictures.
 *
 * The whole claim of the FORM screen is that a face is a *behaviour of the
 * rain*: slower here, brighter there, absent in the socket. That claim is easy
 * to make and easy to quietly break — the moment a mask starts placing
 * characters, the piece becomes ASCII art with a rain background.
 *
 * So this lab shows two things side by side. On the left, the real field with
 * the real modulator. On the right, in the panel, the raw mask channels the
 * modulator is reading. If the field ever shows an edge the channel view does
 * not explain, something is drawing instead of modulating.
 */

const SCHEDULE_HINT = 'progress drives face → figure → hand, as the FORM scene does';

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

/**
 * The same curve `FormScene.update` runs.
 *
 * It is restated here rather than imported because importing it would mean
 * constructing a scene, an engine runtime and an experience store just to read
 * three numbers. The lab's job is to let the curve be seen; if the two ever
 * drift apart the form test catches it, since both are asserted against the
 * same expected weights.
 */
export function formSchedule(p: number): FormWeights {
  return {
    face: smoothstep(0.1, 0.3, p) * (1 - smoothstep(0.74, 0.96, p) * 0.85),
    figure: smoothstep(0.32, 0.52, p) * (1 - smoothstep(0.88, 1, p) * 0.7),
    hand: smoothstep(0.62, 0.84, p),
  };
}

type Channel = 'density' | 'edge' | 'depth' | 'void';
const CHANNELS: Channel[] = ['density', 'edge', 'depth', 'void'];

export function FormLab(): React.JSX.Element {
  const [seed] = useState(() => queryNumber('seed', 2407));
  const [panel] = useState(showPanel);
  const [stats, setStats] = useState<RainStats | null>(null);

  const [ui, setUi] = useState(() => ({
    progress: queryNumber('progress', 0.45),
    scheduled: !queryFlag('manual'),
    face: queryNumber('face', 0),
    figure: queryNumber('figure', 0),
    hand: queryNumber('hand', 0),
    quality: (queryNumber('quality', 0) as QualityTier) ?? 0,
    paused: queryFlag('paused'),
    time: queryNumber('time', 8),
    debug: queryFlag('debug'),
    channel: 'density' as Channel,
  }));

  const weights: FormWeights = ui.scheduled
    ? formSchedule(ui.progress)
    : { face: ui.face, figure: ui.figure, hand: ui.hand };

  const chaos: ChaosFaults = NORMAL_CHAOS;

  const paramsRef = useRef<RainParams>({
    quality: ui.quality,
    paused: ui.paused,
    time: ui.time,
    progress: ui.progress,
    reducedMotion: false,
    debug: ui.debug,
    form: weights,
    chaos,
    publish: false,
  });
  paramsRef.current = {
    quality: ui.quality,
    paused: ui.paused,
    time: ui.time,
    progress: ui.progress,
    reducedMotion: false,
    debug: ui.debug,
    form: weights,
    chaos,
    publish: false,
  };

  const canvasRef = useRainCanvas(seed, paramsRef, setStats);

  return (
    <>
      <canvas ref={canvasRef} style={CANVAS} />
      {panel && (
        <div style={PANEL}>
          <Title>FORM LAB</Title>

          <Toggle
            label="follow scene schedule"
            value={ui.scheduled}
            onChange={(scheduled) => setUi((p) => ({ ...p, scheduled }))}
          />
          <div style={{ opacity: 0.5, marginBottom: 6 }}>{SCHEDULE_HINT}</div>

          <Slider
            label="progress"
            value={ui.progress}
            min={0}
            max={1}
            onChange={(progress) => setUi((p) => ({ ...p, progress }))}
          />

          <Group label="weights" />
          {ui.scheduled ? (
            <div style={{ opacity: 0.8, marginBottom: 6 }}>
              face {weights.face.toFixed(2)} · figure {weights.figure.toFixed(2)} · hand{' '}
              {weights.hand.toFixed(2)}
            </div>
          ) : (
            <>
              <Slider
                label="face"
                value={ui.face}
                min={0}
                max={1}
                onChange={(face) => setUi((p) => ({ ...p, face }))}
              />
              <Slider
                label="figure"
                value={ui.figure}
                min={0}
                max={1}
                onChange={(figure) => setUi((p) => ({ ...p, figure }))}
              />
              <Slider
                label="hand"
                value={ui.hand}
                min={0}
                max={1}
                onChange={(hand) => setUi((p) => ({ ...p, hand }))}
              />
            </>
          )}

          <Group label="what the modulator reads" />
          <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
            {CHANNELS.map((channel) => (
              <button
                key={channel}
                type="button"
                style={{
                  ...BUTTON,
                  opacity: ui.channel === channel ? 1 : 0.5,
                }}
                onClick={() => setUi((p) => ({ ...p, channel }))}
              >
                {channel}
              </button>
            ))}
          </div>
          <MaskInspector weights={weights} channel={ui.channel} progress={ui.progress} />

          <Group label="field" />
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
            label="mask overlay"
            value={ui.debug}
            onChange={(debug) => setUi((p) => ({ ...p, debug }))}
          />
          <Slider
            label="quality tier"
            value={ui.quality}
            min={0}
            max={2}
            step={1}
            decimals={0}
            onChange={(value) => setUi((p) => ({ ...p, quality: value as QualityTier }))}
          />

          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            <button
              type="button"
              style={BUTTON}
              onClick={() => {
                const canvas = canvasRef.current;
                if (canvas) downloadCanvas(canvas, `form-${Math.round(ui.progress * 100)}`);
              }}
            >
              PNG
            </button>
          </div>

          {stats && (
            <div style={{ marginTop: 8, opacity: 0.75 }}>
              {stats.cols}×{stats.rows} · {stats.glyphs} glyphs · {stats.cost.toFixed(1)}ms
            </div>
          )}
        </div>
      )}
    </>
  );
}

/**
 * A direct read of the modulator, at the aspect the field is running at.
 *
 * Nothing here goes through the rain: this is what the rain is *asking*, drawn
 * as a heightfield. Void is drawn inverted, because negative space is the one
 * channel whose job is to remove rather than add.
 */
function MaskInspector(props: {
  weights: FormWeights;
  channel: Channel;
  progress: number;
}): React.JSX.Element {
  const ref = useRef<HTMLCanvasElement>(null);
  const { weights, channel, progress } = props;
  const { face, figure, hand } = weights;

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    const modulator = new FormModulator();
    modulator.setWeights({ face, figure, hand });
    const sample = createFormSample();

    const image = ctx.createImageData(w, h);
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const s = modulator.sample(sample, (x + 0.5) / w, (y + 0.5) / h, 0, progress);
        const value =
          channel === 'density'
            ? s.density
            : channel === 'edge'
              ? s.edge
              : channel === 'depth'
                ? s.depth
                : s.voidValue;
        const i = (y * w + x) * 4;
        // The site's own two-colour range, so the inspector cannot suggest a
        // hue the field is incapable of producing.
        image.data[i] = 7 + value * 248;
        image.data[i + 1] = 2 + value * 136;
        image.data[i + 2] = 3 + value * 150;
        image.data[i + 3] = 255;
      }
    }
    ctx.putImageData(image, 0, 0);
  }, [face, figure, hand, channel, progress]);

  return (
    <canvas
      ref={ref}
      width={112}
      height={84}
      style={{
        display: 'block',
        width: '100%',
        imageRendering: 'pixelated',
        border: '1px solid #321016',
        marginBottom: 6,
      }}
    />
  );
}
