import { signalBus } from '@/utils/signal-bus';
import {
  SWITCH_DURATION,
  SWITCH_TIMELINE,
  type TVSnapshot,
  type TVState,
  type TransitionPhase,
} from '../types';
import { tvReducer, type TVEvent } from './tv-machine';

export interface ChannelDescriptor {
  id: string;
  label: string;
  /** Not present in the receiver's channel table until the viewer finds it. */
  unlisted?: boolean;
}

type Listener = (snapshot: TVSnapshot) => void;

/**
 * Imperative store for the television.
 *
 * Lives outside React so scroll and animation can drive it at frame rate.
 * React components subscribe and receive a coarse snapshot only when
 * something user-visible changes.
 */
export class TVStore {
  private state: TVState = 'dormant';
  private channelIndex = 0;
  private powered = true;
  private transitionPhase: TransitionPhase = 'idle';

  /** The switch lock. While true, new requests are buffered, not executed. */
  private switching = false;
  private pendingTarget: number | null = null;
  /** The channel the running transition is heading for. */
  private switchTarget: number | null = null;

  private unlistedUnlocked = false;

  private timers: number[] = [];
  private listeners = new Set<Listener>();
  private channels: ChannelDescriptor[];
  private snapshot: TVSnapshot;

  constructor(channels: ChannelDescriptor[]) {
    if (channels.length === 0) {
      throw new Error('TVStore requires at least one channel');
    }
    this.channels = channels;
    this.snapshot = this.buildSnapshot();
  }

  private buildSnapshot(): TVSnapshot {
    return {
      state: this.state,
      channelIndex: this.channelIndex,
      channelId: this.channels[this.channelIndex].id,
      powered: this.powered,
      switching: this.switching,
      transitionPhase: this.transitionPhase,
    };
  }

  private publish(): void {
    const next = this.buildSnapshot();
    const previous = this.snapshot;
    if (
      previous.state === next.state &&
      previous.channelIndex === next.channelIndex &&
      previous.powered === next.powered &&
      previous.switching === next.switching &&
      previous.transitionPhase === next.transitionPhase
    ) {
      return;
    }
    this.snapshot = next;
    for (const listener of this.listeners) listener(next);
  }

