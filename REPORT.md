# CHAOS — dynamic code rain imaging & the television reveal

A report on the refactor carried out on branch `visual/rain-forms-tv-reveal`.

Two things were asked for. First, that the code rain form faces, figures and
hands *while continuing to fall* — the shape being a property of how the rain
behaves at a coordinate, not particles stopping to hold a silhouette. Second,
that the end of the page stop being a transition to a television and become the
discovery that the whole site was always inside one.

Both are now true, and both are asserted by tests rather than claimed here.

---

## 1. The thing that was wrong

The retired system had a shape and drew rain near it. A mask said *there is a
face at these coordinates*, and characters were placed to satisfy it. That is
ASCII art with an animated background, and it fails in a specific, visible way:
to hold a picture, the rain has to stop, and the moment it stops the piece stops
being about a signal and starts being about a portrait.

The fix is a change of direction in the data flow. Nothing now knows where a
character should go. The rain decides that, as it always did, and the form is a
question the rain asks on the way past.

## 2. `FormSample` — the whole argument, in five numbers

`src/visuals/ascii/rain/rain-types.ts:60`

```ts
export interface FormSample {
  density: number;        // raises brightness, slows the local rain
  edge: number;           // brief highlight, used for outlines
  depth: number;          // depth/speed cue; stretches and enlarges
  voidValue: number;      // suppresses characters — negative space
  temporalDelay: number;  // how far back in time this rain is sampled from
}
```

There is no `x` and no `y` on that record, and that absence is the design. A
modulator that cannot return a coordinate cannot place a character; the most it
can do is tell the rain already passing through a point to behave differently.

A test asserts the key set exactly
(`src/visuals/ascii/rain/form-modulator.test.ts`), so the day somebody adds a
position to it, the suite fails and says why.

## 3. `FormModulator` — pure lookup, zero allocation

`src/visuals/ascii/rain/form-modulator.ts:53`

`sample(out, nx, ny, time, progress)` writes into a record the caller owns and
returns it. Three masks are summed by weight, with one exception: void is a
carve, so the strongest void at a point wins rather than accumulating
(`form-modulator.ts:78`). Two overlapping forms should not dig a deeper hole
than either of them has.

`active` (`form-modulator.ts:48`) lets the field skip the whole path when no
form is present, which is most of the piece.

## 4. The masks are generated, not authored assets

`src/visuals/ascii/rain/masks/index.ts`

Three 128×128 RGBA buffers built at construction from cheap signed-distance
helpers — ellipses, capsules, boxes. R is density, G is edge, B is depth, A is
void. No files, no SDF module, no fetch. They are read only by the modulator,
which is what stops them becoming pictures: nothing can draw one.

Sampling is bilinear (`sampleMask`), and a test checks that it interpolates
rather than steps, using a real gradient on the figure's shoulder edge.

## 5. What the rain does with the answer

`src/visuals/ascii/rain/rain-field.ts:250–348`

| channel | effect | line |
| --- | --- | --- |
| density | local speed × `mix(1, 0.55, density)` | `rain-field.ts:274` |
| density | brightness × `1 + density·0.75` | `rain-field.ts:310` |
| edge | brightness × `1 + edge·0.55` | `rain-field.ts:310` |
| depth | alpha, glyph size, x/y scale | `rain-field.ts:315,338–340` |
| void | `voidCut = 1 - void`; below 0.05 the glyph is skipped | `rain-field.ts:292` |
| temporalDelay | column head read from an earlier frame | `rain-field.ts:253` |

Every one of those is a modification of a character the rain was going to draw
anyway. The face is *slower, brighter rain with a hole where the socket is* —
which is why it stays legible while every glyph in it keeps moving.

Note `rain-field.ts:263–273`: density is sampled once per column at the head to
set the column's speed, so the cost of a form does not scale with trail length.

## 6. The negative space is an absence, not a dark shape

