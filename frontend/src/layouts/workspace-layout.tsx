import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { UserMenu } from '../components/layout/user-menu';
import { HistorySidebar } from '../components/sidebar/history-sidebar';
import { IconButton } from '../components/ui/icon-button';
import { Logo } from '../components/ui/logo';
import { useIsCompactLayout } from '../hooks/use-media-query';
import styles from './workspace-layout.module.css';

interface WorkspaceLayoutProps {
  sidebarOpen: boolean;
  onSidebarChange(open: boolean): void;
  onNewChat(): void;
  activeConversationId: string | null;
  headerActions?: ReactNode;
  artifact?: ReactNode;
  artifactOpen?: boolean;
  children: ReactNode;
}

export function WorkspaceLayout({
  sidebarOpen,
  onSidebarChange,
  onNewChat,
  activeConversationId,
  headerActions,
  artifact,
  artifactOpen = false,
  children,
}: WorkspaceLayoutProps) {
  const compact = useIsCompactLayout();
  return (
    <div
      className={styles.shell}
      data-sidebar-docked={sidebarOpen && !compact ? 'true' : 'false'}
      data-artifact-docked={artifactOpen && !compact ? 'true' : 'false'}
    >
      <a href="#workspace-main" className="skip-link">
        Skip to main content
      </a>
      <HistorySidebar
        open={sidebarOpen}
        modal={compact}
        activeConversationId={activeConversationId}
        onClose={() => onSidebarChange(false)}
        onNewChat={onNewChat}
        onNavigate={() => compact && onSidebarChange(false)}
      />
      <div className={styles.column}>
        <header className={styles.header}>
          <div className={styles.headerStart}>
            <span className={sidebarOpen ? styles.toggleHidden : styles.toggle}>
              <IconButton
                icon="sidebar"
                variant="round"
                iconSize={18}
                label="Open sidebar"
                aria-expanded={sidebarOpen}
                tabIndex={sidebarOpen ? -1 : 0}
                onClick={() => onSidebarChange(true)}
              />
            </span>
            <Link to="/chat" className={styles.brand} onClick={onNewChat}>
              <Logo size={28} withWordmark />
            </Link>
          </div>
          <div className={styles.headerEnd}>
            {headerActions}
            <UserMenu />
          </div>
        </header>
        <main id="workspace-main" className={styles.main} tabIndex={-1}>
          {children}
        </main>
      </div>
      {artifact}
    </div>
  );
}
