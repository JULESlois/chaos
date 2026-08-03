import { Link } from 'react-router-dom';
import { IntegrityMeter, StatusBadge } from '@/components/typography/StatusBadge';
import type { ProjectRecord } from '@/types/content';

interface RecordTableProps {
  records: readonly ProjectRecord[];
  caption: string;
  /** Rendered as an extra, clearly-marked row by the phantom-record anomaly. */
  phantomRow?: boolean;
}

export function RecordTable({
  records,
  caption,
  phantomRow = false,
}: RecordTableProps): React.JSX.Element {
  return (
    <div className="panel panel--flush">
      <table className="record-table">
        <caption>{caption}</caption>
        <thead>
          <tr>
            <th scope="col">id</th>
            <th scope="col">record</th>
            <th scope="col">type</th>
            <th scope="col">year</th>
            <th scope="col">stack</th>
            <th scope="col">integrity</th>
            <th scope="col">status</th>
          </tr>
        </thead>
        <tbody>
          {records.map((record) => (
            <tr key={record.id}>
              <td className="record-table__id">{record.id}</td>
              <td className="record-table__title">
                <Link to={`/archive/${record.slug}`}>{record.title}</Link>
                <span className="record-table__sub">{record.subtitle}</span>
              </td>
              <td className="muted">{record.type}</td>
              <td className="muted">{record.year}</td>
              <td className="record-table__stack">
                {record.technologies.slice(0, 3).join(' · ')}
              </td>
              <td>
                <IntegrityMeter value={record.integrity} />
              </td>
              <td>
                <StatusBadge status={record.status} />
              </td>
            </tr>
          ))}

          {phantomRow ? (
            <tr aria-hidden="true" className="dim">
              <td className="record-table__id">REC-0??</td>
              <td className="record-table__title">
                <span className="warning">████████████</span>
                <span className="record-table__sub">
                  record present in index, absent from snapshot
                </span>
              </td>
              <td className="muted">UNKNOWN</td>
              <td className="muted">????</td>
              <td className="record-table__stack">—</td>
              <td>
                <IntegrityMeter value={0} />
              </td>
              <td>
                <StatusBadge status="corrupted" />
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
