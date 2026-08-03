import { EXPERIENCE_PHASES } from './phases';

/**
 * The scroll track.
 *
 * These sections have no content — they exist only to give the document the
 * height that the timeline measures against. Everything visible is drawn by
 * the fixed ASCII stage behind them and the television at the end.
 */
export function ExperienceTimeline(): React.JSX.Element {
  return (
    <div className="timeline" aria-hidden="true">
      {EXPERIENCE_PHASES.map((phase) => (
        <section
          key={phase.id}
          className="timeline__phase"
          data-phase={phase.id}
          style={{ height: `${phase.heightVh}vh` }}
        />
      ))}
    </div>
  );
}
