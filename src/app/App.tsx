import { ChaosExperience } from '@/experience/ChaosExperience';
import { VisualLab } from '@/visuals/ascii/flow/VisualLab';
import { AppProviders } from './providers';

/**
 * There is one page, so there is no router.
 *
 * The previous build routed between an archive, an operator page and a log —
 * all of that content now lives inside the television, and a URL that could
 * deep-link to it would give it away.
 *
 * `?lab=flow` swaps the whole experience for the developer-only Visual Lab. It
 * is the only place debug UI exists; the shipped page never renders it.
 */
export function App(): React.JSX.Element {
  const lab = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('lab') : null;
  if (lab === 'flow') {
    return <VisualLab />;
  }

  return (
    <AppProviders>
      <ChaosExperience />
    </AppProviders>
  );
}