  getSnapshot(): TVSnapshot {
    return this.snapshot;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getChannels(): readonly ChannelDescriptor[] {
    return this.channels;
  }

  private dispatch(event: TVEvent): void {
    const next = tvReducer(this.state, event);
    if (next !== this.state) {
      this.state = next;
    }
  }

  /** Called from the scroll driver — must be cheap and allocation free. */
  setProgress(progress: number): void {
    this.dispatch({ type: 'scroll', progress });
    this.publish();
  }

  leave(): void {
    this.dispatch({ type: 'leave' });
    this.publish();
  }

  private schedule(fn: () => void, delay: number): void {
    const id = window.setTimeout(fn, delay);
    this.timers.push(id);
  }

  private clearTimers(): void {
    for (const id of this.timers) window.clearTimeout(id);
    this.timers.length = 0;
  }

  /**
   * Requests a channel change.
   *
   * If a transition is already running the request is *buffered* rather than
   * dropped — rapid clicking therefore produces one animation and lands on the
   * most recent request instead of spawning concurrent timelines.
   */
  requestChannel(target: number, options: { immediate?: boolean } = {}): void {
    if (!this.powered) return;

    const normalised = this.normaliseIndex(target);

    if (this.switching) {
      this.pendingTarget = normalised;
      return;
    }

    if (normalised === this.channelIndex && !options.immediate) return;

    if (options.immediate) {
      this.channelIndex = normalised;
      this.emitChannel();
      this.publish();
      return;
    }

    this.beginSwitch(normalised);
  }

  next(): void {
    this.advance(1);
  }

  previous(): void {
    this.advance(-1);
  }

  /**
   * Steps to the neighbouring *listed* channel.
   *
   * Unlisted channels are skipped by the physical buttons until the viewer
   * has unlocked them, which is what makes CH-04 feel found rather than given.
   */
  private advance(direction: 1 | -1): void {
    const count = this.channels.length;
    let index = this.effectiveIndex();
    for (let step = 0; step < count; step += 1) {
      index = this.normaliseIndex(index + direction);
      if (this.isSelectable(index)) {
        this.requestChannel(index);
        return;
      }
    }
  }

  private isSelectable(index: number): boolean {
    return !this.channels[index].unlisted || this.unlistedUnlocked;
  }

  /** Reveals every unlisted channel to the prev/next buttons. */
  unlockUnlisted(): void {
    this.unlistedUnlocked = true;
  }

  get hasUnlistedUnlocked(): boolean {
    return this.unlistedUnlocked;
  }

  /** Channels the on-screen channel table should display. */
  get listedChannels(): ChannelDescriptor[] {
    return this.channels.filter(
      (channel) => !channel.unlisted || this.unlistedUnlocked,
    );
  }

  /**
   * The index a queued request should advance from.
   *
   * Pressing "next" four times quickly must reach the fourth channel along,
   * not fight with the transition that is already running — so stepping
   * counts from where the receiver is *going*, not where it is.
   */
  private effectiveIndex(): number {
    return this.pendingTarget ?? this.switchTarget ?? this.channelIndex;
  }

  private normaliseIndex(index: number): number {
    const count = this.channels.length;
    return ((index % count) + count) % count;
  }

  private emitChannel(): void {
    signalBus.emit('tv:channel', {
      id: this.channels[this.channelIndex].id,
      index: this.channelIndex,
    });
  }

  private beginSwitch(target: number): void {
    this.switching = true;
    this.switchTarget = target;
    this.dispatch({ type: 'switch-start' });
    this.transitionPhase = 'displace';
    this.publish();

    signalBus.emit('audio:play', { cue: 'button' });

    this.schedule(() => {
      this.transitionPhase = 'compress';
      this.publish();
    }, SWITCH_TIMELINE.compress - SWITCH_TIMELINE.displace);

    this.schedule(() => {
      this.transitionPhase = 'snow';
      signalBus.emit('audio:play', { cue: 'switch' });
      this.publish();
    }, SWITCH_TIMELINE.snow - SWITCH_TIMELINE.displace);

    this.schedule(() => {
      this.channelIndex = target;
      this.emitChannel();
      this.publish();
    }, SWITCH_TIMELINE.update - SWITCH_TIMELINE.displace);

    this.schedule(() => {
      this.transitionPhase = 'expand';
      this.publish();
    }, SWITCH_TIMELINE.expand - SWITCH_TIMELINE.displace);

    this.schedule(() => {
      this.transitionPhase = 'idle';
      this.switching = false;
      this.switchTarget = null;
      this.dispatch({ type: 'switch-end' });
      this.publish();

      // Apply any request buffered during the transition.
      const pending = this.pendingTarget;
      this.pendingTarget = null;
      if (pending !== null && pending !== this.channelIndex) {
        this.beginSwitch(pending);
      }
    }, SWITCH_DURATION - SWITCH_TIMELINE.displace);
  }

  togglePower(): void {
    this.setPower(!this.powered);
  }

  setPower(on: boolean): void {
    if (on === this.powered) return;

    this.clearTimers();
    this.switching = false;
    this.switchTarget = null;
    this.pendingTarget = null;
    this.transitionPhase = 'idle';
    this.powered = on;

    this.dispatch({ type: on ? 'power-on' : 'power-off' });
    signalBus.emit('tv:power', { on });
    signalBus.emit('audio:play', { cue: on ? 'power-on' : 'power-off' });
    this.publish();
  }

  /** Jumps directly to a channel id, used by the hidden narrative triggers. */
  goToChannelId(id: string): boolean {
    const index = this.channels.findIndex((channel) => channel.id === id);
    if (index < 0) return false;
    this.requestChannel(index);
    return true;
  }

  dispose(): void {
    this.clearTimers();
    this.listeners.clear();
  }

  /** Test accessor. */
  get isSwitching(): boolean {
    return this.switching;
  }

  get pending(): number | null {
    return this.pendingTarget;
  }
}
