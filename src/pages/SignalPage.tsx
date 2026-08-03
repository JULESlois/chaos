import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useChaos } from '@/systems/chaos/ChaosProvider';
import { useSystem } from '@/systems/telemetry/SystemProvider';

const REVEAL_STEPS = 5;

/**
 * The hidden narrative route.
 *
 * Reachable from the console (`open /signal`), the 404 page, or TV channel 04.
 * Everything here is local fiction — the page makes no network requests and
 * reads no device data beyond a dwell timer.
 */
export function SignalPage(): React.JSX.Element {
  const { director, stabilised } = useChaos();
  const { hasUnlocked, unlock } = useSystem();
  const [step, setStep] = useState(0);

  useEffect(() => {
    document.title = 'SIGNAL // UNLISTED';
    unlock('signal');
  }, [unlock]);

  // Dwell timer reveals the text progressively.
  useEffect(() => {
    if (step >= REVEAL_STEPS) return;
    const delay = stabilised ? 400 : 1400;
    const id = window.setTimeout(() => setStep((previous) => previous + 1), delay);
    return () => window.clearTimeout(id);
  }, [step, stabilised]);

  // Being here raises entropy slightly; the effect is released on unmount.
  useEffect(() => {
    if (stabilised) return;
    director.boost(0.18);
  }, [director, stabilised]);

  const sawMissing = hasUnlocked('missing');
  const sawObserver = hasUnlocked('observer');

  return (
    <div className="shell-inner page signal-page">
      <header className="page__head">
        <p className="page__eyebrow">unlisted route — not present in the index</p>
        <h1 className="page__title">Signal</h1>
      </header>

      <div className="prose">
        <p className="signal-page__block">
          This record has no identifier. It is not part of the archive. It was written to
          the same disk.
        </p>

        {step >= 1 ? (
          <p className="signal-page__block muted">
            The receiver in the index page has five channels. The channel table lists
            four. The fifth answers anyway.
          </p>
        ) : null}

        {step >= 2 ? (
          <p className="signal-page__block muted">
            Everything rendered here is generated on your device. Nothing is transmitted.
            No camera, no microphone, no telemetry leaves this page — the archive only
            pretends to know things it has been told.
          </p>
        ) : null}

        {step >= 3 ? (
          <p className="signal-page__block">
            What it has been told:{' '}
            <span className={sawObserver ? '' : 'signal-page__redacted'}>
              that you ran the observe command
            </span>
            ,{' '}
            <span className={sawMissing ? '' : 'signal-page__redacted'}>
              that you listed the missing records
            </span>
            , and that you arrived here on purpose.
          </p>
        ) : null}

        {step >= 4 ? (
          <p className="signal-page__whisper">
            REC-000 is still listed in the snapshot. It has no title, no year and no
            author. Its integrity field reads a value the renderer cannot display.
          </p>
        ) : null}

        {step >= REVEAL_STEPS ? (
          <p className="signal-page__block warning">
            The archive would like you to close this record now.
          </p>
        ) : null}
      </div>

      <div className="hero__actions" style={{ marginTop: 'var(--space-6)' }}>
        <Link className="btn btn--primary" to="/">
          close record
        </Link>
        <Link className="btn" to="/archive">
          return to index
        </Link>
      </div>
    </div>
  );
}