`rain-field.ts:292` skips the glyph. It does not draw over it. An eye socket is
somewhere the rain is not, which is the only version of that idea that survives
the rain continuing to move.

## 7. Temporal delay — the form is slightly out of time

`src/visuals/ascii/rain/temporal-buffer.ts`

A ring of past head positions per column. Dense regions read their head from a
few frames ago (`rain-field.ts:253`), so a form lags the field it is made of.
The delay grows with progress (`form-modulator.ts:88`), which is what lets a
shape read as *arriving* rather than switching on.

## 8. The rain never stops — asserted, not asserted-to

`src/visuals/ascii/rain/rain-field.test.ts`

Two tests carry the first goal:

- **keeps falling while a form is present.** With a face, figure and hand all at
  full weight, zero columns have stalled after the field advances.
- **draws fewer glyphs under full form weights.** Averaged over ten frames, a
  fully-formed field draws *fewer* characters than an open one, because void
  carves and nothing adds. A form that added glyphs would be a form being drawn.

The averaging is not incidental. A single socket is a handful of cells out of a
couple of thousand, and one frame of rain noise swamps the difference — the
first version of this test compared a single frame at face weight only, and
failed with the two counts exactly equal.

## 9. Four scenes, one medium

`CurrentScene`, `FormScene`, `ChaosScene`, `SilenceScene` and `TelevisionScene`
all construct a `RainField` and differ only in what they pass to
`makeRainConfig`. CURRENT passes no form and no faults; FORM runs the schedule
below; CHAOS passes faults; SILENCE thins it toward nothing.

`src/visuals/ascii/scenes/form-scene.ts:45`

```ts
w.face   = smoothstep(0.10, 0.30, p) * (1 - smoothstep(0.74, 0.96, p) * 0.85);
w.figure = smoothstep(0.32, 0.52, p) * (1 - smoothstep(0.88, 1.00, p) * 0.70);
w.hand   = smoothstep(0.62, 0.84, p);
```

The windows overlap deliberately: the face is still dissolving when the
shoulders arrive. There is never a cut from one silhouette to the next.

## 10. CHAOS breaks the medium, not the picture

`src/visuals/ascii/rain/rain-types.ts:99` — seven faults, each a property of how
rain moves: `phaseError`, `maskDrift`, `frozen`, `directionInversion`,
`collapse`, `repeat`, under an `intensity` escalation.

`maskDrift` is the interesting one. It slides the masks sideways against the
rain that is drawing them (`FormModulator.setDrift`), so the form and its medium
come apart — which is only a possible failure mode *because* the form was never
a picture. Tests confirm direction inversion actually inverts and that collapse
slows the field.

## 11. One signal surface, shown twice

`src/systems/signal/signal-surface.ts`

There is exactly one rain field in the running site. `AsciiEngine` publishes its
canvas at the end of every frame (`AsciiEngine.ts:441`); the television's SIGNAL
channel blits from it (`signal-channel.ts:55`). Not a second rain with the same
seed — the same pixels, one frame old at worst.

`blit` centre-crops rather than squashing (`signal-surface.ts:78–84`), because a
16:9 page squeezed into a 4:3 screen changes every proportion in the picture at
the exact moment the reader is being asked not to notice a change. Sixteen tests
cover the crop arithmetic and the frame counter, including that the counter
never rewinds when the field restarts.

## 12. The reveal: the camera was always inside the screen

`src/features/tv/scene/reveal-path.ts`

Four stations. The camera starts *in* the picture, comes back through the glass,
the cabinet appears, and it settles in the room close enough to reach the
buttons.

The z of the first two stations is not authored. It is solved every frame from
the camera's own fov and aspect (`fillDistance`, `reveal-path.ts:77`), because
the distance at which the screen plane exactly spans the viewport is different
on a phone held upright than on a desktop, and that distance is the only one at
which the handoff is invisible.

## 13. The crossfade happens before the camera moves

