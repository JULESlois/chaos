import { NavLink } from 'react-router-dom';
import { profile } from '@/content/profile';
import { useChaos } from '@/systems/chaos/ChaosProvider';
import { useSystem } from '@/systems/telemetry/SystemProvider';

const NAV_ITEMS = [
  { to: '/', label: 'index', end: true },
  { to: '/archive', label: 'archive', end: false },
  { to: '/operator', label: 'operator', end: false },
  { to: '/logs', label: 'logs', end: false },
];

export function SystemHeader({
  onOpenConsole,
}: {
  onOpenConsole: () => void;
}): React.JSX.Element {
  const { stabilised, setStabilised } = useChaos();
  const { audioEnabled, setAudioEnabled } = useSystem();

  return (
    <header className="system-header">
      <div className="shell-inner system-header__bar">
        <p className="system-header__id">
          <b>{profile.nodeId}</b>
          <span aria-hidden="true">/</span>
          <span>archive terminal</span>
        </p>

        <nav className="system-header__nav" aria-label="Primary">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className="system-header__link"
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="system-header__actions">
          <button
            type="button"
            className="btn btn--sm btn--ghost"
            onClick={onOpenConsole}
            aria-keyshortcuts="Control+K"
          >
            console
          </button>
          <button
            type="button"
            className={`btn btn--sm btn--ghost${audioEnabled ? ' btn--active' : ''}`}
            onClick={() => setAudioEnabled(!audioEnabled)}
            aria-pressed={audioEnabled}
            disabled={stabilised}
            title={stabilised ? 'Audio is disabled in stabilised mode' : undefined}
          >
            audio {audioEnabled ? 'on' : 'off'}
          </button>
          <button
            type="button"
            className={`btn btn--sm${stabilised ? ' btn--active' : ''}`}
            onClick={() => setStabilised(!stabilised)}
            aria-pressed={stabilised}
          >
            {stabilised ? 'stabilised' : 'stabilise'}
          </button>
        </div>
      </div>
    </header>
  );
}
