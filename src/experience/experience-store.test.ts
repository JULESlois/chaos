import { describe, expect, it, vi } from 'vitest';
import { ExperienceStore, isStill } from './experience-store';
import { EXPERIENCE_PHASES, type SceneId } from './phases';

/** Advances the store by `seconds`, in frames of `step`. */
function run(store: ExperienceStore, seconds: number, step = 1 / 60): void {
  for (let elapsed = 0; elapsed < seconds; elapsed += step) {
    store.update(step);
  }
}

const phase = (id: SceneId): number => {
  const found = EXPERIENCE_PHASES.find((entry) => entry.id === id)!;
  return (found.start + found.end) / 2;
};

describe('progress', () => {
  it('clamps the raw scroll into 0–1', () => {
    const store = new ExperienceStore();

    store.setProgress(-3);
    store.update(1 / 60);
    expect(store.current.progress).toBe(0);

    store.setProgress(9);
    store.update(1 / 60);
    expect(store.current.progress).toBe(1);
  });

  it('eases the smoothed value toward the raw one rather than cutting', () => {
    const store = new ExperienceStore();
    store.setProgress(1);

    store.update(1 / 60);
    // Raw arrives immediately; smoothed is still on its way.
    expect(store.current.progress).toBe(1);
    expect(store.current.smoothedProgress).toBeGreaterThan(0);
    expect(store.current.smoothedProgress).toBeLessThan(0.5);

    run(store, 2);
    expect(store.current.smoothedProgress).toBeCloseTo(1, 2);
  });

  it('snap jumps both values, for mount and resize', () => {
    const store = new ExperienceStore();
    store.snap(0.75);

    expect(store.current.progress).toBe(0.75);
    expect(store.current.smoothedProgress).toBe(0.75);
    expect(store.current.scrollVelocity).toBe(0);
    expect(store.current.scrollDirection).toBe(0);
  });
});

describe('scene routing', () => {
  it('routes off the raw progress, so entering a screen is not delayed', () => {
    const store = new ExperienceStore();
    store.setProgress(phase('chaos'));
    store.update(1 / 60);

    // One frame in, the smoothed value is nowhere near chaos yet.
    expect(store.current.smoothedProgress).toBeLessThan(phase('chaos'));
    expect(store.current.sceneId).toBe('chaos');
  });

  it('notifies only when the active screen actually changes', () => {
    const store = new ExperienceStore();
    const listener = vi.fn();
    store.subscribeScene(listener);

    store.setProgress(phase('current'));
    store.update(1 / 60);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenLastCalledWith('current', 'void');

    // Moving within the same screen is not a scene change.
    store.setProgress(phase('current') + 0.001);
    store.update(1 / 60);
    store.update(1 / 60);
    expect(listener).toHaveBeenCalledTimes(1);

    store.setProgress(phase('television'));
    store.update(1 / 60);
    expect(listener).toHaveBeenCalledTimes(2);
    expect(listener).toHaveBeenLastCalledWith('television', 'current');
  });

  it('keeps a throwing listener from stopping the others', () => {
    const store = new ExperienceStore();
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const second = vi.fn();

    store.subscribeScene(() => {
      throw new Error('listener exploded');
    });
    store.subscribeScene(second);

    store.setProgress(phase('form'));
    store.update(1 / 60);

    expect(second).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });

  it('stops notifying after unsubscribe and after dispose', () => {
    const store = new ExperienceStore();
    const listener = vi.fn();
    const unsubscribe = store.subscribeScene(listener);

    unsubscribe();
    store.setProgress(phase('current'));
    store.update(1 / 60);
    expect(listener).not.toHaveBeenCalled();

    const other = vi.fn();
    store.subscribeScene(other);
    store.dispose();
    store.setProgress(phase('chaos'));
    store.update(1 / 60);
    expect(other).not.toHaveBeenCalled();
  });
});

describe('velocity and direction', () => {
  it('reports the reader as still until they move', () => {
    const store = new ExperienceStore();
    run(store, 0.5);

    expect(isStill(store.current)).toBe(true);
    expect(store.current.scrollDirection).toBe(0);
  });

  it('signs the direction and settles back to rest', () => {
    const store = new ExperienceStore();

    store.setProgress(0.4);
    store.update(1 / 60);
    expect(store.current.scrollDirection).toBe(1);
    expect(isStill(store.current)).toBe(false);

    store.setProgress(0.1);
    store.update(1 / 60);
    expect(store.current.scrollDirection).toBe(-1);

    run(store, 4);
    expect(isStill(store.current)).toBe(true);
    expect(store.current.scrollDirection).toBe(0);
  });

  it('eases in after a backgrounded tab rather than teleporting', () => {
    const store = new ExperienceStore();
    store.setProgress(1);

    // Ten seconds of frozen tab arriving as one delta.
    store.update(10);

    // The step is clamped to 1/15s, so a huge delta cannot produce a huge
    // velocity or land the smoothed value on the target in one frame.
    expect(store.current.smoothedProgress).toBeLessThan(0.9);
    expect(store.current.scrollVelocity).toBeLessThanOrEqual(4);
  });
});
