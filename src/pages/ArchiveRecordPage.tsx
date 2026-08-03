import { useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { EvidenceFigure } from '@/components/archive/EvidenceFigure';
import { IntegrityMeter, StatusBadge } from '@/components/typography/StatusBadge';
import { findProjectBySlug } from '@/content/projects';
import { NotFoundPage } from './NotFoundPage';
import type { ProjectSection } from '@/types/content';

function Subsections({ sections }: { sections: ProjectSection[] }): React.JSX.Element {
  return (
    <>
      {sections.map((section) => (
        <div className="record-subsection" key={section.heading}>
          <h3>{section.heading}</h3>
          <div className="prose">
            {section.body.map((paragraph) => (
              <p key={paragraph.slice(0, 40)} className="muted">
                {paragraph}
              </p>
            ))}
          </div>
        </div>
      ))}
    </>
  );
}

export function ArchiveRecordPage(): React.JSX.Element {
  const { slug } = useParams<{ slug: string }>();
  const record = slug ? findProjectBySlug(slug) : undefined;

  useEffect(() => {
    document.title = record
      ? `${record.id} ${record.title} // NODE 07`
      : 'RECORD NOT FOUND // NODE 07';
  }, [record]);

  if (!record) {
    return <NotFoundPage />;
  }

  return (
    <article className="shell-inner page">
      <p className="page__eyebrow">
        <Link to="/archive">← archive index</Link>
      </p>

      <header className="record-head">
        <div>
          <p className="page__eyebrow">{record.id}</p>
          <h1 className="page__title">{record.title}</h1>
          <p className="page__lede">{record.subtitle}</p>
        </div>
        <div className="record-head__meta">
          <StatusBadge status={record.status} />
          <IntegrityMeter value={record.integrity} />
          <span className="dim">
            {record.type} · {record.year}
          </span>
        </div>
      </header>

      <section className="record-section">
        <h2 className="record-section__title">summary</h2>
        <p className="prose">{record.summary}</p>

        <dl className="def-grid" style={{ marginTop: 'var(--space-5)' }}>
          <dt>stack</dt>
          <dd>
            <ul className="tag-list">
              {record.technologies.map((tech) => (
                <li className="tag" key={tech}>
                  {tech}
                </li>
              ))}
            </ul>
          </dd>
          <dt>role</dt>
          <dd>
            <ul className="bullet-list">
              {record.responsibilities.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </dd>
        </dl>
      </section>

      <section className="record-section">
        <h2 className="record-section__title">problem</h2>
        <div className="prose">
          {record.problem.map((paragraph) => (
            <p key={paragraph.slice(0, 40)}>{paragraph}</p>
          ))}
        </div>
      </section>

      <section className="record-section">
        <h2 className="record-section__title">constraints</h2>
        <ul className="bullet-list">
          {record.constraints.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <section className="record-section">
        <h2 className="record-section__title">design process</h2>
        <Subsections sections={record.process} />
      </section>

      <section className="record-section">
        <h2 className="record-section__title">technical implementation</h2>
        <Subsections sections={record.implementation} />
      </section>

      <section className="record-section">
        <h2 className="record-section__title">visual evidence</h2>
        <div className="evidence-grid">
          {record.evidence.map((item) => (
            <EvidenceFigure key={item.caption} evidence={item} />
          ))}
        </div>
        <p className="dim" style={{ marginTop: 'var(--space-3)', fontSize: 'var(--text-2xs)' }}>
          Evidence frames are procedurally reconstructed from record seeds.
        </p>
      </section>

      <section className="record-section">
        <h2 className="record-section__title">outcome</h2>
        <ul className="bullet-list">
          {record.outcome.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <section className="record-section">
        <h2 className="record-section__title">anomaly log</h2>
        <ul className="bullet-list anomaly-list">
          {record.anomalies.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      {record.repositoryUrl || record.demoUrl ? (
        <section className="record-section">
          <h2 className="record-section__title">links</h2>
          <div className="hero__actions">
            {record.repositoryUrl ? (
              <a
                className="btn"
                href={record.repositoryUrl}
                rel="noreferrer noopener"
                target="_blank"
              >
                source
              </a>
            ) : null}
            {record.demoUrl ? (
              <a
                className="btn"
                href={record.demoUrl}
                rel="noreferrer noopener"
                target="_blank"
              >
                live demo
              </a>
            ) : null}
          </div>
        </section>
      ) : null}
    </article>
  );
}
