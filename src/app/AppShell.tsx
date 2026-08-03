import { useCallback, useEffect, useRef, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { CorruptionLayer } from '@/components/layout/CorruptionLayer';
import { SystemFooter } from '@/components/layout/SystemFooter';
import { SystemHeader } from '@/components/layout/SystemHeader';
import { TextureLayer } from '@/components/layout/TextureLayer';
import { CommandConsole } from '@/components/navigation/CommandConsole';
import { AsciiCanvas } from '@/systems/ascii/AsciiCanvas';
import { signalBus } from '@/utils/signal-bus';

/**
 * Global layout. Owns the rendering layer stack and the console.
 *
 * Layer order matches the documented model:
 *   0 background · 1 ASCII · 2 texture · 3 corruption · 4 content · 5 interface
 */
export function AppShell(): React.JSX.Element {
  const [consoleOpen, setConsoleOpen] = useState(false);
  const location = useLocation();
  const mainRef = useRef<HTMLElement | null>(null);
  const isFirstRoute = useRef(true);

  const openConsole = useCallback(() => setConsoleOpen(true), []);
  const closeConsole = useCallback(() => setConsoleOpen(false), []);

  // Global shortcuts: Ctrl/Cmd+K and "/" open the console.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null;
      const isEditable =
        target instanceof HTMLElement &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable);

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setConsoleOpen((previous) => !previous);
        return;
      }

      if (event.key === '/' && !isEditable && !consoleOpen) {
        event.preventDefault();
        setConsoleOpen(true);
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [consoleOpen]);

  // Console may request navigation from a non-React context.
  useEffect(() => signalBus.on('console:navigate', () => setConsoleOpen(false)), []);

  // Reset scroll and move focus to main on route change (not on first paint).
  useEffect(() => {
    if (isFirstRoute.current) {
      isFirstRoute.current = false;
      return;
    }
    window.scrollTo({ top: 0, behavior: 'auto' });
    mainRef.current?.focus({ preventScroll: true });
  }, [location.pathname]);

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>

      <AsciiCanvas />
      <TextureLayer />
      <CorruptionLayer />

      <SystemHeader onOpenConsole={openConsole} />

      <main id="main" className="route-viewport" ref={mainRef} tabIndex={-1}>
        <Outlet />
      </main>

      <SystemFooter />

      <CommandConsole open={consoleOpen} onClose={closeConsole} />
    </div>
  );
}
