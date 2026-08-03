# NODE 07 — Archive Terminal

A personal portfolio built as a **simulated-horror archive terminal**: a static
records system that is being slowly eroded by an anomalous signal. The horror
is structural, not decorative — nothing jumps out, nothing screams. The
interface simply behaves as if something else has partial write access to it.

Everything is local fiction. The site makes no network requests, stores nothing
beyond two preference flags in `localStorage`, and reads no device data beyond
what is needed to pick a rendering quality level.

```
stack   React 19 · TypeScript 5.8 · Vite 6 · React Router 7 · Three.js (r3f) · Canvas 2D
tests   Vitest 3 · Testing Library · jsdom
```

---

## Running it

```bash
npm install      # install dependencies
npm run dev      # dev server at http://localhost:5173
npm run build    # typecheck (tsc -b) + production bundle into dist/
npm run preview  # serve the production build
npm run lint     # eslint, zero warnings allowed
npm run test     # vitest run (73 tests)
npm run typecheck
```

Node 20+ is expected. The production build emits three chunks (app, r3f,
three) so devices that never reach the 3D chapter do not pay for it upfront.

---

## What is in it

### Content first

The site is a portfolio before it is an experiment. Every record is readable
with JavaScript effects disabled or stabilised, at any viewport width, with a
keyboard only.

| route             | contents                                                        |
| ----------------- | --------------------------------------------------------------- |
| `/`               | Identity, the receiver chapter, index of records                  |
| `/archive`        | Full record table with status, integrity, year                    |
| `/archive/:slug`  | One record: summary, problem, constraints, process, implementation, evidence, outcome, anomaly log |
| `/operator`       | The person behind the archive — skills, background, contact       |
| `/logs`           | System log stream, in-world                                       |
| `/signal`         | Unlisted. Not in the index. Reachable three different ways        |
| `*`               | `ERROR 404` — and a hidden entrance                               |

### The four systems

**1 · ASCII signal field** (`src/systems/ascii/`)
A full-viewport character grid rendered on one 2D canvas. Cells are updated on
a dirty-rect basis, the glyph budget scales with the device (1800–6000 cells),
and the field can be asked to *converge on the television screen* while the
signal is locked (`tv:absorb` / `tv:release` on the signal bus).

**2 · Controlled Chaos** (`src/systems/chaos/`)
The single source of "wrongness" in the interface. Nothing in the UI decides on
its own to glitch; it subscribes to this director instead.

- `entropy.ts` — pure functions mapping dwell time, scroll velocity, route
  depth and idle time onto an entropy value (0–1), plus asymmetric smoothing
  (rises quickly, decays slowly) and the entropy → `stable | unstable |
  critical` banding.
- `chaos-reducer.ts` — a pure reducer that owns the **budget**: cooldowns per
  event, a minimum gap between any two events, at most 2 micro + 1 medium
  event per rolling window, a 45 s lockout after a major event, and no two
  majors back to back. The reducer is what makes the anomalies feel authored
  rather than random.
- `chaos-director.ts` — a 10 Hz loop that feeds signals into the reducer and
  emits the resulting events; `ChaosProvider` publishes a throttled snapshot to
  React and mirrors `data-signal` / `data-stabilised` onto `<html>` so CSS can
  react without re-rendering anything.

Nine anomalies exist (glyph substitution, dead column, clock desync, checksum
failure, horizontal tear, temporary redaction, phantom record, observer
detected, signal silence). Most people will see three or four in a visit.

**3 · The receiver** (`src/features/tv/`)
A low-poly CRT television standing in a dark room, and the centrepiece of the
page. Scrolling through the chapter moves a camera along a Catmull-Rom curve
through four stations, and the television's state machine advances with it:

```
dormant → detected → approaching → aligning → interactive
                                                 ↕
                                             switching / powered-off
```

The screen is a `CanvasTexture`. Its content comes from **channels** — small
2D-canvas programs (`boot`, `observer`, `archive`, `flow`, and one unlisted)
sharing a single canvas via `ChannelManager`, which owns the frame cap, the
dirty flag and the transition scratch surface. Channel switching runs a fixed
timeline (`displace → compress → snow → expand`) behind a **switch lock**: a
burst of button presses buffers only the latest target and lands there in one
chained animation instead of queueing five of them.

The set is operable three ways, all equivalent: the 3D buttons on the cabinet,
the DOM control bar underneath, and the keyboard (`←` `→` change channel, `p`
toggles power). The DOM controls are not a fallback — they are the accessible
primary path and exist in every rendering mode.

