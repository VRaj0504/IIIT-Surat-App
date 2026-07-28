import { useEffect, useRef, useState } from 'react';

// Animates a number counting up from 0 to `target` over `duration` ms.
// Deliberately plain React state + requestAnimationFrame rather than
// Reanimated, since animating numeric text content doesn't benefit from the
// native thread the way transform/opacity animations do — this is simpler
// and has no worklet/versioning concerns.
export function useCountUp(target: number, duration = 700): number {
  const [value, setValue] = useState(0);
  const startRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    startRef.current = null;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);

    const tick = (now: number) => {
      if (startRef.current === null) startRef.current = now;
      const elapsed = now - startRef.current;
      const progress = Math.min(elapsed / duration, 1);
      // easeOutCubic — fast start, gentle settle, feels less mechanical
      // than a linear count.
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(eased * target));
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick);
      }
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [target, duration]);

  return value;
}
