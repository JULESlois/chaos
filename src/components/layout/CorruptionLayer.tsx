import { useChaos } from '@/systems/chaos/ChaosProvider';
import { hash01 } from '@/utils/math';

/**
 * Layer 3 — full-viewport visual anomalies.
 *
 * Every effect here is purely additive and self-clearing: the layer never
 * mutates page content, so no anomaly can permanently damage the archive.
 */
export function CorruptionLayer(): React.JSX.Element | null {
  const { activeEventIds, stabilised } = useChaos();

  if (stabilised || activeEventIds.length === 0) return null;

  const showTear = activeEventIds.includes('horizontal-tear');
  const showSilence = activeEventIds.includes('signal-silence');
  const showObserver = activeEventIds.includes('observer-detected');

  if (!showTear && !showSilence && !showObserver) return null;

  const seed = activeEventIds.length * 977 + activeEventIds[0].length;
  const tearTop = `${(12 + hash01(seed) * 70).toFixed(1)}%`;
  const tearShift = `${(hash01(seed + 1) * 18 - 9).toFixed(1)}px`;
  const tearHeight = `${(6 + hash01(seed + 2) * 22).toFixed(0)}px`;

  return (
    <div className="corruption-layer" aria-hidden="true">
      {showTear ? (
        <div
          className="corruption-layer__tear"
          style={{
            ['--tear-top' as string]: tearTop,
            ['--tear-shift' as string]: tearShift,
            ['--tear-height' as string]: tearHeight,
          }}
        />
      ) : null}

      {showObserver ? (
        <p className="corruption-layer__observer">observer detected</p>
      ) : null}

      {showSilence ? (
        <div className="corruption-layer__silence">
          <span className="corruption-layer__silence-text">signal lost</span>
        </div>
      ) : null}
    </div>
  );
}