**4 · Command console** (`src/components/navigation/`)
`Ctrl`/`Cmd`+`K` or `/` opens it. Commands are matched against a static table;
there is no `eval`, no dynamic import of user input, and an unknown command
gets an explicit error rather than a mysterious silence.

```
help · whoami · archive [slug] · logs · contact · clear
stabilize [on|off] · entropy · audio [on|off] · exit
```

Four more commands exist and are deliberately absent from `help` and from tab
completion. They are found, not given.

---

## Degradation

Capability detection (`src/systems/telemetry/capabilities.ts`) resolves a
device into one of four render levels, and every subsystem reads from it.

| level | trigger                          | receiver                                   |
| ----- | -------------------------------- | ------------------------------------------- |
| 0     | high tier, WebGL, motion allowed | full scene, CRT shader, shadows, DPR ≤ 1.5   |
| 1     | medium tier or reduced motion    | full scene, no shadows, lighter shader, DPR ≤ 1.25 |
| 2     | low tier                         | static camera at the final station, no drift |
| 3     | no WebGL                         | DOM television: same channel canvas, CSS scanlines |

Additionally:

- A lost WebGL context is caught and swaps the scene for the DOM receiver
  mid-session rather than leaving a black rectangle.
- The r3f `frameloop` is set to `never` whenever the chapter is off-screen, so
  scrolling past the television costs nothing.
- `PerformanceMonitor` drops the device pixel ratio on sustained decline.
- Channel frame caps are budgeted per state — an idle channel runs far slower
  than one mid-transition.

### Stabilise mode

`prefers-reduced-motion`, the header toggle, or `stabilize on` in the console
all lead to the same place: entropy is pinned to zero, no anomalies fire, the
camera stops drifting, transitions shorten and the ASCII field settles. The
preference persists across visits. **Every piece of content remains reachable
in stabilised mode** — nothing narrative is hidden behind motion.

Audio is off by default and only initialises after an explicit opt-in (the
header toggle, or `audio on`). It is ambient hum and switch clicks; there is no
music, nothing plays without a user gesture, and the toggle is disabled outright
while stabilised.

---

## Architecture

```
src/
  app/          router, provider stack, shell (layer order 0–5)
  pages/        one file per route, content only
  components/   layout chrome, archive presentation, console
  features/tv/  the receiver chapter
    state/        tv-machine.ts (pure reducer) · tv-store.ts (imperative store)
    channels/     ChannelManager + one file per channel + shared runtime
    scene/        r3f components: room, TV, screen, buttons, camera, runtime
    hooks/        scroll driver, controller wiring
    shaders/      crt.vert / crt.frag
  systems/
    ascii/        character-field engine
    chaos/        entropy, reducer, director, provider
    audio/        WebAudio engine, opt-in provider
    telemetry/    capability detection, system provider
  content/       records, logs, profile (typed data, no CMS)
  styles/        tokens + per-area CSS, no UI framework
  utils/         math helpers, typed signal bus
```

Two rules shaped this layout:

1. **Anything worth testing is pure.** The entropy maths, the chaos budget and
   the television state machine are plain functions with no DOM, no React and
   no timers. The imperative parts (director loop, channel manager, store) wrap
   them.
2. **React never renders per frame.** Animation state lives in refs, canvases
   and Three.js objects. React re-renders when a *phase* changes, not when a
   frame does.

---

## Tests

```bash
npm run test
```

73 tests across nine areas:

| area                       | file                                        |
| -------------------------- | ------------------------------------------- |
| entropy calculation        | `src/systems/chaos/entropy.test.ts`         |
| chaos budget & cooldowns   | `src/systems/chaos/chaos-reducer.test.ts`   |
| stabilise mode             | `src/systems/chaos/chaos-reducer.test.ts`   |
| TV state machine           | `src/features/tv/state/tv-machine.test.ts`  |
| channel switch lock        | `src/features/tv/state/tv-store.test.ts`    |
| console command parsing    | `src/components/navigation/console-commands.test.ts` |
| unknown command handling   | `src/components/navigation/console-commands.test.ts` |
| project routing            | `src/app/routing.test.tsx`                  |
| WebGL degradation          | `src/systems/telemetry/capabilities.test.ts`, `src/app/routing.test.tsx` |

`src/test/setup.ts` gives jsdom the pieces it lacks (a no-op 2D context,
`matchMedia`, the observers). Because `getContext('webgl')` returns `null`
there, the routing tests run the *entire* application through the level-3
degradation path — the DOM receiver is verified by the same tests that verify
the routes.

---

## Non-goals

No Next.js, no UI component library, no Redux, no post-processing stack, no
CMS, no analytics, no `eval`, no `any`, no non-null assertions. The horror
budget was spent on timing and restraint, not on volume.
