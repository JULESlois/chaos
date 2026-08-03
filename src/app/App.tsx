import { ChaosExperience } from '@/experience/ChaosExperience';
import { AppProviders } from './providers';

/**
 * There is one page, so there is no router.
 *
 * The previous build routed between an archive, an operator page and a log —
 * all of that content now lives inside the television, and a URL that could
 * deep-link to it would give it away.
 */
export function App(): React.JSX.Element {
  return (
    <AppProviders>
      <ChaosExperience />
    </AppProviders>
  );
}
