import { useEffect, useState } from 'react';
import { StatusBadge } from '@/components/typography/StatusBadge';
import { logs } from '@/content/logs';
import { useSystem } from '@/systems/telemetry/SystemProvider';

export function LogsPage(): React.JSX.Element {
  const [openId, setOpenId] = useState<string | null>(null);
  const { unlock } = useSystem();

  useEffect(() => {
    document.title = 'LOGS // NODE 07';
  }, []);

  const toggle = (id: string, restricted: boolean): void => {
    setOpenId((previous) => (previous === id ? null : id));
    if (restricted) unlock('do-not-open');
  };

  return (
    <div className="shell-inner page">
      <header className="page__head">
        <p className="page__eyebrow">section 04 — operator logs</p>
        <h1 className="page__title">Logs</h1>
        <p className="page__lede">
          Working notes written during implementation. {logs.length} entries on disk.
        </p>
      </header>

      <div className="log-tree">
        <p className="log-tree__root">/logs</p>

        {logs.map((entry, index) => {
          const isOpen = openId === entry.id;
          const isLast = index === logs.length - 1;
          const panelId = `log-panel-${entry.id}`;

          return (
            <div
              className="log-entry"
              key={entry.id}
              data-restricted={String(Boolean(entry.restricted))}
            >
              <button
                type="button"
                className="log-entry__button"
                onClick={() => toggle(entry.id, Boolean(entry.restricted))}
                aria-expanded={isOpen}
                aria-controls={panelId}
              >
                <span className="log-entry__branch" aria-hidden="true">
                  {isLast ? '└──' : '├──'}
                </span>
                <span className="log-entry__name">{entry.filename}</span>
                <span className="log-entry__size">{entry.size}</span>
              </button>

              {isOpen ? (
                <div className="log-entry__body" id={panelId}>
                  <h2 className="log-entry__title">{entry.title}</h2>
                  <div className="log-entry__meta">
                    <span>{entry.date}</span>
                    <span>{entry.id}</span>
                    <StatusBadge status={entry.status} />
                  </div>
                  <div className="prose">
                    {entry.body.map((paragraph) => (
                      <p key={paragraph.slice(0, 40)} className="muted">
                        {paragraph}
                      </p>
                    ))}
                  </div>
                </div>
              ) : (
                <p
                  className="log-entry__body dim"
                  id={panelId}
                  hidden
                  aria-hidden="true"
                >
                  {entry.excerpt}
                </p>
              )}
            </div>
          );
        })}
      </div>

      <p className="dim" style={{ marginTop: 'var(--space-5)', fontSize: 'var(--text-2xs)' }}>
        Entries are stored as plain text. Timestamps reflect the archive clock, which is
        not authoritative.
      </p>
    </div>
  );
}
