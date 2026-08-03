import type { LogEntry } from '@/types/content';

/** Filesystem-style log index. */
export const logs: LogEntry[] = [
  {
    id: 'LOG-014',
    date: '2026-08-03',
    filename: '2026-08-03_controlled-chaos.md',
    title: 'Controlled chaos, or: why random is not interesting',
    extension: 'md',
    size: '6.1 KB',
    status: 'verified',
    excerpt:
      'Randomness without budget reads as noise. Tension comes from restraint and timing, not from frequency.',
    body: [
      'The first version of this site glitched constantly. Every component held its own Math.random() call and its own timer. Within a minute of browsing it was exhausting, and — worse — it was boring.',
      'The fix was to take the randomness away from the components. A single director now owns the entropy value and the anomaly budget. Components only listen.',
      'Two rules did most of the work. First: an anomaly may only fire if the budget allows it, and randomness merely picks which one. Second: after anything large, the system goes quiet for 45 seconds. The silence is what makes the next event land.',
      'The entropy value itself sits between 0.08 and 0.18 during normal browsing. That range is deliberately low. Most of the time the interface should simply behave.',
    ],
  },
  {
    id: 'LOG-013',
    date: '2026-07-18',
    filename: '2026-07-18_ascii-renderer.md',
    title: 'Rewriting the ASCII field as a fixed grid',
    extension: 'md',
    size: '4.8 KB',
    status: 'verified',
    excerpt:
      'Particles were replaced with a static grid sampling a moving field. Frame cost became constant.',
    body: [
      'The particle version was elegant and unpredictable in exactly the wrong way: cost scaled with activity, so the frame budget blew out precisely when the user was interacting.',
      'Inverting the model fixed it. The cells are now fixed in place and sample a scalar field that drifts underneath them. Cost is rows × columns, always.',
      'Pointer trails, scroll stretching and the TV absorb effect are all just different ways of perturbing that field. None of them add work.',
      'Flat typed arrays hold intensity and glyph index. After warm-up the renderer allocates nothing.',
    ],
  },
  {
    id: 'LOG-012',
    date: '2026-06-29',
    filename: '2026-06-29_camera-path.md',
    title: 'Four-phase camera move without OrbitControls',
    extension: 'md',
    size: '5.4 KB',
    status: 'verified',
    excerpt:
      'Scroll drives a Catmull-Rom path. Damping is delta-based so fast scrolling never jitters.',
    body: [
      'The TV sequence had to work in both directions and survive a user throwing the scrollbar around. Fixed lerp coefficients were the first thing to go — they are frame-rate dependent and produce visible stutter on a 120Hz display.',
      'The replacement is the standard exponential form: factor = 1 - exp(-k * delta). Same feel at any refresh rate.',
      'Position and target both ride Catmull-Rom curves through five keypoints. Because the curve is evaluated from scroll progress rather than integrated over time, reversing the scroll reverses the move exactly.',
      'The camera never reaches a fully orthographic front view. A small lateral offset and a two-degree downward tilt remain at progress 1.0. Without them the shot reads as a flat image rather than an object in a room.',
    ],
  },
  {
    id: 'LOG-011',
    date: '2026-05-02',
    filename: '2026-05-02_channel-lock.md',
    title: 'The channel switch lock',
    extension: 'log',
    size: '2.2 KB',
    status: 'partial',
    excerpt:
      'Rapid clicking spawned concurrent transitions and three parallel animation loops. Fixed with a single lock and a pending-input slot.',
    body: [
      'Reproduction: click the channel-up button six times in one second.',
      'Observed: three requestAnimationFrame loops running simultaneously, the channel index advancing by four, and the CRT tear effect stuck on.',
      'Cause: each switch started its own animation without checking whether one was already running.',
      'Fix: a boolean lock on the store. While switching, input is not dropped — the last request is buffered and applied when the transition completes. One loop, one timeline, no drift.',
      'Remaining: the buffered input means a very fast triple-click advances two channels rather than three. Accepted as correct behaviour.',
    ],
  },
  {
    id: 'LOG-010',
    date: '2026-03-11',
    filename: '2026-03-11_integrity-drift.md',
    title: 'Integrity values are drifting',
    extension: 'log',
    size: '1.1 KB',
    status: 'corrupted',
    excerpt:
      'REC-002 reported 71% at seal time. It now reports 64%. Nothing writes to that field.',
    body: [
      'The integrity numbers in the archive index are static content. They are compiled into the bundle. There is no write path.',
      'REC-002 was sealed at 71%. Three snapshots later it reads 64%.',
      'I have checked the build output. The value in the bundle is 64. I have checked the previous build. The value there is 64 as well.',
      'I remember writing 71.',
    ],
  },
  {
    id: 'LOG-000',
    date: '??????-??-??',
    filename: '??????-??-??_do-not-open.txt',
    title: 'do-not-open',
    extension: 'txt',
    size: '0 B',
    status: 'classified',
    restricted: true,
    excerpt: 'File reports zero bytes. It has been opened 1,204 times.',
    body: [
      'The file is empty. The access counter is not.',
      'Every read increments it. Yours has been recorded.',
      'The archive maintains that this file was created before the archive.',
      'If you are looking for the rest of it, the signal channel on the receiver is not listed in the channel table.',
    ],
  },
];

export function findLogById(id: string): LogEntry | undefined {
  return logs.find((entry) => entry.id === id);
}
