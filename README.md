# CHAOS

A single-page piece about a signal that keeps trying to become a person, fails,
and is finally revealed to have been playing on a television the whole time.

Everything on screen is one field of falling characters. It forms a face, a
figure and a hand — not by stopping to hold them, but by *falling differently*
where they are. Then it comes apart. Then the camera backs out of the picture
and there is a cabinet around it.

There is one hue. There are no pages, no routes, no navigation. Scroll distance
is the only timeline.

```
stack   React 19 · TypeScript 5.8 · Vite 6 · Three.js (r3f) · Canvas 2D
tests   Vitest 3 · Testing Library · jsdom
```

---

## Running it

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # tsc -b + production bundle
npm run preview
npm run lint
npm run test       # 255 tests
npm run typecheck
```

Node 20+. The bundle splits into app, r3f and three, so a device that never
reaches the television does not pay for it up front.

---

## The six screens

`src/experience/phases.ts` — 800vh total, sliced into six phases. The slices are
declared in viewport heights and the normalised ranges are derived, so retuning
the pacing means changing one number and nothing else has to agree with it.

| phase | vh | what happens |
| --- | --- | --- |
| `void` | 90 | almost nothing. a few characters, far apart |
| `current` | 170 | the rain establishes itself as a medium |
| `form` | 170 | a face, then shoulders, then a hand reaching in |
| `chaos` | 150 | the medium starts failing in seven specific ways |
| `silence` | 100 | it thins toward nothing, and glass begins to leak in |
| `television` | 120 | the camera backs out. there was always a set |

---

## The rain

`src/visuals/ascii/rain/`

Persistent, deterministic columns. A stream owns its speed, length, phase and
mutation cadence for the whole visit; the characters are a function of time
sampled against the stream, never stored per character. Same seed, same field,
every time.

### Forms are behaviours, not pictures

This is the load-bearing idea. `FormModulator.sample()` returns five numbers:

```ts
interface FormSample {
  density: number;        // brighter, and slower
  edge: number;           // outline highlight
  depth: number;          // stretch and enlarge
  voidValue: number;      // suppress — negative space
  temporalDelay: number;  // sample this rain from an earlier frame
}
```

No `x`, no `y`. A modulator that cannot return a coordinate cannot place a
character, so a form can only ever be a modification of rain that was going to
fall through that point anyway. An eye socket is *somewhere the rain is not*.

Three 128×128 masks (`rain/masks/`) are generated at construction from
signed-distance helpers — no assets, no fetch — and are read only by the
modulator. The schedules overlap, so the face is still dissolving when the
shoulders arrive.

Two tests carry the claim: under full form weights **no column has stalled**,
and the field draws **fewer** characters than an open one, because void removes
rain and nothing adds it.

### CHAOS breaks the medium

Seven faults, each a property of how rain moves rather than of the image:
`phaseError`, `maskDrift`, `frozen`, `directionInversion`, `collapse`, `repeat`,
under an `intensity` escalation. `maskDrift` slides the masks sideways against
the rain drawing them — a failure mode that is only *possible* because the form
was never a picture.

---

## One signal surface, shown twice

`src/systems/signal/signal-surface.ts`

There is exactly one rain field in the running site. The ASCII engine publishes
its canvas at the end of every frame; the television's `CH-00 · SIGNAL` channel
blits from it. Not a second rain with the same seed — the same pixels, one frame
old at worst.

The blit centre-crops rather than squashing, because a 16:9 page squeezed into a
4:3 screen changes every proportion in the picture at the exact moment the
reader is being asked not to notice a change.

---

## The reveal

`src/features/tv/scene/reveal-path.ts`

Four stations: the camera starts *inside* the picture, comes back through the
glass, the cabinet appears, and it settles in the room within reach of the
buttons.

The z of the first two stations is not authored — it is solved every frame from
the camera's own fov and aspect, because the distance at which the screen plane
exactly spans the viewport differs between a phone held upright and a desktop,
and that distance is the only one at which the handoff is invisible.

The crossfade finishes *before* the camera moves at all (`HANDOFF_OUT = 0.07`,
`CAMERA_DWELL = 0.085`). While it runs, the WebGL frame and the 2D frame beneath
it are the same image at the same size, so the swap has nothing to give away.

`publishScreenRect` projects the four corners of the screen plane into CSS
pixels and publishes them. Nothing needs to consume it for the reveal to work —
it exists so the invariant can be measured. Tests check six viewports, from
ultrawide to phone-portrait, and assert the rectangle covers the viewport at
progress 0 and clears the binding edge by under 3%.

`glassStrength()` is the single curve shared by the 2D faked CRT optics on the
silence screen and the real CRT shader on the set, so the fake fades out exactly
as the real one fades in and no frame is ever scanlined twice.

---

## The television

`src/features/tv/`

The screen is a `CanvasTexture` fed by **channels** — small 2D-canvas programs
sharing one canvas through `ChannelManager`, which owns the frame cap, the dirty
flag and the transition scratch surface.

```
CH-00 · SIGNAL      the field you have been watching, still running
CH-01 · OPERATOR    who made this
CH-02 · RECORDS     what they have made
CH-03 · CONTACT     how to reach them
CH-04 · SELF IMAGE
CH-?? · UNLISTED    not in the rotation. found, not given
```

All the personal content lives in here. There is no DOM bar under the canvas and
no channel list — the entire control surface is three physical buttons on the
cabinet. Two round ones together step the channel; the square one, set apart, is
power.

The press is a press: the cap travels on pointer-down, and the action fires on
pointer-up over the same button, which means the reader keeps the right to
change their mind by sliding off before letting go. Every way a pointer can
leave without a clean release puts the cap back, including a window-level
listener for releases that land elsewhere in the document.

Buttons arm at camera progress `0.9`, not at the state machine's `0.78`. The
camera is damped and lags the scroll, so on a fast flick to the bottom the
machine says *interactive* while the set is still visibly flying — and a button
that is live then is a button the reader presses and misses.

---

## Degradation

`src/systems/telemetry/capabilities.ts` resolves a device into a render level
that every subsystem reads.

| level | trigger | result |
| --- | --- | --- |
| 0 | high tier, WebGL, motion allowed | full reveal, CRT shader, DPR ≤ 1.5 |
| 1 | medium tier or reduced motion | full reveal, lighter shader, DPR ≤ 1.25 |
| 2 | low tier | static camera at the final station, no drift |
| 3 | no WebGL | DOM television, CSS scanlines, same channel canvas |

A lost WebGL context swaps in the DOM receiver mid-session rather than leaving a
black rectangle. Glyph budgets scale from 1800 to 6000; the channel canvas drops
to 256×192 on a narrow viewport.

Reduced motion is honoured throughout: the camera snaps rather than glides, the
hand-held drift is suppressed, and the field settles.

---

## Visual labs

Development-only views that run the *real* engine, not a copy of it.

| URL | for |
| --- | --- |
| `?lab=rain` | the medium, with all seven CHAOS faults on sliders |
| `?lab=form` | the field beside the raw mask channels driving it |
| `?lab=tv-reveal` | the camera pull-back, scrubbed by hand, with the seam readout |
| `?lab=flow` | the retired FLOW renderer, kept |

Parameters come from the query string and are held in a ref rather than in
state, so dragging a slider retunes a field that never restarts. Paused, the
loop feeds a fixed delta — which is what makes a frozen frame reproducible from
a URL, and what makes the screenshots deterministic.

```bash
npm run screenshot:rain    # stills + webm into artifacts/
npm run screenshot:flow
```

Chromium is driven directly in headless screenshot mode, because Playwright
refuses to run under Termux. Sequences are captured as numbered stills and muxed
with ffmpeg, so a dropped frame shows up as a missing file rather than as a
stutter nobody notices.

---

## Architecture

```
src/
  app/          App (lab dispatch) + provider stack
  experience/   scroll → progress → phase, and the timeline spacers
  visuals/ascii/
    rain/         the rain engine, form modulator, masks, temporal buffer
    scenes/       one per phase; each owns a RainField and differs only in config
    flow/         the retired FLOW renderer
    AsciiEngine   viewport measurement, scene lifecycle, publishes the surface
  features/tv/
    scene/        r3f: room, TV, screen, buttons, camera + reveal-path geometry
    channels/     ChannelManager and one file per channel
    state/        tv-machine (pure reducer) · tv-store (imperative)
  systems/
    signal/       the shared surface, and the published reveal rect
    tension/      the seven visual-tension numbers
    telemetry/    capability detection
    audio/        opt-in WebAudio
  labs/         the four dev labs and their shared kit
