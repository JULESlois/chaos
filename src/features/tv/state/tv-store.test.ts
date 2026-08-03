import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { signalBus } from '@/utils/signal-bus';
import { SWITCH_DURATION, type TVSnapshot } from '../types';
import { TVStore, type ChannelDescriptor } from './tv-store';

const CHANNELS: ChannelDescriptor[] = [
  { id: 'ch-00', label: 'CH-00' },
  { id: 'ch-01', label: 'CH-01' },
  { id: 'ch-02', label: 'CH-02' },
  { id: 'ch-03', label: 'CH-03' },
  { id: 'ch-04', label: 'CH-04', unlisted: true },
];

/** Runs a whole switch animation to completion. */
function settle(): void {
  vi.advanceTimersByTime(SWITCH_DURATION + 50);
}

let store: TVStore;

beforeEach(() => {
  vi.useFakeTimers();
  store = new TVStore(CHANNELS.map((channel) => ({ ...channel })));
  store.setProgress(1); // Camera locked at the set.
});

afterEach(() => {
  store.dispose();
  signalBus.clear();
  vi.useRealTimers();
});

describe('channel advance and retreat', () => {
  it('advances forward and wraps past the last listed channel', () => {
    store.next();
    settle();
    expect(store.getSnapshot().channelId).toBe('ch-01');

    store.next();
    settle();
    store.next();
    settle();
    expect(store.getSnapshot().channelId).toBe('ch-03');

    // ch-04 is unlisted, so the next press wraps to the first channel.
    store.next();
    settle();
    expect(store.getSnapshot().channelId).toBe('ch-00');
  });

  it('retreats backwards and wraps below the first channel', () => {
    store.previous();
    settle();
    expect(store.getSnapshot().channelId).toBe('ch-03');

    store.previous();
    settle();
    expect(store.getSnapshot().channelId).toBe('ch-02');
  });

  it('includes the unlisted channel only after it is unlocked', () => {
    expect(store.listedChannels.map((channel) => channel.id)).not.toContain('ch-04');

    store.unlockUnlisted();
    expect(store.listedChannels.map((channel) => channel.id)).toContain('ch-04');

    store.goToChannelId('ch-03');
    settle();
    store.next();
    settle();
    expect(store.getSnapshot().channelId).toBe('ch-04');
  });

  it('can be sent straight to a channel by id', () => {
    expect(store.goToChannelId('ch-02')).toBe(true);
    settle();
    expect(store.getSnapshot().channelId).toBe('ch-02');
    expect(store.goToChannelId('ch-99')).toBe(false);
  });
});

describe('channel switch lock', () => {
  it('runs one animation for a burst of presses and lands on the last request', () => {
    const starts: number[] = [];
    store.subscribe((snapshot: TVSnapshot) => {
      if (snapshot.transitionPhase === 'displace') starts.push(snapshot.channelIndex);
    });

    store.next(); // → ch-01, starts the timeline
    store.next(); // buffered → ch-02
    store.next(); // buffered → ch-03, replaces the previous buffer

    // Only one timeline may be running at a time.
    expect(store.isSwitching).toBe(true);
    expect(store.pending).toBe(3);
    expect(starts).toHaveLength(1);

    settle();
    // First animation completed on ch-01, then the buffered target runs.
    expect(store.getSnapshot().channelId).toBe('ch-01');
    expect(store.isSwitching).toBe(true);
    expect(starts).toHaveLength(2);

    settle();
    // Three presses, two animations, the correct destination.
    expect(store.getSnapshot().channelId).toBe('ch-03');
    expect(store.isSwitching).toBe(false);
    expect(store.pending).toBeNull();
  });

  it('buffers the most recent request rather than dropping it', () => {
    store.next();
    store.goToChannelId('ch-03');
    expect(store.pending).toBe(3);

    settle();
    settle();
    expect(store.getSnapshot().channelId).toBe('ch-03');
  });

  it('moves through displace, compress, snow and expand in order', () => {
    const seen: string[] = [];
    store.subscribe((snapshot) => {
      const phase = snapshot.transitionPhase;
      if (seen[seen.length - 1] !== phase) seen.push(phase);
    });

    store.next();
    settle();

    expect(seen).toEqual(['displace', 'compress', 'snow', 'expand', 'idle']);
  });

  it('ignores channel requests while the set is off', () => {
    store.setPower(false);
    store.next();
    settle();

    expect(store.getSnapshot().channelId).toBe('ch-00');
    expect(store.isSwitching).toBe(false);
  });

  it('abandons a running transition when the set is switched off', () => {
    store.next();
    expect(store.isSwitching).toBe(true);

    store.setPower(false);
    expect(store.isSwitching).toBe(false);
    expect(store.getSnapshot().transitionPhase).toBe('idle');

    settle();
    // The abandoned timeline must not resurrect itself.
    expect(store.getSnapshot().channelId).toBe('ch-00');
    expect(store.getSnapshot().state).toBe('powered-off');
  });
});

describe('notifications', () => {
  it('publishes only when something user-visible changed', () => {
    const listener = vi.fn();
    store.subscribe(listener);

    store.setProgress(1);
    store.setProgress(0.99);
    expect(listener).not.toHaveBeenCalled();

    store.setProgress(0.1);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('announces the active channel on the signal bus', () => {
    const heard: string[] = [];
    signalBus.on('tv:channel', ({ id }) => heard.push(id));

    store.next();
    settle();

    expect(heard).toEqual(['ch-01']);
  });
});
