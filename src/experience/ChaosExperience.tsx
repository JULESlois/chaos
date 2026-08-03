import { useEffect, useMemo } from 'react';
import { TelevisionEpilogue } from '@/features/tv/TelevisionEpilogue';
import { useSystem } from '@/systems/telemetry/SystemProvider';
import { TensionController } from '@/systems/tension/tension';
import { AsciiStage } from '@/visuals/ascii/AsciiStage';
import type { QualityTier } from '@/visuals/ascii/types';
import { ExperienceStore } from './experience-store';
import { ExperienceTimeline } from './ExperienceTimeline';
import { TOTAL_HEIGHT_VH } from './phases';
import { useExperienceProgress } from './useExperienceProgress';

/**
 * The whole site.
 *
 * Three things exist on this page and nothing else: a fixed canvas that draws
 * every screen, a stack of empty sections that give the document its height,
 * and a television at the end. There is no header, no navigation, no footer,
 * no route other than this one.
 *
 * The two runtime objects — the scroll store and the tension controller — are
 * created here and handed down. They live outside React entirely; the ASCII
 * engine advances them once per frame and the television reads them on
 * demand, so scrolling the full eight hundred viewport heights causes no
 * component to render more than a handful of times.
 */
export function ChaosExperience(): React.JSX.Element {
  const { capabilities, unlock } = useSystem();

  const store = useMemo(() => new ExperienceStore(), []);
  const tension = useMemo(() => new TensionController(), []);

  useEffect(() => {
    return () => store.dispose();
  }, [store]);

  useExperienceProgress(store);

  // The ASCII tier is not the render level: a device with no WebGL can still
  // paint a full character field, and a phone with WebGL usually should not.
  const quality: QualityTier = capabilities.isNarrowViewport || capabilities.tier === 'low'
    ? 2
    : capabilities.tier === 'medium' || capabilities.prefersReducedMotion
      ? 1
      : 0;

  return (
    <>
      <AsciiStage
        store={store}
        tension={tension}
        quality={quality}
        maxDpr={capabilities.maxDpr}
        reducedMotion={capabilities.prefersReducedMotion}
      />

      {/*
        The scroll track. Its total height is the piece's only clock, so it is
        declared from the phase table rather than from CSS — a stylesheet and
        a timeline that disagree about the length of the work is a bug that
        only shows up as "the ending arrives too early".
      */}
      <main className="experience" style={{ height: `${TOTAL_HEIGHT_VH}vh` }}>
        <ExperienceTimeline />
      </main>

      <TelevisionEpilogue
        store={store}
        tension={tension}
        capabilities={capabilities}
        onUnlisted={() => unlock('unlisted')}
      />
    </>
  );
}
