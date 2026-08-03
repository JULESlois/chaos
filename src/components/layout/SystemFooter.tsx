import { Link } from 'react-router-dom';
import { profile } from '@/content/profile';
import { useChaos } from '@/systems/chaos/ChaosProvider';

export function SystemFooter(): React.JSX.Element {
  const { signalState, entropy } = useChaos();
  const year = new Date().getFullYear();

  return (
    <footer className="system-footer">
      <div className="shell-inner system-footer__inner">
        <div className="system-footer__block">
          <p className="mono-label">terminal</p>
          <p className="muted">
            {profile.nodeId} · {profile.callsign}
          </p>
          <p className="dim">{profile.location}</p>
        </div>

        <div className="system-footer__block">
          <p className="mono-label">records</p>
          <ul className="system-footer__links">
            <li>
              <Link to="/archive">archive index</Link>
            </li>
            <li>
              <Link to="/logs">operator logs</Link>
            </li>
            <li>
              <Link to="/operator">operator profile</Link>
            </li>
          </ul>
        </div>

        <div className="system-footer__block">
          <p className="mono-label">contact</p>
          <ul className="system-footer__links">
            {profile.contacts.map((contact) => (
              <li key={contact.label}>
                <a href={contact.href} rel="noreferrer noopener">
                  {contact.value}
                </a>
              </li>
            ))}
          </ul>
        </div>

        <div className="system-footer__block">
          <p className="mono-label">state</p>
          <p className="muted">
            signal: <span className="signal-dot" data-state={signalState}>{signalState}</span>
          </p>
          <p className="dim">entropy {entropy.toFixed(2)}</p>
        </div>
      </div>

      <div className="shell-inner system-footer__baseline">
        <p className="dim">
          © {year} {profile.nodeId} — contents partially reconstructed.
        </p>
        <p className="dim">end of transmission</p>
      </div>
    </footer>
  );
}