`HANDOFF_IN = 0.015`, `HANDOFF_OUT = 0.07`, `CAMERA_DWELL = 0.085`.

The fade finishes before the camera has moved at all. While it is running, the
WebGL frame and the 2D frame underneath it are the same image at the same size,
so the swap has nothing to give away.

The alternative — moving and fading together — needs the 2D field scaled into a
shrinking rectangle every frame, which is a full-canvas blit plus a second
lower-resolution copy of the signal. This costs 8% of the scroll instead.

A test asserts the ordering directly:
`smoothstep(CAMERA_DWELL, 1, HANDOFF_OUT) === 0`.

## 14. The seam is measured, not asserted in a comment

`publishScreenRect` (`reveal-path.ts:108`) projects the four corners of the
screen plane and publishes the bounding rectangle in CSS pixels to
`revealState`. Nothing has to consume it for the reveal to work, which is the
point: it is a measurement of the invariant, available to check.

`src/features/tv/scene/reveal-path.test.ts` checks it on six viewports —
ultrawide, desktop, laptop, square, phone portrait, phone landscape — and
asserts that at progress 0 the rectangle covers the viewport on every one, and
clears the binding edge by under 3%. A seal, not a zoom.

Extracting the geometry out of `CameraDirector` is what made that possible.
Everything in `reveal-path.ts` is arithmetic on numbers and a camera matrix, so
the claim the whole transition rests on is now checkable in jsdom, on a phone,
with no GPU.

## 15. One curve for the glass

`glassStrength()` (`src/systems/signal/reveal-state.ts:68`)

Two things draw CRT optics and they must never both be at full strength: the
silence screen fakes barrel curvature in 2D so the frame arrives before the
object it belongs to (`silence-scene.ts:104`), and the CRT shader draws them for
real once the set exists (`TVScreen.tsx:214`). They share this one curve, so the
fake fades out on exactly the schedule the real one fades in and no frame is
ever scanlined twice.

It returns 0 when no camera is publishing, which is the DOM-television fallback:
there the 2D leak is the only glass there is, and it stays.

## 16. The buttons wait for the camera, not for the state machine

`src/features/tv/scene/button-arming.ts:21` — `ARM_AT = 0.9`.

The state machine calls the reader interactive at 0.78
(`PHASE_THRESHOLDS.interactive`). The camera is damped and lags the scroll, so
on a fast flick to the bottom of the document the machine says interactive while
the set is still visibly flying toward its final framing. A button that is live
during that half second is a button the reader presses and misses.

A test compares the two thresholds directly, so the relationship is documented
where it cannot rot.

## 17. The press is a press

`src/features/tv/scene/TVButtons.tsx`

The cap travels on pointer-down; the action fires on pointer-up over the same
button. That ordering is the reason to put controls on an object instead of in a
toolbar — the reader gets both halves of a physical button, including the right
to change their mind by sliding off before letting go.

Which means every way a pointer can leave without a clean release has to put the
cap back: `onPointerOut`, `onPointerCancel`, and a window-level `pointerup`
listener for releases that land anywhere else in the document
(`TVButtons.tsx:97`). A key stuck down says the object is broken; a key that
does nothing merely says it is inert.

Presses are collected on an invisible square larger than the cap, and that
square only exists while the control does — an invisible plane quietly eating
pointer events for a dead button makes the page feel unresponsive for no reason
the reader can see.

## 18. The touch targets meet and never overlap

`hitSizes` (`button-arming.ts:51`). The channel buttons sit 0.14 apart; on a
coarse pointer their targets grow to exactly 0.14 and stop. A test asserts they
meet and do not cross, because an overlap makes the boundary between "previous"
and "next" a coin toss, which is worse than a small target. Power is the largest
target and is kept clear of the pair — it is the control that undoes everything.

## 19. Three visual labs

