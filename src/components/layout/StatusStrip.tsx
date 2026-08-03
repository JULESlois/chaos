import { useEffect, useState } from 'react';
import { useChaos } from '@/systems/chaos/ChaosProvider';
import { useSystem } from '@/systems/telemetry/SystemProvider';

/** Formats a UTC timestamp, optionally desynced by the clock anomaly. */
function formatClock(date: Date, offsetMs: number): string {
  const shifted = new Date(date.getTime() + offsetMs);
  const hh = String(shifted.getUTCHours()).padStart(2, '0');
  const mm = String(shifted.getUTCMinutes()).padStart(2, '0');
  const ss = String(shifted.getUTCSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}Z`;
}

export function StatusStrip(): React.JSX.Element {
  const { signalState, entropy, stabilised, activeEventIds, totalFired } = useChaos();
  const { renderLevel, capabilities } = useSystem();
  const [clock, setClock] = useState(() => new Date());

  const desynced = !stabilised && activeEventIds.includes('clock-desync');

  useEffect(() => {
    // 1Hz is enough for a clock and keeps this out of the render hot path.
    const id = window.setInterval(() => setClock(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const offset = desynced ? -1000 * 60 * 60 * 7 - 4211 : 0;

  return (
    <div className="status-strip" role="status" aria-live="off">
      <span className="status-strip__item">
        <span className="status-strip__label">signal</span>
        <span className="signal-dot status-strip__value" data-state={signalState}>
          {signalState}
        </span>
      </span>

      <span className="status-strip__item">
        <span className="status-strip__label">entropy</span>
        <span className="status-strip__value">{entropy.toFixed(2)}</span>
      </span>

      <span className="status-strip__item">
        <span className="status-strip__label">clock</span>
        <span className={`status-strip__value${desynced ? ' warning' : ''}`}>
          {formatClock(clock, offset)}
          {desynced ? ' ?' : ''}
        </span>
      </span>

      <span className="status-strip__item">
        <span className="status-strip__label">render</span>
        <span className="status-strip__value">
          L{renderLevel}
          {capabilities.webgl ? '' : ' / no-gl'}
        </span>
      </span>

      <span className="status-strip__item">
        <span className="status-strip__label">anomalies</span>
        <span className="status-strip__value">
          {String(totalFired).padStart(3, '0')}
        </span>
      </span>

      {stabilised ? (
        <span className="status-strip__item signal">
          <span className="status-strip__label">mode</span>
          <span>stabilised</span>
        </span>
      ) : null}
    </div>
  );
}
