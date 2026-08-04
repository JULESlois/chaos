import { ChaosExperience } from '@/experience/ChaosExperience';
import { FormLab } from '@/labs/FormLab';
import { RainLab } from '@/labs/RainLab';
import { TVRevealLab } from '@/labs/TVRevealLab';
import { VisualLab } from '@/visuals/ascii/flow/VisualLab';
import { AppProviders } from './providers';

/**
 * There is one page, so there is no router.
 *
 * The previous build routed between an archive, an operator page and a log —
 * all of that content now lives inside the television, and a URL that could
 * deep-link to it would give it away.
 *
 * The `?lab=` parameter is the single exception, and it is not a route: it
 * replaces the experience outright with a developer tool. Four exist, one per
 * thing that cannot be judged from the finished page —
 *
 *   rain        the medium, with every fault on a slider
 *   form        the masks, next to the channels the modulator reads
 *   tv-reveal   the camera coming out of the picture, scrubbable
 *   flow        the retired FLOW keyframe composition
 *
 * None of them are reachable from the site, none are linked, and the shipped
 * page never renders one.
 */
export function App(): React.JSX.Element {
  const lab =
    typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('lab') : null;

  if (lab === 'rain') return <RainLab />;
  if (lab === 'form') return <FormLab />;
  if (lab === 'tv-reveal') return <TVRevealLab />;
  if (lab === 'flow') return <VisualLab />;

  return (
    <AppProviders>
      <ChaosExperience />
    </AppProviders>
  );
}