| URL | what it is for |
| --- | --- |
| `?lab=rain` | the medium, with all seven CHAOS faults on sliders |
| `?lab=form` | the field beside the raw mask channels driving it |
| `?lab=tv-reveal` | the camera pull-back, scrubbed by hand, with the seam readout |
| `?lab=flow` | the retired FLOW lab, kept |

Each runs the *real* `RainField`, not a copy. `useRainCanvas`
(`src/labs/rain-canvas.ts`) holds parameters in a ref rather than state, so
dragging a slider retunes a field that never restarts. When paused it feeds a
fixed `1/60` delta, which is what makes a frozen frame reproducible from a URL.

`?lab=form` puts the raw modulator output next to the field at 112×84, drawn in
the site's own two-colour range so the inspector cannot suggest a hue the field
is incapable of producing. If the field ever shows an edge the channel view does
not explain, something is drawing instead of modulating.

`?lab=tv-reveal` is the only lab that publishes to the signal surface, because
that is the thing it is testing. Its panel prints the projected screen rect, the
viewport, `covers viewport: yes/no`, the handoff weight and the glass strength.

## 20. Two bugs the labs found

**The set stayed dormant.** Progress was reaching the camera but not the
television's state machine, so the screen never powered on and the end of the
reveal looked broken. Fixed at `TVRevealLab.tsx:130` by driving both from the
same value.

**A lost WebGL context left a black rectangle over a live field.** The set is a
full-viewport canvas whose opacity is written by the camera — which stops
writing anything the moment the context goes. Leaving it mounted paints opaque
black over rain that is still running perfectly well underneath, which reads as
"the rain broke" and sends you looking in the wrong file. The lab now tears the
set down and says so in the panel (`TVRevealLab.tsx:66`).

That second one was worth separating from an environmental problem: headless
chromium on this platform drops contexts more or less at random, and one capture
came back blank before four repeats came back rich. The blank frames were the
environment; the black rectangle was a real bug in how the lab handled them.

## 21. Tests

255 passing across 20 files. New in this refactor:

| file | tests | what it protects |
| --- | --- | --- |
| `rain/rain-field.test.ts` | 23 | determinism, grid bounds, capacity, and that the rain keeps falling under a form |
| `rain/form-modulator.test.ts` | 18 | the `FormSample` contract, mask geometry, void-vs-density, drift |
| `tv/scene/reveal-path.test.ts` | 33 | the seam on six viewports, fill distance, the lens, the glass curve |
| `tv/scene/button-arming.test.ts` | 14 | arming vs the state machine, touch target geometry |
| `signal/signal-surface.test.ts` | 16 | same-canvas identity, centre-crop arithmetic, frame counter |

`npx tsc -b --noEmit` clean. `npx eslint src` — 0 errors, 111 warnings, all
pre-existing `no-non-null-assertion` in hot loops. `npm run build` succeeds.

## 22. Artifacts

`npm run screenshot:rain` — chromium headless driven directly, because
Playwright will not run under Termux. Every frame comes out of a lab running the
real engine, at a fixed seed and a paused time, so the same URL gives the same
picture on every run.

Stills in `artifacts/`: `rain-current`, `rain-face`, `rain-figure`, `rain-hand`,
`rain-form-masks`, `rain-chaos`, `rain-mobile`, `tv-reveal-00/35/70/100`,
`tv-buttons`, `tv-reveal-seam`.

Sequences: `rain-form-sequence.webm` walks the FORM schedule so the face
arrives, the figure takes over and the hand reaches in — the point being that
the rain is falling in every frame of it. `tv-reveal.webm` walks the camera out
of the picture.

Both are muxed by ffmpeg from numbered deterministic stills, because there is no
video capture on this platform. That turns out to be an advantage: a WebM
assembled from reproducible frames is itself reproducible, and a dropped frame
shows up as a missing file rather than as a stutter nobody notices.

`tv-reveal-seam.png` is the one still that keeps the panel, because the thing
being photographed is the readout: `covers viewport: yes`, in green, at
progress 0, with the edge grid on.
