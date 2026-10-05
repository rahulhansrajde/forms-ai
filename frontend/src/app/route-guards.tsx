import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { LoadingState } from '../components/ui/states';
import { useSession } from '../state/session-context';

export function RequireAuthentication({ children }: { children: ReactNode }) {
  const { status } = useSession();
  const location = useLocation();
  if (status === 'loading') {
    return <LoadingState label="Loading Forms AI…" fullscreen />;
  }
  if (status === 'anonymous') {
    return <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}` }} />;
  }
  return children;
}

export function RedirectAuthenticated({ children }: { children: ReactNode }) {
  const { status } = useSession();
  if (status === 'loading') {
    return <LoadingState label="Loading Forms AI…" fullscreen />;
  }
  if (status === 'authenticated') {
    return <Navigate to="/chat" replace />;
  }
  return children;
}
