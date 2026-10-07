import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { usePrefersDarkScheme, useReducedMotion } from '../hooks/use-media-query';

export type Theme = 'light' | 'dark';

interface ThemeContextValue {
  theme: Theme;
  toggle(): void;
}

const STORAGE_KEY = 'forms-ai.theme';
const TRANSITION_MS = 320;
const BROWSER_THEME_COLORS: Readonly<Record<Theme, string>> = { light: '#f7f5f1', dark: '#16151d' };

function readStoredTheme(): Theme | null {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored === 'light' || stored === 'dark' ? stored : null;
  } catch {
    return null;
  }
}

function storeTheme(theme: Theme): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    return;
  }
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const prefersDark = usePrefersDarkScheme();
  const reducedMotion = useReducedMotion();
  const [chosen, setChosen] = useState<Theme | null>(readStoredTheme);
  const transitionTimer = useRef<number | null>(null);
  const theme: Theme = chosen ?? (prefersDark ? 'dark' : 'light');

  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', BROWSER_THEME_COLORS[theme]);
  }, [theme]);

  useEffect(
    () => () => {
      if (transitionTimer.current !== null) {
        window.clearTimeout(transitionTimer.current);
      }
      delete document.documentElement.dataset.themeTransition;
    },
    [],
  );

  const toggle = useCallback(() => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    if (!reducedMotion) {
      document.documentElement.dataset.themeTransition = 'active';
      if (transitionTimer.current !== null) {
        window.clearTimeout(transitionTimer.current);
      }
      transitionTimer.current = window.setTimeout(() => {
        delete document.documentElement.dataset.themeTransition;
        transitionTimer.current = null;
      }, TRANSITION_MS);
    }
    storeTheme(next);
    setChosen(next);
  }, [reducedMotion, theme]);

  const value = useMemo(() => ({ theme, toggle }), [theme, toggle]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const theme = useContext(ThemeContext);
  if (!theme) {
    throw new Error('useTheme must be used inside ThemeProvider');
  }
  return theme;
}
