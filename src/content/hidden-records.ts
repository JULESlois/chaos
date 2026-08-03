/**
 * Everything personal about this site lives here, and nowhere else.
 *
 * None of it appears in the page. It is only reachable inside the television
 * at the end of the scroll, which is the whole conceit: the work and the
 * person behind the piece are an easter egg in the piece, not its subject.
 *
 * Editing this file is the only thing required to make the site someone
 * else's — no component reads a name, a title or a URL from anywhere but here.
 */

export interface OperatorRecord {
  readonly callsign: string;
  readonly role: string;
  readonly status: string;
  readonly lines: readonly string[];
}

export interface WorkRecord {
  readonly id: string;
  readonly title: string;
  readonly year: number;
  readonly stack: string;
  readonly lines: readonly string[];
}

export interface ContactRecord {
  readonly label: string;
  readonly value: string;
  /** Opened when the reader clicks the row on the screen. Null is inert. */
  readonly href: string | null;
}

export const operator: OperatorRecord = {
  callsign: 'OPERATOR-07',
  role: 'frontend / rendering',
  status: 'partially reconstructed',
  lines: [
    'Builds interfaces and the parts',
    'of them nobody notices until',
    'they break.',
    '',
    'Works between product surface',
    'and rendering internals:',
    'design systems that must stay',
    'legible, real-time visuals',
    'that must stay cheap.',
  ],
};

export const records: readonly WorkRecord[] = [
  {
    id: 'REC-001',
    title: 'VISUAL SIGNAL ENGINE',
    year: 2026,
    stack: 'TS / CANVAS 2D',
    lines: [
      'Character-grid renderer for',
      'ambient real-time fields.',
      'Fixed frame budget, no per-',
      'frame allocation after warmup.',
    ],
  },
  {
    id: 'REC-002',
    title: 'CONTROLLED CHAOS',
    year: 2026,
    stack: 'TS / STATE MACHINES',
    lines: [
      'Deterministic failure timeline.',
      'Seeded corruption, authored',
      'escalation, bounded feedback.',
      'Same scroll breaks the same way.',
    ],
  },
  {
    id: 'REC-003',
    title: 'RECEIVER',
    year: 2026,
    stack: 'THREE.JS / GLSL',
    lines: [
      'CRT television with a scroll-',
      'driven camera, canvas channels',
      'behind a switch lock, and a',
      'four-level degradation ladder.',
    ],
  },
];

export const contacts: readonly ContactRecord[] = [
  { label: 'SOURCE', value: 'github.com/JULESlois/chaos', href: 'https://github.com/JULESlois/chaos' },
  { label: 'MAIL', value: 'operator@node07.invalid', href: null },
  { label: 'GRID', value: '51.7N / 00.2W', href: null },
];

/** Shown on the channel that is not in the table. */
export const unlistedTransmission: readonly string[] = [
  'CHANNEL NOT IN TABLE',
  '',
  'You pressed five buttons in an',
  'order nobody told you.',
  '',
  'There is nothing else hidden.',
  'That was the whole thing.',
  '',
  'Thank you for looking.',
];
