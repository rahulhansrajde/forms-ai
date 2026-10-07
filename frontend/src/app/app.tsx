import type { ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ChatWorkspacePage } from '../pages/chat-workspace-page';
import { LoginPage } from '../pages/login-page';
import { SettingsPage } from '../pages/settings-page';
import { SignupPage } from '../pages/signup-page';
import { ApplicationErrorBoundary, NotFoundPage } from '../pages/system-pages';
import type { FormsAIServices } from '../services/forms-ai-services';
import { ConversationListProvider } from '../state/conversation-list-context';
import { PreferencesProvider } from '../state/preferences-context';
import { ServicesProvider } from '../state/services-context';
import { SessionProvider, useSession } from '../state/session-context';
import { ThemeProvider } from '../state/theme-context';
import { ToastProvider } from '../state/toast-context';
import { RedirectAuthenticated, RequireAuthentication } from './route-guards';

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/chat" replace />} />
      <Route
        path="/login"
        element={
          <RedirectAuthenticated>
            <LoginPage />
          </RedirectAuthenticated>
        }
      />
      <Route
        path="/signup"
        element={
          <RedirectAuthenticated>
            <SignupPage />
          </RedirectAuthenticated>
        }
      />
      <Route
        path="/chat/:conversationId?"
        element={
          <RequireAuthentication>
            <ChatWorkspacePage />
          </RequireAuthentication>
        }
      />
      <Route
        path="/settings"
        element={
          <RequireAuthentication>
            <SettingsPage />
          </RequireAuthentication>
        }
      />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}

function UserScopedProviders({ children }: { children: ReactNode }) {
  const { user } = useSession();
  return <ConversationListProvider key={user?.id ?? 'anonymous'}>{children}</ConversationListProvider>;
}

export function App({ services }: { services: FormsAIServices }) {
  return (
    <ApplicationErrorBoundary>
      <ServicesProvider services={services}>
        <PreferencesProvider>
          <ThemeProvider>
            <ToastProvider>
              <SessionProvider>
                <UserScopedProviders>
                  <BrowserRouter>
                    <AppRoutes />
                  </BrowserRouter>
                </UserScopedProviders>
              </SessionProvider>
            </ToastProvider>
          </ThemeProvider>
        </PreferencesProvider>
      </ServicesProvider>
    </ApplicationErrorBoundary>
  );
}
