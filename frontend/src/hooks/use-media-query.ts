import { useSyncExternalStore } from 'react';
import { usePreferences } from '../state/preferences-context';

function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

export function useIsCompactLayout(): boolean {
  return useMediaQuery('(max-width: 1023px)');
}

export function useReducedMotion(): boolean {
  const { reduceMotion } = usePreferences();
  const systemPrefersReduced = useMediaQuery('(prefers-reduced-motion: reduce)');
  return reduceMotion || systemPrefersReduced;
}
