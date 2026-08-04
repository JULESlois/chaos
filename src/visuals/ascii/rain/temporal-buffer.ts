/**
 * A ring of recent per-column head positions.
 *
 * During CHAOS, some regions are asked to render from an earlier frame than
 * the rest — a temporal split. Rather than keep full character frames, the
 * buffer stores only the cheap head-Y of every column each tick, so a delayed
 * column can re-walk its trail from where its head *was* a few frames ago while
 * the surrounding rain keeps moving. Exactly the kind of cheap, replayable
 * state the rest of the piece already relies on.
 */
export class TemporalBuffer {
  private readonly capacity: number;
  private readonly frames: Float32Array[];
  private columns: number;
  private head = 0;
  private filled = 0;

  constructor(columns: number, capacity = 16) {
    this.capacity = capacity;
    this.columns = columns;
    this.frames = [];
    for (let i = 0; i < capacity; i += 1) {
      this.frames.push(new Float32Array(columns));
    }
  }

  resize(columns: number): void {
    const next = Math.max(1, columns | 0);
    if (next === this.columns) return;
    // Rebuild at the new width, preserving nothing — a resize is a hard cut.
    this.columns = next;
    this.head = 0;
    this.filled = 0;
    this.frames.length = 0;
    for (let i = 0; i < this.capacity; i += 1) {
      this.frames.push(new Float32Array(next));
    }
  }

  /**
   * Records the current head positions. `heads` may be longer than the column
   * count — the engine keeps one over-sized array — so only the live columns
   * are copied.
   */
  push(heads: Float32Array): void {
    const slot = this.frames[this.head]!;
    const n = Math.min(slot.length, heads.length);
    for (let i = 0; i < n; i += 1) slot[i] = heads[i]!;
    this.head = (this.head + 1) % this.capacity;
    if (this.filled < this.capacity) this.filled += 1;
  }

  /**
   * Head position of `column` from `delayFrames` ago. `delayFrames` is clamped
   * to the buffer depth. Returns `current` when the buffer is empty.
   */
  delayedHead(column: number, delayFrames: number, current: number): number {
    if (this.filled === 0) return current;
    const delay = Math.max(0, Math.min(this.capacity - 1, Math.round(delayFrames)));
    const index = (this.head - 1 - delay + this.capacity * 2) % this.capacity;
    return this.frames[index]![column] ?? current;
  }

  get depth(): number {
    return this.filled;
  }
}
