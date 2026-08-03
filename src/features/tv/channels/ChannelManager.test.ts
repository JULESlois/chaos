import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChannelManager } from './ChannelManager';
import type { ChannelContext, TVChannel } from './channel-types';

/**
 * A controllable fake channel.
 *
 * The manager drives a channel through enter/update/render/exit and forwards
 * hits to it in canvas pixels, so the fake records every call and (optionally)
 * returns a value from `hit` — that is enough to observe the whole lifecycle
 * without a real 2D backend.
 */
function makeChannel(id: string, fps = 10, withHit = true) {
  const calls = { enter: 0, update: 0, render: 0, exit: 0, hit: 0 };
  let hitReturn = true;
  let lastHit: { x: number; y: number } | null = null;
  let lastTension = 0;

  const channel: TVChannel = {
    id,
    label: id,
    fps,
    enter: () => {
      calls.enter += 1;
    },
    update: (context: ChannelContext, _delta: number) => {
      calls.update += 1;
      lastTension = context.tension;
    },
    render: () => {
      calls.render += 1;
    },
    exit: () => {
      calls.exit += 1;
    },
  };

  if (withHit) {
    channel.hit = (x: number, y: number, _context: ChannelContext) => {
      calls.hit += 1;
      lastHit = { x, y };
      return hitReturn;
    };
  }

  return {
    channel,
    calls,
    setHitReturn(value: boolean) {
      hitReturn = value;
    },
    get lastHit() {
      return lastHit;
    },
    get lastTension() {
      return lastTension;
    },
  };
}

function makeManager(width = 100, height = 50) {
  return new ChannelManager({ width, height });
}

let manager: ChannelManager;

afterEach(() => {
  manager?.dispose();
});

describe('channel registration', () => {
  it('lists every registered channel descriptor', () => {
    manager = makeManager();
    const a = makeChannel('ch-a');
    const b = makeChannel('ch-b');
    manager.register(a.channel);
    manager.register(b.channel);

    expect(manager.channelDescriptors).toEqual([
      { id: 'ch-a', label: 'ch-a' },
      { id: 'ch-b', label: 'ch-b' },
    ]);
  });

  it('creates a canvas at the requested resolution', () => {
    manager = makeManager(120, 80);
    expect(manager.canvas.width).toBe(120);
    expect(manager.canvas.height).toBe(80);
  });
});

describe('activation lifecycle', () => {
  it('opens onto no channel until one is activated', () => {
    manager = makeManager();
    expect(manager.activeChannel).toBeNull();
  });

  it('runs enter and dirties the texture on activation', () => {
    manager = makeManager();
    const a = makeChannel('ch-a');
    manager.register(a.channel);

    // The constructor paints a background, so the first frame is always dirty.
    expect(manager.needsTextureUpload).toBe(true);
    manager.markUploaded();
    expect(manager.needsTextureUpload).toBe(false);

    manager.activate(0);
    expect(a.calls.enter).toBe(1);
    expect(manager.activeChannel?.id).toBe('ch-a');
    expect(manager.needsTextureUpload).toBe(true);
  });

  it('runs exit on the previous channel when switching', () => {
    manager = makeManager();
    const a = makeChannel('ch-a');
    const b = makeChannel('ch-b');
    manager.register(a.channel);
    manager.register(b.channel);

    manager.activate(0);
    manager.activate(1);
    expect(a.calls.exit).toBe(1);
    expect(b.calls.enter).toBe(1);
    expect(manager.activeChannel?.id).toBe('ch-b');
  });

  it('does nothing when activating the channel already on screen', () => {
    manager = makeManager();
    const a = makeChannel('ch-a');
    manager.register(a.channel);
    manager.activate(0);
    a.calls.enter = 0;
    manager.activate(0);
    expect(a.calls.enter).toBe(0);
  });

  it('ignores out-of-range indices', () => {
    manager = makeManager();
    const a = makeChannel('ch-a');
    manager.register(a.channel);
    manager.activate(5);
    expect(manager.activeChannel).toBeNull();
  });

  it('runs exit on the active channel when disposed', () => {
    manager = makeManager();
    const a = makeChannel('ch-a');
    manager.register(a.channel);
    manager.activate(0);
    a.calls.exit = 0;
    manager.dispose();
    expect(a.calls.exit).toBe(1);
    expect(manager.activeChannel).toBeNull();
  });
});

