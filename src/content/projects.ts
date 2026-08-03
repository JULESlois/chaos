import type { ProjectRecord } from '@/types/content';

/**
 * Demo archive records. Add or replace entries freely —
 * routes, the archive index and TV channel CH-02 all read from this array.
 */
export const projects: ProjectRecord[] = [
  {
    id: 'REC-001',
    slug: 'visual-signal-engine',
    title: 'VISUAL SIGNAL ENGINE',
    subtitle: 'Character-grid renderer for real-time ambient visuals',
    type: 'INTERACTIVE SYSTEM',
    year: 2026,
    status: 'verified',
    integrity: 91,
    summary:
      'A Canvas 2D character-grid engine that renders drifting ASCII fields at a fixed frame budget, with pointer, scroll and event-driven deformation.',
    technologies: ['TypeScript', 'Canvas 2D', 'Web Workers', 'Vite'],
    responsibilities: [
      'Engine architecture and frame scheduler',
      'Pre-allocated cell buffers and glyph atlas',
      'Adaptive quality ladder (45 / 30 / 24 FPS)',
      'Reduced-motion and pause-on-hidden behaviour',
    ],
    problem: [
      'Ambient background visuals routinely eat an entire frame budget. Most character-rain implementations allocate per frame, redraw every cell and stall on text measurement.',
      'The requirement was an always-on background that costs less than 4ms per frame on a mid-range laptop and degrades without visual popping.',
    ],
    constraints: [
      'No per-frame allocation after warm-up.',
      'Must pause completely when the tab is hidden.',
      'Must remain readable behind body copy at all times.',
      'Single Canvas element, no DOM per glyph.',
    ],
    process: [
      {
        heading: 'Measure first',
        body: [
          'Profiling an existing implementation showed 68% of frame time in fillText and 19% in garbage collection from per-frame object literals.',
          'That split determined the whole design: batch draws by colour bucket, and pre-allocate every cell.',
        ],
      },
      {
        heading: 'Grid over particles',
        body: [
          'Particles were replaced by a fixed grid whose cells sample a scalar field. The field moves; the cells do not.',
          'This bounds the work per frame at exactly rows × columns regardless of activity.',
        ],
      },
    ],
    implementation: [
      {
        heading: 'Cell buffer',
        body: [
          'Cells live in flat typed arrays — one Float32Array for intensity, one Uint8Array for glyph index. No object graph, no GC pressure.',
          'Glyph selection maps intensity through a ramp so the character set reads as a luminance gradient.',
        ],
      },
      {
        heading: 'Adaptive quality',
        body: [
          'A rolling frame-time average drives a three-step quality ladder. Drops are gradual and hysteretic, so the engine never oscillates between tiers.',
        ],
      },
    ],
    evidence: [
      { caption: 'FIG.01 — glyph ramp calibration', seed: 1201, alt: 'Procedural diagram of a character intensity ramp' },
      { caption: 'FIG.02 — frame time distribution', seed: 4417, alt: 'Procedural chart of frame time distribution' },
    ],
    outcome: [
      'Steady 2.1ms average frame cost at 5800 cells on a mid-range laptop.',
      'Zero allocations per frame after warm-up, confirmed in the allocation profiler.',
      'Now the background layer of this archive.',
    ],
    anomalies: [
      'Cell 4471 occasionally reports an intensity above 1.0. The clamp handles it. The cause was never found.',
    ],
    repositoryUrl: 'https://github.com/',
  },
  {
    id: 'REC-002',
    slug: 'crt-reconstruction',
    title: 'CRT RECONSTRUCTION',
    subtitle: 'Physically-loose CRT emulation for WebGL surfaces',
    type: 'RENDERING RESEARCH',
    year: 2025,
    status: 'partial',
    integrity: 64,
    summary:
      'A single-pass fragment shader reproducing curvature, scanlines, chroma separation and horizontal desync on a texture — cheap enough to run on integrated GPUs.',
    technologies: ['GLSL', 'Three.js', 'WebGL2', 'Canvas 2D'],
    responsibilities: [
      'Shader authoring and uniform design',
      'Barrel distortion + vignette in a single pass',
      'Event-driven tear and rolling-band effects',
      'Fallback material for low-capability devices',
    ],
    problem: [
      'Most CRT shaders are ports of arcade filter chains: four or five passes, heavy bloom, and a look that fights any text placed on top.',
      'This needed a one-pass version whose intensity could be modulated by application state rather than baked in.',
    ],
    constraints: [
      'One pass, no framebuffer ping-pong.',
      'All effects individually scalable to zero for reduced-motion.',
      'Must not be applied to the whole scene, only the screen surface.',
    ],
    process: [
      {
        heading: 'Subtract until it reads',
        body: [
          'Every effect was tuned by starting at an obviously excessive value and reducing until the underlying content became legible again. The final values are all far lower than reference implementations.',
        ],
      },
    ],
    implementation: [
      {
        heading: 'Single-pass ordering',
        body: [
          'UV curvature is applied first so every subsequent sample inherits the distortion. Chroma separation samples three offset UVs; scanlines and the rolling band are multiplicative; noise is added last before the vignette.',
        ],
      },
      {
        heading: 'Glass layer',
        body: [
          'Reflection and dust live on a separate transparent convex mesh in front of the screen plane, so the emissive content is never dimmed by the reflection term.',
        ],
      },
    ],
    evidence: [
      { caption: 'FIG.01 — curvature grid test', seed: 7781, alt: 'Procedural barrel distortion test grid' },
      { caption: 'FIG.02 — chroma offset sweep', seed: 3390, alt: 'Procedural chroma separation sweep' },
    ],
    outcome: [
      '0.4ms on integrated graphics at 512×384 screen resolution.',
      'All parameters exposed as uniforms and driven by the site entropy value.',
    ],
    anomalies: [
      'Build 41 rendered a frame that matched no channel in the table. Not reproducible.',
      'Integrity score has declined twice since the record was sealed.',
    ],
  },
  {
    id: 'REC-003',
    slug: 'controlled-chaos-scheduler',
    title: 'CONTROLLED CHAOS SCHEDULER',
    subtitle: 'Budgeted anomaly director for narrative interfaces',
    type: 'SYSTEM DESIGN',
    year: 2025,
    status: 'verified',
    integrity: 88,
    summary:
      'A central scheduler that turns interaction telemetry into a single entropy value and spends it on recoverable visual anomalies under strict cooldown budgets.',
    technologies: ['TypeScript', 'Reducer pattern', 'Vitest'],
    responsibilities: [
      'Entropy model and input normalisation',
      'Cooldown and budget rules',
      'Pure reducer for testability',
      'Stabilise mode kill-switch',
    ],
    problem: [
      'Interfaces that scatter Math.random() across components produce noise, not tension. Effects collide, repeat, and eventually annoy.',
      'The system needed a single authority deciding what may glitch, when, and how often.',
    ],
    constraints: [
      'Every anomaly must be recoverable — no permanent DOM damage.',
      'Anomalies must never touch form inputs or navigation.',
      'One global kill-switch must silence everything instantly.',
    ],
    process: [
      {
        heading: 'Budget, not probability',
        body: [
          'Rather than rolling dice per component, the director holds a budget: at most two micro anomalies per 10s window, one medium, and a 45s lockout after any major event.',
          'Randomness only selects between eligible events; it never decides whether an event may fire.',
        ],
      },
    ],
    implementation: [
      {
        heading: 'Pure reducer core',
        body: [
          'All scheduling logic is a pure function of (state, tick) so the entire behaviour is unit-testable without a DOM or timers.',
          'The React provider is a thin shell that feeds it telemetry and publishes results on an event bus.',
        ],
      },
    ],
    evidence: [
      { caption: 'FIG.01 — entropy response curve', seed: 5150, alt: 'Procedural entropy response curve' },
      { caption: 'FIG.02 — cooldown window map', seed: 9002, alt: 'Procedural cooldown window diagram' },
    ],
    outcome: [
      'Anomaly frequency stayed within budget across a 30-minute soak test.',
      'Stabilise mode measured at zero scheduled events over the same period.',
    ],
    anomalies: [
      'The soak test log contains one event with an id that is not in the event table.',
    ],
    repositoryUrl: 'https://github.com/',
    demoUrl: 'https://example.com/',
  },
  {
    id: 'REC-004',
    slug: 'redacted-transmission',
    title: '████████ TRANSMISSION',
    subtitle: 'Record sealed — integrity below release threshold',
    type: 'CLASSIFIED',
    year: 2024,
    status: 'classified',
    integrity: 12,
    summary:
      'Record contents are not available at this access level. The index retains the header only.',
    technologies: ['████', '████████', 'TypeScript'],
    responsibilities: ['████████████', 'Signal reconstruction', '████'],
    problem: [
      'Record body unavailable. The archive retains the problem statement length (412 words) but not its content.',
    ],
    constraints: ['Access constraints prevent display of this section.'],
    process: [
      {
        heading: '████████',
        body: ['This section failed checksum validation on three consecutive reads.'],
      },
    ],
    implementation: [
      {
        heading: 'Reconstruction attempt',
        body: [
          'Partial recovery produced 31 lines of source. None of them parse.',
        ],
      },
    ],
    evidence: [
      { caption: 'FIG.01 — recovered fragment', seed: 6666, alt: 'Procedural corrupted data fragment' },
    ],
    outcome: ['Record retained for index completeness only.'],
    anomalies: [
      'This record was not present in the previous archive snapshot.',
      'Its creation timestamp is later than the snapshot that lacks it.',
    ],
  },
];

export function findProjectBySlug(slug: string): ProjectRecord | undefined {
  return projects.find((project) => project.slug === slug);
}
