import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { signalBus } from '@/utils/signal-bus';
import { SWITCH_DURATION } from '../types';
import { SEQUENCE_TIMEOUT_MS } from './unlock-sequence';
import { TVStore, type ChannelDescriptor } from './tv-store';

const CHANNELS: ChannelDescriptor[] = [
  { id: 'ch-00', label: 'CH-00' },
  { id: 'ch-01', label: 'CH-01' },
  { id: 'ch-unlisted', label: 'CH-??', unlisted: true },
];

/** Feeds the canonical unlock sequence on a steady cadence. */
function feedSequence(store: TVStore, start = 1000, gap = 1000): void {
  const buttons = ['next', 'next', 'prev', 'power', 'next'] as const;
  let now = start;
  for (const button of buttons) {
    store.press(button, now);
    now += gap;
  }
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

describe('the hidden sequence unlock', () => {
  it('reveals the unlisted channel and emits the narrative unlock', () => {
    const heard: string[] = [];
    signalBus.on('narrative:unlock', ({ key }) => heard.push(key));

    feedSequence(store);

    expect(store.hasUnlistedUnlocked).toBe(true);
    expect(store.listedChannels.map((channel) => channel.id)).toContain('ch-unlisted');
    // The sequence resets its own progress on completion.
    expect(store.sequenceProgress).toBe(0);
    expect(heard).toEqual(['unlisted']);
  });

  it('tunes the set to the unlisted channel after the transition', () => {
    feedSequence(store);
    // The power press mid-sequence turns the set off; the unlock restores it.
    vi.advanceTimersByTime(SWITCH_DURATION * 4 + 100);

    expect(store.getSnapshot().channelId).toBe('ch-unlisted');
    expect(store.getSnapshot().powered).toBe(true);
  });

  it('does not unlock on a partial or wrong sequence', () => {
    store.press('next', 1000);
    store.press('next', 2000);
    expect(store.hasUnlistedUnlocked).toBe(false);
    expect(store.sequenceProgress).toBe(2 / 5);

    // 'power' is the wrong third press, so progress resets to zero.
    store.press('power', 3000);
    expect(store.sequenceProgress).toBe(0);
  });

  it('treats a stale attempt past the timeout as a fresh opening press', () => {
    store.press('next', 1000);
    store.press('next', 2000);
    expect(store.sequenceProgress).toBe(2 / 5);

    // A press far past the timeout can only be the first of a new attempt,
    // and 'next' matches UNLOCK_SEQUENCE[0] — so progress is 1/5, not 0.
    store.press('next', 2000 + SEQUENCE_TIMEOUT_MS + 500);
    expect(store.sequenceProgress).toBe(1 / 5);
  });
});
