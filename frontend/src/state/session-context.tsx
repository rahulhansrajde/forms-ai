import type { LogInRequest, SignUpRequest, UserView } from '@forms-ai/contracts';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useServices } from './services-context';

export type SessionStatus = 'loading' | 'authenticated' | 'anonymous';

interface SessionState {
  status: SessionStatus;
  user: UserView | null;
  expired: boolean;
}

export interface SessionContextValue extends SessionState {
  logIn(request: LogInRequest): Promise<void>;
  signUp(request: SignUpRequest): Promise<void>;
  logOut(): Promise<void>;
  replaceUser(user: UserView): void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const { auth, api } = useServices();
  const [state, setState] = useState<SessionState>({ status: 'loading', user: null, expired: false });

  useEffect(() => {
    let active = true;
    auth
      .currentUser()
      .then((user) => active && setState({ status: 'authenticated', user, expired: false }))
      .catch(() => active && setState({ status: 'anonymous', user: null, expired: false }));
    return () => {
      active = false;
    };
  }, [auth]);

  useEffect(
    () =>
      api.onSessionExpired(() =>
        setState((current) => (current.status === 'authenticated' ? { status: 'anonymous', user: null, expired: true } : current)),
      ),
    [api],
  );

  const logIn = useCallback(
    async (request: LogInRequest) => setState({ status: 'authenticated', user: await auth.logIn(request), expired: false }),
    [auth],
  );

  const signUp = useCallback(
    async (request: SignUpRequest) => setState({ status: 'authenticated', user: await auth.signUp(request), expired: false }),
    [auth],
  );

  const logOut = useCallback(async () => {
    await auth.logOut();
    setState({ status: 'anonymous', user: null, expired: false });
  }, [auth]);

  const replaceUser = useCallback((user: UserView) => setState((current) => ({ ...current, user })), []);

  const value = useMemo(() => ({ ...state, logIn, signUp, logOut, replaceUser }), [state, logIn, signUp, logOut, replaceUser]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const session = useContext(SessionContext);
  if (!session) {
    throw new Error('useSession must be used inside SessionProvider');
  }
  return session;
}
