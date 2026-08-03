import type { OperatorProfile } from '@/types/content';

/**
 * Single source of truth for personal information.
 * Replace the values here to make the site yours — no component edits required.
 */
export const profile: OperatorProfile = {
  nodeId: 'NODE 07',
  callsign: 'OPERATOR-07',
  displayName: 'UNKNOWN',
  role: 'frontend developer',
  status: 'partially reconstructed',
  location: 'GRID 51.7N / 00.2W',
  heroLines: [
    'I build interfaces, interactive systems,',
    'and experiences between clarity',
    'and controlled disorder.',
  ],
  summary: [
    'Frontend engineer working on interactive systems, rendering pipelines and the parts of an interface that most people never notice until they break.',
    'Most of my work sits between product surface and rendering internals: design systems that must stay legible, and real-time visuals that must stay cheap.',
    'This archive is a working record. Some entries are incomplete on purpose; others were incomplete before I got here.',
  ],
  skills: [
    {
      group: 'Interface',
      items: [
        'React / TypeScript',
        'Design systems & tokens',
        'Accessibility (WCAG 2.2 AA)',
        'Progressive enhancement',
        'Motion & interaction design',
      ],
    },
    {
      group: 'Rendering',
      items: [
        'Canvas 2D pipelines',
        'WebGL / Three.js',
        'GLSL shaders',
        'Frame budgeting & profiling',
        'Procedural texture generation',
      ],
    },
    {
      group: 'Systems',
      items: [
        'State machines',
        'Event buses & schedulers',
        'Build tooling (Vite, esbuild)',
        'Testing (Vitest, Testing Library)',
        'Performance telemetry',
      ],
    },
  ],
  tools: [
    'Vite',
    'Three.js',
    'Motion',
    'Vitest',
    'Playwright',
    'Figma',
    'Blender (blockout only)',
    'Spectral analysers',
    'A notebook that predates the archive',
  ],
  timeline: [
    {
      period: '2024 — present',
      role: 'Senior Frontend Engineer',
      organisation: 'Undisclosed / contract',
      detail:
        'Interactive product surfaces, rendering performance work, and design-system maintenance for teams that ship daily.',
    },
    {
      period: '2021 — 2024',
      role: 'Frontend Engineer',
      organisation: 'Signal-adjacent studio',
      detail:
        'Built visualisation tooling and real-time dashboards. Owned the Canvas rendering layer and its degradation paths.',
    },
    {
      period: '2019 — 2021',
      role: 'Developer',
      organisation: 'Small agency',
      detail:
        'Marketing sites, then internal tools, then the realisation that internal tools are more interesting.',
    },
    {
      period: '????',
      role: 'Archive maintainer',
      organisation: 'NODE 07',
      detail:
        'No employment record exists for this period. The archive lists it anyway.',
    },
  ],
  interests: [
    'Analogue video artefacts and how to fake them cheaply',
    'Typography under hostile rendering conditions',
    'Procedural generation with a fixed frame budget',
    'Interfaces that admit uncertainty instead of hiding it',
    'Field recordings of empty buildings',
  ],
  contacts: [
    { label: 'Email', value: 'operator@node07.invalid', href: 'mailto:operator@node07.invalid' },
    { label: 'Source', value: 'github.com/operator-07', href: 'https://github.com/' },
    { label: 'Transmission', value: '@operator_07', href: 'https://example.com/' },
  ],
};
