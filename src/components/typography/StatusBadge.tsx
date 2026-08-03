import type { RecordStatus } from '@/types/content';

/** Glyphs ensure status is never communicated by colour alone. */
const STATUS_GLYPH: Record<RecordStatus, string> = {
  verified: '✓',
  partial: '◐',
  corrupted: '✕',
  classified: '▨',
};

const STATUS_LABEL: Record<RecordStatus, string> = {
  verified: 'verified',
  partial: 'partial',
  corrupted: 'corrupted',
  classified: 'classified',
};

export function StatusBadge({ status }: { status: RecordStatus }): React.JSX.Element {
  return (
    <span className="status-badge" data-status={status}>
      <span aria-hidden="true">{STATUS_GLYPH[status]}</span>
      {STATUS_LABEL[status]}
    </span>
  );
}

/** Numeric integrity readout with a decorative bar. */
export function IntegrityMeter({ value }: { value: number }): React.JSX.Element {
  const clamped = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <span className="integrity" data-low={clamped < 50}>
      <span className="integrity__track" aria-hidden="true">
        <span className="integrity__fill" style={{ width: `${clamped}%` }} />
      </span>
      <span>{clamped}%</span>
    </span>
  );
}
