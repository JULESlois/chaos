import { useEffect, useMemo, useState } from 'react';
import { RecordTable } from '@/components/archive/RecordTable';
import { projects } from '@/content/projects';
import { useChaos } from '@/systems/chaos/ChaosProvider';
import type { RecordStatus } from '@/types/content';

const FILTERS: readonly (RecordStatus | 'all')[] = [
  'all',
  'verified',
  'partial',
  'corrupted',
  'classified',
];

export function ArchiveIndexPage(): React.JSX.Element {
  const { activeEventIds, stabilised } = useChaos();
  const [filter, setFilter] = useState<RecordStatus | 'all'>('all');

  const phantomRow = !stabilised && activeEventIds.includes('phantom-record');
  const checksumFailure = !stabilised && activeEventIds.includes('checksum-failure');

  const visible = useMemo(
    () => (filter === 'all' ? projects : projects.filter((p) => p.status === filter)),
    [filter],
  );

  useEffect(() => {
    document.title = 'ARCHIVE INDEX // NODE 07';
  }, []);

  return (
    <div className="shell-inner page">
      <header className="page__head">
        <p className="page__eyebrow">section 02 — record index</p>
        <h1 className="page__title">Archive</h1>
        <p className="page__lede">
          {projects.length} records catalogued. Integrity values are recomputed on each
          snapshot; entries below 50% are retained for index completeness only.
        </p>
      </header>

      <div className="section__head">
        <div className="tag-list" role="group" aria-label="Filter records by status">
          {FILTERS.map((value) => (
            <button
              key={value}
              type="button"
              className={`btn btn--sm${filter === value ? ' btn--active' : ' btn--ghost'}`}
              onClick={() => setFilter(value)}
              aria-pressed={filter === value}
            >
              {value}
            </button>
          ))}
        </div>
        <p className="section__meta">
          {visible.length} / {projects.length} shown
          {checksumFailure ? ' · checksum mismatch' : ''}
        </p>
      </div>

      {checksumFailure ? (
        <p className="warning" role="status">
          ! index checksum does not match the previous snapshot — displayed values may be
          stale
        </p>
      ) : null}

      {visible.length > 0 ? (
        <RecordTable
          records={visible}
          caption={`Archive index — filter: ${filter}`}
          phantomRow={phantomRow && filter === 'all'}
        />
      ) : (
        <p className="muted">No records match this filter.</p>
      )}
    </div>
  );
}
