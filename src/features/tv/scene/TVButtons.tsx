import { useEffect, useMemo, useRef } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import type * as THREE from 'three';
import { armed, BUTTON_X, BUTTON_Y, BUTTON_Z, hitSizes } from './button-arming';
import type { TVButtonId } from '../types';

interface TVButtonsProps {
  /** Buttons only accept presses once the camera has locked onto the set. */
  interactive: boolean;
  powered: boolean;
  onPress: (id: TVButtonId) => void;
}

interface PhysicalButtonProps {
  id: TVButtonId;
  x: number;
  colour: string;
  emissive: string;
  enabled: boolean;
  /** Side of the invisible square the press is actually collected on. */
  hit: number;
  /**
   * Buttons carry no text, so the shape is the label. A reader learns which
   * is which by pressing them, which is the correct amount of effort for a
   * set they found at the end of a scroll.
   */
  shape: 'round' | 'square';
  onPress: (id: TVButtonId) => void;
}

/**
 * One control on the cabinet.
 *
 * The press is a press, not a click: the cap travels on pointer-down, and the
 * action fires on pointer-up over the same button. That ordering is the whole
 * point of putting the controls on an object instead of in a toolbar — the
 * reader gets the two halves of a physical button, including the right to
 * change their mind by sliding off it before letting go.
 *
 * Which means every way a pointer can leave without a clean release has to put
 * the cap back: out, cancel, and a release that lands anywhere else in the
 * document. A key stuck down is worse than a key that does nothing, because it
 * says the object is broken rather than inert.
 */
function PhysicalButton({
  id,
  x,
  colour,
  emissive,
  enabled,
  hit,
  shape,
  onPress,
}: PhysicalButtonProps): React.JSX.Element {
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.MeshStandardMaterial>(null);
  /** Cap travel, 0 = out, 1 = bottomed out. */
  const depth = useRef(0);
  const held = useRef(false);
  const hovered = useRef(false);

  const setCursor = (on: boolean): void => {
    if (hovered.current === on) return;
    hovered.current = on;
    document.body.style.cursor = on ? 'pointer' : '';
  };

  // Never leave the document cursor in the pointer state.
  useEffect(() => {
    return () => {
      if (hovered.current) {
        document.body.style.cursor = '';
        hovered.current = false;
      }
    };
  }, []);

  useEffect(() => {
    if (enabled) return;
    held.current = false;
    setCursor(false);
  }, [enabled]);

  /**
   * The release that never reached the button.
   *
   * R3F only reports pointer-up on the mesh the pointer is actually over, so a
   * press that ends off the cabinet — or is taken away by a scroll gesture, a
   * context menu, or the browser deciding the touch was a pan — would leave the
   * cap down forever. This is the recovery, and it is deliberately at window
   * level so there is nowhere a pointer can go that it does not cover.
   */
  useEffect(() => {
    const release = (): void => {
      held.current = false;
    };
    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', release);
    return () => {
      window.removeEventListener('pointerup', release);
      window.removeEventListener('pointercancel', release);
    };
  }, []);

  useFrame((_state, delta) => {
    const mesh = meshRef.current;
    if (!mesh) return;

    // Fast in, slower out: a key that returns as quickly as it travels reads
    // as a flicker rather than as something with a spring under it.
    const target = held.current ? 1 : 0;
    const rate = held.current ? 34 : 12;
    depth.current += (target - depth.current) * (1 - Math.exp(-rate * delta));
    if (!held.current && depth.current < 0.0005) depth.current = 0;
    mesh.position.z = BUTTON_Z - depth.current * 0.022;

    const material = materialRef.current;
    if (material) {
      const live = enabled && armed();
      const glow = held.current ? 0.85 : hovered.current && live ? 0.55 : 0.12;
      material.emissiveIntensity +=
        (glow - material.emissiveIntensity) * (1 - Math.exp(-10 * delta));
    }
  });

  const handleDown = (event: ThreeEvent<PointerEvent>): void => {
    if (!enabled || !armed()) return;
    event.stopPropagation();
    held.current = true;
  };

  const handleUp = (event: ThreeEvent<PointerEvent>): void => {
    if (!held.current) return;
    event.stopPropagation();
    held.current = false;
    // A tap short enough to start and finish inside one frame would otherwise
    // never move the cap. Bottom it out so the rebound is always seen.
    depth.current = 1;
    if (enabled && armed()) onPress(id);
  };

  const handleOver = (event: ThreeEvent<PointerEvent>): void => {
    if (!enabled || !armed()) return;
    event.stopPropagation();
    setCursor(true);
  };

  const handleOut = (): void => {
    // Sliding off mid-press cancels it. The cap comes back up, nothing fires.
    held.current = false;
    setCursor(false);
  };

  return (
    <group>
      <mesh
        ref={meshRef}
        position={[x, BUTTON_Y, BUTTON_Z]}
        rotation={shape === 'round' ? [Math.PI / 2, 0, 0] : [0, 0, 0]}
        raycast={() => null}
      >
        {shape === 'round' ? (
          <cylinderGeometry args={[0.052, 0.056, 0.05, 12]} />
        ) : (
          <boxGeometry args={[0.096, 0.096, 0.05]} />
        )}
        <meshStandardMaterial
          ref={materialRef}
          color={colour}
          emissive={emissive}
          emissiveIntensity={0.12}
          roughness={0.55}
          metalness={0.1}
        />
      </mesh>

      {/*
        The press is collected on a square larger than the cap, floating just
        in front of it. Aiming at a 3D object through a barrel-distorted
        picture is already harder than aiming at a rectangle in a layout; the
        reader should not also have to hit the exact cylinder.

        It exists only while the control does. An invisible plane that quietly
        eats pointer events for a button that cannot be pressed is the kind of
        thing that makes the rest of the page feel unresponsive for no reason
        the reader can see.
      */}
      {enabled && (
        <mesh
          position={[x, BUTTON_Y, BUTTON_Z + 0.03]}
          onPointerDown={handleDown}
          onPointerUp={handleUp}
          onPointerOver={handleOver}
          onPointerOut={handleOut}
          onPointerCancel={handleOut}
        >
          <planeGeometry args={[hit, hit]} />
          {/* Material invisible, mesh still raycast: no draw call, full target. */}
          <meshBasicMaterial visible={false} />
        </mesh>
      )}
    </group>
  );
}

