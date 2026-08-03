import { useEffect, useRef, useState } from 'react';
import { useChaos } from '@/systems/chaos/ChaosProvider';
import { createRng } from '@/utils/math';

const SUBSTITUTES = '▓▒░#%@*+=';

/**
 * Text that may be briefly corrupted by the `glyph-substitution` anomaly.
 *
 * The original string is always restored, and the accessible name never
 * changes — assistive technology reads the real text at all times.
 */
export function GlitchText({
  children,
  intensity = 0.18,
  as: Tag = 'span',
  className,
}: {
  children: string;
  intensity?: number;
  as?: 'span' | 'h1' | 'h2' | 'h3' | 'p';
  className?: string;
}): React.JSX.Element {
  const { activeEventIds, stabilised } = useChaos();
  const [display, setDisplay] = useState(children);
  const timerRef = useRef<number | null>(null);

  const isCorrupting =
    !stabilised && activeEventIds.includes('glyph-substitution');

  useEffect(() => {
    setDisplay(children);
  }, [children]);

  useEffect(() => {
    if (!isCorrupting) {
      setDisplay(children);
      return;
    }

    const rng = createRng(children.length * 7919 + performance.now());
    let frame = 0;

    const step = (): void => {
      frame += 1;
      if (frame > 6) {
        setDisplay(children);
        return;
      }
      const corrupted = children
        .split('')
        .map((character) => {
          if (character === ' ' || rng() > intensity) return character;
          return SUBSTITUTES[Math.floor(rng() * SUBSTITUTES.length)];
        })
        .join('');
      setDisplay(corrupted);
      timerRef.current = window.setTimeout(step, 90);
    };

    timerRef.current = window.setTimeout(step, 40);

    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      setDisplay(children);
    };
  }, [isCorrupting, children, intensity]);

  return (
    <Tag className={className} data-text={children}>
      {/* Real text for assistive tech; the visual layer may differ briefly. */}
      <span className="visually-hidden">{children}</span>
      <span aria-hidden="true">{display}</span>
    </Tag>
  );
}
