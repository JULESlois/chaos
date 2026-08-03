import { useEffect } from 'react';
import { profile } from '@/content/profile';

export function OperatorPage(): React.JSX.Element {
  useEffect(() => {
    document.title = 'OPERATOR // NODE 07';
  }, []);

  return (
    <div className="shell-inner page">
      <header className="page__head">
        <p className="page__eyebrow">section 03 — operator record</p>
        <h1 className="page__title">Operator</h1>
        <p className="page__lede">
          {profile.callsign} · {profile.role} · status: {profile.status}
        </p>
      </header>

      <section className="section">
        <div className="section__head">
          <h2 className="section__title">summary</h2>
        </div>
        <div className="prose">
          {profile.summary.map((paragraph) => (
            <p key={paragraph.slice(0, 40)}>{paragraph}</p>
          ))}
        </div>
      </section>

      <section className="section">
        <div className="section__head">
          <h2 className="section__title">capabilities</h2>
          <p className="section__meta">no proficiency percentages are recorded</p>
        </div>
        <div className="card-grid">
          {profile.skills.map((group) => (
            <div className="panel" key={group.group}>
              <p className="mono-label" style={{ marginBottom: 'var(--space-3)' }}>
                {group.group}
              </p>
              <ul className="bullet-list">
                {group.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section className="section">
        <div className="section__head">
          <h2 className="section__title">tools</h2>
        </div>
        <ul className="tag-list">
          {profile.tools.map((tool) => (
            <li className="tag" key={tool}>
              {tool}
            </li>
          ))}
        </ul>
      </section>

      <section className="section">
        <div className="section__head">
          <h2 className="section__title">service record</h2>
        </div>
        <div className="timeline">
          {profile.timeline.map((entry) => (
            <div className="timeline__item" key={`${entry.period}-${entry.role}`}>
              <p className="timeline__period">{entry.period}</p>
              <div>
                <p className="timeline__role">{entry.role}</p>
                <p className="timeline__org">{entry.organisation}</p>
              </div>
              <p className="timeline__detail">{entry.detail}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="section">
        <div className="section__head">
          <h2 className="section__title">current interests</h2>
        </div>
        <ul className="bullet-list">
          {profile.interests.map((interest) => (
            <li key={interest}>{interest}</li>
          ))}
        </ul>
      </section>

      <section className="section">
        <div className="section__head">
          <h2 className="section__title">contact</h2>
        </div>
        <dl className="def-grid">
          {profile.contacts.map((contact) => (
            <div key={contact.label} style={{ display: 'contents' }}>
              <dt>{contact.label}</dt>
              <dd>
                <a href={contact.href} rel="noreferrer noopener">
                  {contact.value}
                </a>
              </dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