/**
 * The three physical controls on the cabinet.
 *
 * This is the entire control surface of the television — there is no DOM bar
 * under the canvas, no channel list, no labels. Two round buttons sitting
 * together step the channel; the square one, set apart, is power.
 *
 * The order of presses matters somewhere else. Nothing here says so.
 */
export function TVButtons({
  interactive,
  powered,
  onPress,
}: TVButtonsProps): React.JSX.Element {
  const coarse = useMemo(
    () =>
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(pointer: coarse)').matches,
    [],
  );
  const { step, power } = hitSizes(coarse);

  return (
    <group>
      <PhysicalButton
        id="prev"
        x={BUTTON_X.prev}
        shape="round"
        colour="#2c1f23"
        emissive="#b75a69"
        hit={step}
        enabled={interactive && powered}
        onPress={onPress}
      />
      <PhysicalButton
        id="next"
        x={BUTTON_X.next}
        shape="round"
        colour="#2c1f23"
        emissive="#b75a69"
        hit={step}
        enabled={interactive && powered}
        onPress={onPress}
      />
      <PhysicalButton
        id="power"
        x={BUTTON_X.power}
        shape="square"
        colour="#331a20"
        emissive={powered ? '#e68a98' : '#4a2028'}
        hit={power}
        enabled={interactive}
        onPress={onPress}
      />

      {/* Power tell-tale: the only light on the cabinet that survives standby. */}
      <mesh position={[BUTTON_X.power, 0.82, 0.306]}>
        <circleGeometry args={[0.014, 8]} />
        <meshBasicMaterial color={powered ? '#e68a98' : '#1d1013'} toneMapped={false} />
      </mesh>
    </group>
  );
}
