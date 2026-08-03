import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useChaos } from '@/systems/chaos/ChaosProvider';
import { useSystem } from '@/systems/telemetry/SystemProvider';
import {
  completionCandidates,
  runCommand,
  type CommandContext,
  type ConsoleLine,
} from './console-commands';

const BANNER: readonly string[] = [
  'NODE 07 CONSOLE — local session',
  'type "help" for available commands, Escape to close',
];

let lineId = 0;
function nextLineId(): number {
  lineId += 1;
  return lineId;
}

export function CommandConsole({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}): React.JSX.Element | null {
  const navigate = useNavigate();
  const { entropy, signalState, stabilised, setStabilised, totalFired } = useChaos();
  const { audioEnabled, setAudioEnabled, unlock, hasUnlocked } = useSystem();

  const [lines, setLines] = useState<ConsoleLine[]>(() =>
    BANNER.map((text) => ({ id: nextLineId(), kind: 'output' as const, text })),
  );
  const [input, setInput] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  const observerCountRef = useRef(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const outputRef = useRef<HTMLDivElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const titleId = useId();

  const appendLines = useCallback(
    (texts: string[], kind: ConsoleLine['kind'] = 'output') => {
      if (texts.length === 0) return;
      setLines((previous) => [
        ...previous.slice(-160),
        ...texts.map((text) => ({ id: nextLineId(), kind, text })),
      ]);
    },
    [],
  );

  const clearLines = useCallback(() => setLines([]), []);

  // Focus management: remember what had focus, restore it on close.
  useEffect(() => {
    if (!open) return;
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    const timer = window.setTimeout(() => inputRef.current?.focus(), 20);
    return () => {
      window.clearTimeout(timer);
      previouslyFocused.current?.focus?.();
    };
  }, [open]);

  // Keep the newest output in view.
  useEffect(() => {
    const output = outputRef.current;
    if (output) output.scrollTop = output.scrollHeight;
  }, [lines]);

  const submit = useCallback(
    (raw: string) => {
      const value = raw.trim();
      appendLines([`> ${value || ''}`], 'input');
      if (!value) return;

      setHistory((previous) => [...previous.slice(-40), value]);
      setHistoryIndex(-1);

      const context: CommandContext = {
        navigate: (path) => navigate(path),
        setStabilised,
        setAudioEnabled,
        unlock,
        hasUnlocked,
        close: onClose,
        clear: clearLines,
        entropy,
        signalState,
        stabilised,
        audioEnabled,
        totalFired,
        observerCount: observerCountRef.current,
        bumpObserverCount: () => {
          observerCountRef.current += 1;
          return observerCountRef.current;
        },
      };

      const result = runCommand(value, context);
      appendLines(result.lines, result.kind ?? 'output');
    },
    [
      appendLines,
      clearLines,
      navigate,
      onClose,
      setAudioEnabled,
      setStabilised,
      unlock,
      hasUnlocked,
      entropy,
      signalState,
      stabilised,
      audioEnabled,
      totalFired,
    ],
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        submit(input);
        setInput('');
        return;
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault();
        if (history.length === 0) return;
        const next = historyIndex < 0 ? history.length - 1 : Math.max(0, historyIndex - 1);
        setHistoryIndex(next);
        setInput(history[next] ?? '');
        return;
      }

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        if (historyIndex < 0) return;
        const next = historyIndex + 1;
        if (next >= history.length) {
          setHistoryIndex(-1);
          setInput('');
        } else {
          setHistoryIndex(next);
          setInput(history[next] ?? '');
        }
        return;
      }

      if (event.key === 'Tab') {
        event.preventDefault();
        const candidates = completionCandidates(input);
        if (candidates.length === 1) {
          setInput(`${candidates[0]} `);
        } else if (candidates.length > 1) {
          appendLines([candidates.join('  ')], 'output');
        }
      }
    },
    [appendLines, history, historyIndex, input, submit],
  );

  // Escape closes; focus is trapped inside the dialog while it is open.
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== 'Tab') return;

      const dialog = dialogRef.current;
      if (!dialog) return;
      const focusables = dialog.querySelectorAll<HTMLElement>(
        'button, input, [href], [tabindex]:not([tabindex="-1"])',
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="console" role="presentation">
      <div
        className="console__backdrop"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={dialogRef}
        className="console__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="console__head">
          <h2 id={titleId} className="console__title">
            node 07 console
          </h2>
          <button type="button" className="btn btn--sm btn--ghost" onClick={onClose}>
            close
          </button>
        </div>

        <div className="console__output" ref={outputRef} tabIndex={0} role="log">
          {lines.map((line) => (
            <pre key={line.id} className="console__line" data-kind={line.kind}>
              {line.text}
            </pre>
          ))}
        </div>

        <div className="console__prompt">
          <label htmlFor="console-input" className="console__caret" aria-hidden="true">
            &gt;
          </label>
          <label htmlFor="console-input" className="visually-hidden">
            Console command
          </label>
          <input
            id="console-input"
            ref={inputRef}
            className="console__input"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={handleKeyDown}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            placeholder="help"
          />
        </div>
      </div>
    </div>
  );
}
