import { createContext, useContext, type ReactNode } from 'react';
import type { FormsAIServices } from '../services/forms-ai-services';

const ServicesContext = createContext<FormsAIServices | null>(null);

export function ServicesProvider({ services, children }: { services: FormsAIServices; children: ReactNode }) {
  return <ServicesContext.Provider value={services}>{children}</ServicesContext.Provider>;
}

export function useServices(): FormsAIServices {
  const services = useContext(ServicesContext);
  if (!services) {
    throw new Error('useServices must be used inside ServicesProvider');
  }
  return services;
}
