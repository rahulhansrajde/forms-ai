import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export interface Preferences {
  sendWithEnter: boolean;
  reduceMotion: boolean;
}

interface PreferencesContextValue extends Preferences {
  update(changes: Partial<Preferences>): void;
}

const STORAGE_KEY = 'forms-ai.preferences';
const DEFAULT_PREFERENCES: Preferences = { sendWithEnter: true, reduceMotion: false };

function readStoredPreferences(): Preferences {
  try {
    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '{}') as Partial<Preferences>;
    return {
      sendWithEnter: typeof stored.sendWithEnter === 'boolean' ? stored.sendWithEnter : DEFAULT_PREFERENCES.sendWithEnter,
      reduceMotion: typeof stored.reduceMotion === 'boolean' ? stored.reduceMotion : DEFAULT_PREFERENCES.reduceMotion,
    };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

function storePreferences(preferences: Preferences): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
  } catch {
    return;
  }
}

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState<Preferences>(readStoredPreferences);

  useEffect(() => {
    document.documentElement.dataset.motion = preferences.reduceMotion ? 'reduced' : 'system';
    storePreferences(preferences);
  }, [preferences]);

  const update = useCallback((changes: Partial<Preferences>) => setPreferences((current) => ({ ...current, ...changes })), []);
  const value = useMemo(() => ({ ...preferences, update }), [preferences, update]);
  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferences(): PreferencesContextValue {
  const preferences = useContext(PreferencesContext);
  if (!preferences) {
    throw new Error('usePreferences must be used inside PreferencesProvider');
  }
  return preferences;
}
