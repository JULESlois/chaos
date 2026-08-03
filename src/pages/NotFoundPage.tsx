import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useSystem } from '@/systems/telemetry/SystemProvider';

export function NotFoundPage(): React.JSX.Element {
  const navigate = useNavigate();
  const { unlock } = useSystem();
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    document.title = 'ERROR 404 // NODE 07';
  }, []);

  const reveal = (): void => {
    if (revealed) {
      unlock('signal');
      navigate('/signal');
      return;
    }
    setRevealed(true);
  };

  return (
    <div className="shell-inner page error-page">
      <p className="page__eyebrow">record lookup failed</p>
      <h1 className="error-page__code">ERROR 404</h1>

      <div className="prose">
        <p>THE REQUESTED RECORD DOES NOT EXIST.</p>
        <p className="muted">However, the system remembers you opening it.</p>
      </div>

      <div className="hero__actions">
        <Link className="btn btn--primary" to="/">
          return to index
        </Link>
        <Link className="btn" to="/archive">
          open archive
        </Link>
      </div>

      <p className="error-page__hint">
        Press <kbd>/</kbd> or <kbd>Ctrl</kbd>+<kbd>K</kbd> to open the console.
      </p>

      {/* Hidden entrance to the narrative branch — two deliberate activations. */}
      <button
        type="button"
        className="error-page__hidden-entry"
        onClick={reveal}
        aria-label={
          revealed
            ? 'Open the unlisted signal record'
            : 'Inspect the incomplete lookup trace'
        }
      >
        {revealed ? '> open unlisted record /signal' : '· · ·'}
      </button>
    </div>
  );
}