```

Two rules shaped it:

1. **Anything worth testing is pure.** The reveal geometry, the button arming
   rules, the tension maths and the TV state machine are plain functions with no
   DOM, no React and no timers. Pulling `reveal-path` and `button-arming` out of
   their components is what let the seam invariant be checked without a GPU.
2. **React never renders per frame.** Animation state lives in refs, canvases
   and Three.js objects. React re-renders when a *phase* changes, not when a
   frame does.

---

## Tests

```bash
npm run test
```

255 tests across 20 files. The ones that carry the design:

| file | what it protects |
| --- | --- |
| `rain/rain-field.test.ts` | determinism, capacity, and that the rain keeps falling under a form |
| `rain/form-modulator.test.ts` | the `FormSample` contract — no coordinates, ever |
| `tv/scene/reveal-path.test.ts` | the seam, on six viewports |
| `tv/scene/button-arming.test.ts` | arming vs the state machine; touch targets that meet but never overlap |
| `signal/signal-surface.test.ts` | same-canvas identity and the centre-crop |
| `AsciiEngine.test.ts` | the glyph budget and the scene lifecycle |

`src/test/setup.ts` gives jsdom what it lacks. `getContext('webgl')` returns
`null` there, so anything that touches the set runs the degradation path.

---

## Non-goals

No router, no UI component library, no state management library, no CMS, no
analytics, no `eval`, no `any`. One hue, one field, one idea.
