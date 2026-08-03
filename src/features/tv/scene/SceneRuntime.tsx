import { useEffect, useRef, type RefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import type { ChannelManager } from '../channels/ChannelManager';
import { advanceChannels, beginTransitionPhase } from '../channels/channel-runtime';
import type { TVSnapshot } from '../types';

interface SceneRuntimeProps {
  manager: ChannelManager;
  snapshot: TVSnapshot;
  /** Frame-rate ceiling for the whole channel system on this device. */
  baseFps: number;
  entropyRef: RefObject<number>;
  pointerRef: RefObject<{ x: number; y: number }>;
}

/**
 * Steps the channel canvas from the Three.js frame loop.
 *
 * There is deliberately no second requestAnimationFrame here: the 2D channel
 * system, the CRT texture upload and the WebGL draw all happen on the same
 * tick, so they can never drift apart or double up.
 */
export function SceneRuntime({
  manager,
  snapshot,
  baseFps,
  entropyRef,
  pointerRef,
}: SceneRuntimeProps): null {
  const phaseElapsed = useRef(0);
  const phase = snapshot.transitionPhase;

  useEffect(() => {
    phaseElapsed.current = 0;
    beginTransitionPhase(manager, phase);
  }, [manager, phase, snapshot.channelIndex]);

  useFrame((_state, delta) => {
    phaseElapsed.current = advanceChannels({
      manager,
      snapshot,
      delta,
      phaseElapsed: phaseElapsed.current,
      baseFps,
      entropy: entropyRef.current ?? 0,
      pointer: pointerRef.current ?? undefined,
    });
  });

  return null;
}
