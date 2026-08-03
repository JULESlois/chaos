import type { ChannelDescriptor } from './state/tv-store';

interface TVControlsProps {
  channels: readonly ChannelDescriptor[];
  activeId: string;
  powered: boolean;
  switching: boolean;
  onPrevious: () => void;
  onNext: () => void;
  onTogglePower: () => void;
  onSelect: (id: string) => void;
}

/**
 * The accessible control path.
 *
 * The 3D buttons on the cabinet are a duplicate of these, never a
 * replacement: everything the set can do is reachable here with a keyboard,
 * a screen reader, or a device that never loaded WebGL at all.
 */
export function TVControls({
  channels,
  activeId,
  powered,
  switching,
  onPrevious,
  onNext,
  onTogglePower,
  onSelect,
}: TVControlsProps): React.JSX.Element {
  const active = channels.find((channel) => channel.id === activeId);

  return (
    <div className="tv-controls">
      <div className="tv-controls__row">
        <button
          type="button"
          className="btn btn--ghost"
          onClick={onPrevious}
          disabled={!powered || switching}
          aria-label="Previous channel"
        >
          ◀ prev
        </button>
        <button
          type="button"
          className="btn btn--ghost"
          onClick={onNext}
          disabled={!powered || switching}
          aria-label="Next channel"
        >
          next ▶
        </button>
        <button
          type="button"
          className="btn"
          onClick={onTogglePower}
          aria-pressed={powered}
        >
          power {powered ? 'on' : 'off'}
        </button>
      </div>

      <ul className="tv-controls__channels">
        {channels.map((channel) => {
          const isActive = channel.id === activeId;
          return (
            <li key={channel.id}>
              <button
                type="button"
                className="tv-controls__channel"
                data-active={isActive}
                aria-current={isActive ? 'true' : undefined}
                onClick={() => onSelect(channel.id)}
                disabled={!powered || switching}
              >
                {channel.label}
              </button>
            </li>
          );
        })}
      </ul>

      <p className="tv-controls__readout" role="status" aria-live="polite">
        {powered
          ? `receiving ${active?.label ?? activeId}`
          : 'receiver in standby'}
      </p>

      <p className="tv-controls__hint muted">
        keyboard: ← → change channel · p toggles power
      </p>
    </div>
  );
}
