import { useEffect, useState } from 'react';
import { HERO_PHRASES, RandomPhrasePicker } from '../utils/random-phrase-picker';

export type HeroPhase = 'visible' | 'leaving' | 'entering';

const VISIBLE_MS = 3600;
const TRANSITION_MS = 360;
const SETTLE_MS = 30;

export interface HeroPhraseState {
  phrase: string;
  phase: HeroPhase;
}

export function useHeroPhrase(animate: boolean): HeroPhraseState {
  const [picker] = useState(() => new RandomPhrasePicker(HERO_PHRASES));
  const [state, setState] = useState<HeroPhraseState>(() => ({ phrase: picker.next(), phase: 'visible' }));

  useEffect(() => {
    if (!animate) {
      return;
    }
    const timers = new Set<number>();
    const schedule = (work: () => void, delay: number) => {
      const timer = window.setTimeout(() => {
        timers.delete(timer);
        work();
      }, delay);
      timers.add(timer);
    };
    const cycle = window.setInterval(() => {
      setState((current) => ({ ...current, phase: 'leaving' }));
      schedule(() => {
        setState({ phrase: picker.next(), phase: 'entering' });
        schedule(() => setState((current) => ({ ...current, phase: 'visible' })), SETTLE_MS);
      }, TRANSITION_MS);
    }, VISIBLE_MS + TRANSITION_MS);
    return () => {
      window.clearInterval(cycle);
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [animate, picker]);

  return state;
}
