import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TVCanvas } from '@/features/tv/TVCanvas';
import {
  useInstantTVController,
  useTVController,
} from '@/features/tv/hooks/useTVController';
import type { LiveValue, TVButtonId } from '@/features/tv/types';
import { glassStrength, revealState } from '@/systems/signal/reveal-state';
import { NORMAL_CHAOS } from '@/visuals/ascii/rain/rain-types';
import type { QualityTier } from '@/visuals/ascii/types';
import {
  BUTTON,
  CANVAS,
  Group,
  PANEL,
  Slider,
  Title,
  Toggle,
  queryFlag,
  queryNumber,
  showPanel,
} from './lab-kit';
import { useRainCanvas, type RainParams } from './rain-canvas';

/**
 * `?lab=tv-reveal` — the camera coming out of the picture, on a slider.
 *
 * The reveal is the one moment in the piece that cannot be judged by looking
 * at either end of it. At progress 0 the reader is supposed to be unable to
 * tell there is a television at all; at progress 1 they are supposed to be
 * unable to remember there was ever a full-screen field. Everything that can
 * go wrong goes wrong in between, at a scroll speed nobody can hold steady.
 *
 * So this lab drives the real `CameraDirector` from a slider instead of from
 * scroll, over the real shared signal surface, and prints the numbers the
 * seam depends on: the projected screen rectangle, the crossfade weight, and
 * how much of the CRT glass has leaked in. At progress 0 the rectangle must
 * cover the viewport — that is not an opinion about the image, it is four
 * numbers, and they are on screen.
 */

const AUTOPLAY_SECONDS = 7;

