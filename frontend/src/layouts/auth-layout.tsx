import type { ReactNode } from 'react';
import { AmbientBackground } from '../components/brand/ambient-background';
import { Logo } from '../components/ui/logo';
import { ThemeToggle } from '../components/ui/theme-toggle';
import styles from './auth-layout.module.css';

export function AuthLayout({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className={styles.screen}>
      <AmbientBackground />
      <div className={styles.themeControl}>
        <ThemeToggle />
      </div>
      <main className={styles.card}>
        <div className={styles.brand}>
          <Logo size={56} decorative />
          <span className={styles.wordmark}>Forms AI</span>
        </div>
        <h1 className="visually-hidden">{title}</h1>
        {children}
      </main>
    </div>
  );
}
