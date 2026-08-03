import type { ReactNode } from 'react';
import { ChaosProvider } from '@/systems/chaos/ChaosProvider';
import { AudioProvider } from '@/systems/audio/AudioProvider';
import { SystemProvider } from '@/systems/telemetry/SystemProvider';

/**
 * Provider stack.
 * SystemProvider must wrap ChaosProvider — chaos reads device capabilities.
 * Both must sit inside the router, since ChaosProvider observes the location.
 */
export function AppProviders({ children }: { children: ReactNode }): React.JSX.Element {
  return (
    <SystemProvider>
      <ChaosProvider>
        <AudioProvider>{children}</AudioProvider>
      </ChaosProvider>
    </SystemProvider>
  );
}