export function TVRevealLab(): React.JSX.Element {
  const [panel] = useState(showPanel);
  const [seed] = useState(() => queryNumber('seed', 2407));
  const instant = queryFlag('instant');

  const [ui, setUi] = useState(() => ({
    progress: queryNumber('progress', 0),
    playing: queryFlag('play'),
    quality: (queryNumber('quality', 0) as QualityTier) ?? 0,
    reducedMotion: queryFlag('reduced'),
    staticView: queryFlag('static'),
    grid: queryFlag('grid'),
    form: queryNumber('form', 0.35),
  }));

  /**
   * A dead context has to take the whole layer down with it.
   *
   * The set is a full-viewport canvas sitting on top of the field, and its
   * opacity is written by the camera — which stops writing anything the moment
   * the context goes. Leaving it mounted paints an opaque black rectangle over
   * a field that is still running perfectly well underneath, which reads as
   * "the rain broke" and sends you looking in the wrong file. The experience
   * drops to the DOM television here; a lab has nothing to fall back to, so it
   * says so instead.
   */
  const [contextLost, setContextLost] = useState(false);
  const handleContextLost = useCallback(() => setContextLost(true), []);

  // The camera reads progress every frame. Driving it through React state
  // would quantise the pull-back to the render rate and hide exactly the kind
  // of stutter this lab exists to find, so the slider writes a ref and the
  // React copy is only there to render the label.
  const progress = useRef(ui.progress);
  progress.current = ui.progress;

  const progressRef = useMemo<LiveValue<number>>(
    () => ({
      get current(): number {
        return progress.current;
      },
    }),
    [],
  );

  const tensionRef = useMemo<LiveValue<number>>(() => ({ current: 0 }), []);

  const rainParams = useRef<RainParams>({
    quality: ui.quality,
    paused: false,
    time: 0,
    progress: 0.6,
    reducedMotion: ui.reducedMotion,
    debug: false,
    form: { face: ui.form, figure: ui.form * 0.6, hand: 0 },
    chaos: NORMAL_CHAOS,
    // The point of the whole lab: one field, published once, consumed by both
    // the page underneath and the television's SIGNAL channel.
    publish: true,
  });
  rainParams.current = {
    quality: ui.quality,
    paused: false,
    time: 0,
    progress: 0.6,
    reducedMotion: ui.reducedMotion,
    debug: false,
    form: { face: ui.form, figure: ui.form * 0.6, hand: 0 },
    chaos: NORMAL_CHAOS,
    publish: true,
  };

  const rainRef = useRainCanvas(seed, rainParams);

  const controllerOptions = { width: 320, height: 240, onDiscoverUnlisted: noop };
  const asyncController = useTVController(controllerOptions);
  const instantController = useInstantTVController(controllerOptions);
  const { controller, snapshot } = instant ? instantController : asyncController;

  const handlePress = useCallback(
    (id: TVButtonId) => {
      controller?.store.press(id);
    },
    [controller],
  );

  // Drive both the camera path and the television's own state machine from
  // the same progress. Without this the set stays `dormant` and the screen
  // stays powered down, which would make the end of the reveal look broken.
  useEffect(() => {
    if (controller) controller.store.setProgress(ui.progress);
  }, [controller, ui.progress]);

  // Autoplay scrubs the slider itself, so what is being watched is the same
  // value path a scroll would produce, only at a rate that can be repeated.
  useEffect(() => {
    if (!ui.playing) return;
    let raf = 0;
    let last = performance.now();
    const step = (now: number): void => {
      raf = requestAnimationFrame(step);
      const delta = (now - last) / 1000;
      last = now;
      setUi((p) => {
        const next = p.progress + delta / AUTOPLAY_SECONDS;
        return next >= 1 ? { ...p, progress: 1, playing: false } : { ...p, progress: next };
      });
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [ui.playing]);

  const readout = useRevealReadout();

  return (
    <>
      <canvas ref={rainRef} style={CANVAS} />

      <div className="television" data-active={!contextLost} data-fallback="false">
        {controller && snapshot && !contextLost && (
          <TVCanvas
            manager={controller.manager}
            snapshot={snapshot}
            quality={ui.quality}
            maxDpr={1.5}
            baseFps={30}
            reducedMotion={ui.reducedMotion}
            staticView={ui.staticView}
            progressRef={progressRef}
            tensionRef={tensionRef}
            tearImpulse={0}
            instant={instant}
            active
            onPress={handlePress}
            onContextLost={handleContextLost}
          />
        )}
      </div>

      {ui.grid && <SeamGrid />}

      {panel && (
        <div style={PANEL}>
          <Title>TV REVEAL LAB</Title>

          {contextLost && (
            <div style={{ color: '#e07a8a', marginBottom: 8 }}>
              webgl context lost — set is gone, field below is still live
            </div>
          )}

          <Slider
            label="reveal progress"
            value={ui.progress}
            min={0}
            max={1}
            step={0.001}
            decimals={3}
            onChange={(value) => setUi((p) => ({ ...p, progress: value, playing: false }))}
          />

          <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
            {[0, 0.35, 0.7, 1].map((mark) => (
              <button
                key={mark}
                type="button"
                style={BUTTON}
                onClick={() => setUi((p) => ({ ...p, progress: mark, playing: false }))}
              >
                {Math.round(mark * 100)}
              </button>
            ))}
            <button
              type="button"
              style={BUTTON}
              onClick={() =>
                setUi((p) => ({
                  ...p,
                  playing: !p.playing,
                  progress: p.playing ? p.progress : 0,
                }))
              }
            >
              {ui.playing ? 'stop' : 'play'}
            </button>
          </div>

          <Group label="the seam" />
          <div style={{ opacity: 0.85, marginBottom: 6, lineHeight: 1.6 }}>
            <div>
              screen rect {readout.width.toFixed(0)}×{readout.height.toFixed(0)} at{' '}
              {readout.x.toFixed(0)},{readout.y.toFixed(0)}
            </div>
            <div>
              viewport {readout.viewWidth}×{readout.viewHeight}
            </div>
            <div style={{ color: readout.covers ? '#8fe0a4' : '#e07a8a' }}>
              covers viewport: {readout.covers ? 'yes' : 'no'}
            </div>
            <div>handoff {readout.handoff.toFixed(3)}</div>
            <div>glass {readout.glass.toFixed(3)}</div>
          </div>

          <Group label="rig" />
          <Slider
            label="form in the signal"
            value={ui.form}
            min={0}
            max={1}
            onChange={(form) => setUi((p) => ({ ...p, form }))}
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
          <Toggle
            label="static view (tier 2)"
            value={ui.staticView}
            onChange={(staticView) => setUi((p) => ({ ...p, staticView }))}
          />
          <Toggle
            label="reduced motion"
            value={ui.reducedMotion}
            onChange={(reducedMotion) => setUi((p) => ({ ...p, reducedMotion }))}
          />
          <Toggle
            label="edge grid"
            value={ui.grid}
            onChange={(grid) => setUi((p) => ({ ...p, grid }))}
          />

          {snapshot && (
            <div style={{ marginTop: 8, opacity: 0.7 }}>
              {snapshot.channelId} · {snapshot.state}
              {snapshot.powered ? '' : ' · off'}
            </div>
          )}
        </div>
      )}
    </>
  );
}

interface Readout {
  x: number;
  y: number;
  width: number;
  height: number;
  handoff: number;
  glass: number;
  viewWidth: number;
  viewHeight: number;
  covers: boolean;
}

/**
 * Polls the published reveal state a few times a second.
 *
 * Deliberately not a per-frame subscription: this is a readout for a human,
 * and re-rendering the panel sixty times a second would cost more than the
 * scene it is measuring.
 */
function useRevealReadout(): Readout {
  const [value, setValue] = useState<Readout>(() => emptyReadout());

  useEffect(() => {
    const tick = (): void => {
      const viewWidth = window.innerWidth;
      const viewHeight = window.innerHeight;
      setValue({
        x: revealState.x,
        y: revealState.y,
        width: revealState.width,
        height: revealState.height,
        handoff: revealState.handoff,
        glass: glassStrength(),
        viewWidth,
        viewHeight,
        // One pixel of slack in each direction: the camera sits fractionally
        // closer than the exact solution precisely so rounding cannot open a
        // gap, and an assertion that ignores that would fail on every device.
        covers:
          revealState.x <= 1 &&
          revealState.y <= 1 &&
          revealState.x + revealState.width >= viewWidth - 1 &&
          revealState.y + revealState.height >= viewHeight - 1,
      });
    };
    tick();
    const timer = window.setInterval(tick, 200);
    return () => window.clearInterval(timer);
  }, []);

  return value;
}

function emptyReadout(): Readout {
  return {
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    handoff: 0,
    glass: 0,
    viewWidth: 0,
    viewHeight: 0,
    covers: false,
  };
}

/**
 * Thin lines on the viewport edges and centre.
 *
 * The failure this catches is a one-pixel strip of empty room down the side of
 * the picture at progress 0, which is invisible against a dark field until you
 * have something straight to compare it to.
 */
function SeamGrid(): React.JSX.Element {
  const line: React.CSSProperties = {
    position: 'fixed',
    background: 'rgba(255,192,201,0.35)',
    pointerEvents: 'none',
    zIndex: 999,
  };
  return (
    <>
      <div style={{ ...line, left: 0, top: 0, bottom: 0, width: 1 }} />
      <div style={{ ...line, right: 0, top: 0, bottom: 0, width: 1 }} />
      <div style={{ ...line, left: 0, right: 0, top: 0, height: 1 }} />
      <div style={{ ...line, left: 0, right: 0, bottom: 0, height: 1 }} />
      <div style={{ ...line, left: '50%', top: 0, bottom: 0, width: 1, opacity: 0.5 }} />
      <div style={{ ...line, top: '50%', left: 0, right: 0, height: 1, opacity: 0.5 }} />
    </>
  );
}

function noop(): void {
  // The lab has nothing to do with an unlisted-channel discovery or a lost
  // context; both are experience-level concerns and neither is being tested.
}
