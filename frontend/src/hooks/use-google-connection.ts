import type { GoogleConnectionView } from '@forms-ai/contracts';
import { useCallback, useEffect, useState } from 'react';
import { useServices } from '../state/services-context';

export type ConnectionStatus = 'loading' | 'ready' | 'error';

export interface GoogleConnection {
  connection: GoogleConnectionView | null;
  status: ConnectionStatus;
  refresh(): Promise<void>;
  disconnect(): Promise<void>;
  markDisconnected(): void;
  authorizationPath(returnTo: string): string;
}

export function useGoogleConnection(): GoogleConnection {
  const { google } = useServices();
  const [connection, setConnection] = useState<GoogleConnectionView | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>('loading');

  const refresh = useCallback(async () => {
    try {
      setConnection(await google.status());
      setStatus('ready');
    } catch {
      setStatus('error');
    }
  }, [google]);

  useEffect(() => {
    let active = true;
    google
      .status()
      .then((view) => {
        if (active) {
          setConnection(view);
          setStatus('ready');
        }
      })
      .catch(() => active && setStatus('error'));
    return () => {
      active = false;
    };
  }, [google]);

  const disconnect = useCallback(async () => {
    await google.disconnect();
    setConnection({ connected: false, email: null, connectedAt: null });
  }, [google]);

  const markDisconnected = useCallback(() => setConnection({ connected: false, email: null, connectedAt: null }), []);

  const authorizationPath = useCallback((returnTo: string) => google.authorizationPath(returnTo), [google]);

  return { connection, status, refresh, disconnect, markDisconnected, authorizationPath };
}
