import { Component, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AmbientBackground } from '../components/brand/ambient-background';
import { buttonClassName } from '../components/ui/button';
import { Logo } from '../components/ui/logo';
import styles from './system-pages.module.css';

interface SystemScreenProps {
  code: string;
  title: string;
  description: string;
  action: ReactNode;
}

function SystemScreen({ code, title, description, action }: SystemScreenProps) {
  return (
    <div className={styles.screen}>
      <AmbientBackground />
      <main className={styles.card}>
        <Logo size={48} decorative />
        <p className={styles.code}>{code}</p>
        <h1 className={styles.title}>{title}</h1>
        <p className={styles.description}>{description}</p>
        {action}
      </main>
    </div>
  );
}

export function NotFoundPage() {
  return (
    <SystemScreen
      code="404"
      title="Page not found"
      description="The page you are looking for does not exist or was moved."
      action={
        <Link to="/chat" className={buttonClassName({ block: true })}>
          Back to Forms AI
        </Link>
      }
    />
  );
}

function ServerErrorPage() {
  return (
    <SystemScreen
      code="500"
      title="Something went wrong"
      description="Forms AI ran into an unexpected problem. Your drafts are safe."
      action={
        <a href="/chat" className={buttonClassName({ block: true })}>
          Reload Forms AI
        </a>
      }
    />
  );
}

interface ErrorBoundaryState {
  failed: boolean;
}

export class ApplicationErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { failed: true };
  }

  override render(): ReactNode {
    return this.state.failed ? <ServerErrorPage /> : this.props.children;
  }
}