describe('the dirty flag', () => {
  it('stays dirty after a frame and clears only on upload', () => {
    manager = makeManager();
    const a = makeChannel('ch-a');
    manager.register(a.channel);
    manager.activate(0);

    manager.step(1); // drives a full frame
    expect(manager.needsTextureUpload).toBe(true);

    manager.markUploaded();
    expect(manager.needsTextureUpload).toBe(false);
  });
});

describe('frame stepping', () => {
  it('rate-limits updates to the channel fps', () => {
    manager = makeManager();
    const a = makeChannel('ch-a', 10); // interval 0.1s
    manager.register(a.channel);
    manager.activate(0);

    manager.step(0.05);
    manager.step(0.05);
    expect(a.calls.update).toBe(1);
    expect(a.calls.render).toBe(1);
  });

  it('does not step while paused', () => {
    manager = makeManager();
    const a = makeChannel('ch-a', 10);
    manager.register(a.channel);
    manager.activate(0);
    manager.setPaused(true);

    manager.step(1);
    expect(a.calls.update).toBe(0);
  });

  it('stops stepping when the fps cap is zero', () => {
    manager = makeManager();
    const a = makeChannel('ch-a', 10);
    manager.register(a.channel);
    manager.activate(0);
    manager.setFpsCap(0);

    manager.step(1);
    expect(a.calls.update).toBe(0);
  });

  it('forces one frame through renderOnce regardless of the cap', () => {
    manager = makeManager();
    const a = makeChannel('ch-a', 2);
    manager.register(a.channel);
    manager.activate(0);
    manager.setFpsCap(0);
    manager.setPaused(true);

    manager.renderOnce();
    expect(a.calls.update).toBe(1);
    expect(a.calls.render).toBe(1);
  });
});

describe('tension forwarding', () => {
  it('passes the tension value into the channel context', () => {
    manager = makeManager();
    const a = makeChannel('ch-a', 60);
    manager.register(a.channel);
    manager.activate(0);

    manager.setTension(0.73);
    manager.step(0.5); // a full frame
    expect(a.lastTension).toBeCloseTo(0.73, 5);
  });
});

describe('hit forwarding', () => {
  it('converts surface UVs into canvas pixels for the active channel', () => {
    manager = makeManager(100, 50);
    const a = makeChannel('ch-a');
    manager.register(a.channel);
    manager.activate(0);

    const consumed = manager.hit(0.5, 0.5);
    expect(consumed).toBe(true);
    expect(a.lastHit).toEqual({ x: 50, y: 25 });
    expect(a.calls.hit).toBe(1);
    expect(manager.needsTextureUpload).toBe(true);
  });

  it('returns false when no channel is active', () => {
    manager = makeManager();
    expect(manager.hit(0.5, 0.5)).toBe(false);
  });

  it('returns false when the channel has no hit handler', () => {
    manager = makeManager();
    const a = makeChannel('ch-a', 10, false);
    manager.register(a.channel);
    manager.activate(0);
    expect(manager.hit(0.5, 0.5)).toBe(false);
  });

  it('returns whatever the channel reports', () => {
    manager = makeManager(100, 50);
    const a = makeChannel('ch-a');
    a.setHitReturn(false);
    manager.register(a.channel);
    manager.activate(0);
    // Isolate the dirty flag: activation already dirties the texture, so clear
    // it before the hit to prove a non-consuming hit does not re-dirty it.
    manager.markUploaded();
    expect(manager.hit(0.5, 0.5)).toBe(false);
    expect(manager.needsTextureUpload).toBe(false);
  });
});

describe('channel fault isolation', () => {
  it('does not re-enter a channel that threw during update', () => {
    manager = makeManager();
    let updateCalls = 0;
    const broken: TVChannel = {
      id: 'broken',
      label: 'broken',
      fps: 60,
      enter: () => {},
      update: () => {
        updateCalls += 1;
        throw new Error('boom');
      },
      render: () => {},
      exit: () => {},
    };
    manager.register(broken);
    manager.activate(0);

    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    manager.step(1); // first frame: throws once, channel marked failed
    manager.step(1); // second frame: must skip the broken update
    manager.step(1);
    expect(updateCalls).toBe(1);
    expect(manager.activeChannel?.id).toBe('broken');
    spy.mockRestore();
  });
});
