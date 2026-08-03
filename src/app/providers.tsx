import type { ReactNode } from 'react';
import { AudioProvider } from '@/systems/audio/AudioProvider';
import { SystemProvider } from '@/systems/telemetry/SystemProvider';

/**
 * Provider stack.
 *
 * Only two remain. SystemProvider detects the device and holds the narrative
 * unlock flags; AudioProvider owns the AudioContext, which is not created
 * until the reader's first gesture.
 */
export function AppProviders({ children }: { children: ReactNode }): React.JSX.Element {
  return (
    <SystemProvider>
      <AudioProvider>{children}</AudioProvider>
    </SystemProvider>
  );
}
