import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { RecordTable } from '@/components/archive/RecordTable';
import { StatusStrip } from '@/components/layout/StatusStrip';
import { logs } from '@/content/logs';
import { profile } from '@/content/profile';
import { projects } from '@/content/projects';
import { TVExperienceSection } from '@/features/tv/TVExperienceSection';

export function HomePage(): React.JSX.Element {
  useEffect(() => {
    document.title = 'NODE 07 // ARCHIVE TERMINAL';
  }, []);

  const featured = projects.filter((project) => project.status !== 'classified').slice(0, 3);
  const recentLogs = logs.slice(0, 3);

  return (
    <>
      <div className="shell-inner">
        <StatusStrip />
      </div>

      <section className="shell-inner hero">
        <p className="hero__frame">[ {profile.nodeId} / connection established ]</p>

        <h1 className="hero__title">Archive Terminal</h1>

        <dl className="hero__readout">
          <div>
            <dt>operator</dt>
            <dd>{profile.displayName}</dd>
          </div>
          <div>
            <dt>role</dt>
            <dd>{profile.role}</dd>
          </div>
          <div>
            <dt>status</dt>
            <dd>{profile.status}</dd>
          </div>
        </dl>

        <p className="hero__statement">
          {profile.heroLines.map((line) => (
            <span key={line}>{line}</span>
          ))}
        </p>

        <div className="hero__actions">
          <Link className="btn btn--primary" to="/archive">
            [ view records ]
          </Link>
          <Link className="btn" to="/operator">
            [ operator profile ]
          </Link>
        </div>
      </section>

      {/* Three.js television chapter. Falls back automatically without WebGL. */}
      <TVExperienceSection />

      <section className="shell-inner section">
        <div className="section__head">
          <h2 className="section__title">selected records</h2>
          <p className="section__meta">
            <Link to="/archive">full index →</Link>
          </p>
        </div>
        <RecordTable records={featured} caption="Selected archive records" />
      </section>

      <section className="shell-inner section">
        <div className="section__head">
          <h2 className="section__title">recent logs</h2>
          <p className="section__meta">
            <Link to="/logs">all logs →</Link>
          </p>
        </div>
        <ul className="bullet-list">
          {recentLogs.map((entry) => (
            <li key={entry.id}>
              <span className="dim">{entry.date}</span>{' '}
              <Link to="/logs">{entry.title}</Link>
              <br />
              <span className="muted" style={{ fontSize: 'var(--text-xs)' }}>
                {entry.excerpt}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="shell-inner section">
        <div className="section__head">
          <h2 className="section__title">operator</h2>
        </div>
        <div className="prose">
          <p className="muted">{profile.summary[0]}</p>
        </div>
        <div className="hero__actions" style={{ marginTop: 'var(--space-4)' }}>
          <Link className="btn btn--ghost" to="/operator">
            read full record
          </Link>
        </div>
      </section>
    </>
  );
}
