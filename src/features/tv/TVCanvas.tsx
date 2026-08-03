import { useCallback, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { PerformanceMonitor } from '@react-three/drei';
import type { ChannelManager } from './channels/ChannelManager';
import { CameraDirector } from './scene/CameraDirector';
import { Lighting } from './scene/Lighting';
import { RetroTV } from './scene/RetroTV';
import { SceneRuntime } from './scene/SceneRuntime';
import { SignalRoom } from './scene/SignalRoom';
import { SCREEN_QUALITY } from './scene/TVScreen';
import { isInteractive } from './state/tv-machine';
import type { LiveValue, TVButtonId, TVSnapshot } from './types';

interface TVCanvasProps {
  manager: ChannelManager;
  snapshot: TVSnapshot;
  /** 0 = full quality, 1 = reduced, 2 = static tier. */
  quality: 0 | 1 | 2;
  maxDpr: number;
  baseFps: number;
  reducedMotion: boolean;
  /** Level 2 devices hold the final camera framing instead of animating it. */
  staticView: boolean;
  progressRef: LiveValue<number>;
  /** Live visual tension, written outside React by the tension controller. */
  tensionRef: LiveValue<number>;
  /** Bumped by the tension controller's horizontal-tear event. */
  tearImpulse: number;
  active: boolean;
  onPress: (id: TVButtonId) => void;
  onContextLost: () => void;
}

export function TVCanvas({
  manager,
  snapshot,
  quality,
  maxDpr,
  baseFps,
  reducedMotion,
  staticView,
  progressRef,
  tensionRef,
  tearImpulse,
  active,
  onPress,
  onContextLost,
}: TVCanvasProps): React.JSX.Element {
  const [dpr, setDpr] = useState(maxDpr);
  const enableShadows = quality === 0;

  // A lost context is unrecoverable for our purposes — hand over to the DOM
  // television rather than leaving a black rectangle on the page.
  const handleCreated = useCallback(
    ({ gl }: { gl: { domElement: HTMLCanvasElement; setClearColor: (c: string) => void } }) => {
      gl.setClearColor('#070203');
      gl.domElement.addEventListener(
        'webglcontextlost',
        (event) => {
          event.preventDefault();
          onContextLost();
        },
        { once: true },
      );
    },
    [onContextLost],
  );

  const screenLight = snapshot.powered ? 1 : 0;

  return (
    <Canvas
      className="tv-canvas"
      dpr={dpr}
      frameloop={active ? 'always' : 'never'}
      shadows={enableShadows}
      gl={{
        antialias: false,
        alpha: false,
        stencil: false,
        depth: true,
        powerPreference: 'high-performance',
      }}
      camera={{ fov: 46, near: 0.08, far: 40, position: [0, 2.72, 7.6] }}
      onCreated={handleCreated}
    >
      {/* Drop DPR before dropping frames when the device struggles. */}
      <PerformanceMonitor onDecline={() => setDpr(1)} />

      <SignalRoom
        detail={quality === 0 ? 'full' : 'reduced'}
        receiveShadows={enableShadows}
        reducedMotion={reducedMotion}
      />

      <Lighting
        screenLight={screenLight}
        enableShadows={enableShadows}
        flicker={!reducedMotion && quality < 2}
      />

      <RetroTV
        manager={manager}
        quality={SCREEN_QUALITY[quality]}
        powered={snapshot.powered}
        transitionPhase={snapshot.transitionPhase}
        tension={tensionRef.current ?? 0}
        tearImpulse={tearImpulse}
        reducedMotion={reducedMotion}
        interactive={isInteractive(snapshot.state) || staticView}
        castShadows={enableShadows}
        onPress={onPress}
      />

      <CameraDirector
        progressRef={progressRef}
        tensionRef={tensionRef}
        reducedMotion={reducedMotion}
        staticView={staticView}
      />

      <SceneRuntime
        manager={manager}
        snapshot={snapshot}
        baseFps={baseFps}
        tensionRef={tensionRef}
      />
    </Canvas>
  );
}
