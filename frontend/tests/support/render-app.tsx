import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppRoutes } from '../../src/app/app';
import type { FormsAIServices } from '../../src/services/forms-ai-services';
import { ConversationListProvider } from '../../src/state/conversation-list-context';
import { PreferencesProvider } from '../../src/state/preferences-context';
import { ServicesProvider } from '../../src/state/services-context';
import { SessionProvider } from '../../src/state/session-context';
import { ThemeProvider } from '../../src/state/theme-context';
import { ToastProvider } from '../../src/state/toast-context';

export function renderApp(services: FormsAIServices, path: string) {
  return render(
    <ServicesProvider services={services}>
      <PreferencesProvider>
        <ThemeProvider>
          <ToastProvider>
            <SessionProvider>
              <ConversationListProvider>
                <MemoryRouter initialEntries={[path]}>
                  <AppRoutes />
                </MemoryRouter>
              </ConversationListProvider>
            </SessionProvider>
          </ToastProvider>
        </ThemeProvider>
      </PreferencesProvider>
    </ServicesProvider>,
  );
}
