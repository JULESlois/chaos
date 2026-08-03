import { describe, expect, it } from 'vitest';
import { PHASE_THRESHOLDS, type TVState } from '../types';
import {
  channelFpsForState,
  isInteractive,
  phaseForProgress,
  shouldRenderChannels,
  tvReducer,
} from './tv-machine';

describe('phaseForProgress', () => {
  it('maps scroll progress onto the four cinematography phases', () => {
    expect(phaseForProgress(0)).toBe('dormant');
    expect(phaseForProgress(PHASE_THRESHOLDS.detected)).toBe('detected');
    expect(phaseForProgress(PHASE_THRESHOLDS.approaching)).toBe('approaching');
    expect(phaseForProgress(PHASE_THRESHOLDS.aligning)).toBe('aligning');
    expect(phaseForProgress(PHASE_THRESHOLDS.interactive)).toBe('interactive');
    expect(phaseForProgress(1)).toBe('interactive');
  });
});

describe('tvReducer', () => {
  it('advances through the phases as the viewer scrolls down', () => {
    let state: TVState = 'dormant';
    for (const progress of [0.05, 0.3, 0.6, 0.9]) {
      state = tvReducer(state, { type: 'scroll', progress });
    }
    expect(state).toBe('interactive');
  });

  it('retreats through the same phases when scrolling back up', () => {
    let state: TVState = 'interactive';
    state = tvReducer(state, { type: 'scroll', progress: 0.6 });
    expect(state).toBe('aligning');
    state = tvReducer(state, { type: 'scroll', progress: 0.3 });
    expect(state).toBe('approaching');
    state = tvReducer(state, { type: 'scroll', progress: 0 });
    expect(state).toBe('dormant');
  });

  it('refuses to let scrolling interrupt a channel change', () => {
    const switching = tvReducer('interactive', { type: 'switch-start' });
    expect(switching).toBe('switching');

    // Scrolling away mid-transition must not strand the animation.
    expect(tvReducer(switching, { type: 'scroll', progress: 0 })).toBe('switching');
    expect(tvReducer(switching, { type: 'switch-end' })).toBe('interactive');
  });

  it('only starts a switch from the interactive phase', () => {
    expect(tvReducer('approaching', { type: 'switch-start' })).toBe('approaching');
    expect(tvReducer('dormant', { type: 'switch-start' })).toBe('dormant');
  });

  it('holds the powered-off state against scroll and returns on power-on', () => {
    const off = tvReducer('interactive', { type: 'power-off' });
    expect(off).toBe('powered-off');
    expect(tvReducer(off, { type: 'scroll', progress: 0 })).toBe('powered-off');
    expect(tvReducer(off, { type: 'power-on' })).toBe('interactive');
  });
});

describe('phase-driven render budget', () => {
  it('stops the channel canvas when nothing can be seen', () => {
    expect(shouldRenderChannels('dormant')).toBe(false);
    expect(shouldRenderChannels('powered-off')).toBe(false);
    expect(shouldRenderChannels('interactive')).toBe(true);
  });

  it('raises the frame rate as the camera closes in', () => {
    expect(channelFpsForState('dormant', 30)).toBe(0);
    expect(channelFpsForState('detected', 30)).toBeLessThan(
      channelFpsForState('approaching', 30),
    );
    expect(channelFpsForState('approaching', 30)).toBeLessThan(
      channelFpsForState('interactive', 30),
    );
    expect(channelFpsForState('interactive', 30)).toBe(30);
  });

  it('never exceeds the device frame budget', () => {
    expect(channelFpsForState('interactive', 15)).toBe(15);
    expect(channelFpsForState('approaching', 10)).toBe(10);
  });

  it('only allows the controls to be used at the set', () => {
    expect(isInteractive('approaching')).toBe(false);
    expect(isInteractive('interactive')).toBe(true);
    expect(isInteractive('powered-off')).toBe(true);
  });
});
