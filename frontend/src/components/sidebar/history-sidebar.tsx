import { useEffect, useMemo, useRef } from 'react';
import { NavLink } from 'react-router-dom';
import { useConversationList } from '../../state/conversation-list-context';
import { formatConversationTime, groupConversations } from '../../utils/conversation-groups';
import { Button } from '../ui/button';
import { Drawer } from '../ui/drawer';
import { Icon } from '../ui/icon';
import { IconButton } from '../ui/icon-button';
import { Logo } from '../ui/logo';
import { Spinner } from '../ui/spinner';
import { InlineError } from '../ui/states';
import { DeletionCountdown } from './deletion-countdown';
import styles from './history-sidebar.module.css';

interface HistorySidebarProps {
  open: boolean;
  modal: boolean;
  activeConversationId: string | null;
  onClose(): void;
  onNewChat(): void;
  onNavigate(): void;
}

export function HistorySidebar({ open, modal, activeConversationId, onClose, onNewChat, onNavigate }: HistorySidebarProps) {
  const { conversations, status, hasMore, deletions, ensureLoaded, loadMore } = useConversationList();
  const sentinelRef = useRef<HTMLLIElement>(null);
  const restoredFocusId = useRef<string | null>(null);
  const groups = useMemo(() => groupConversations(conversations, new Date()), [conversations]);

  useEffect(() => {
    if (restoredFocusId.current) {
      document.getElementById(`delete-chat-${restoredFocusId.current}`)?.focus();
      restoredFocusId.current = null;
    }
  });

  useEffect(() => {
    if (open) {
      ensureLoaded();
    }
  }, [ensureLoaded, open]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!open || !sentinel || !hasMore) {
      return;
    }
    const observer = new IntersectionObserver((entries) => entries.some((entry) => entry.isIntersecting) && loadMore());
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loadMore, open]);

  return (
    <Drawer open={open} side="left" modal={modal} label="Chat history" onClose={onClose} className={styles.sidebar}>
      <div className={styles.header}>
        <Logo size={30} withWordmark />
        <IconButton icon="sidebar" label="Close sidebar" onClick={onClose} />
      </div>
      <div className={styles.newChat}>
        <Button block icon={<Icon name="plus" size={18} />} onClick={onNewChat}>
          New chat
        </Button>
      </div>
      <nav className={styles.history} aria-label="Previous conversations">
        {status === 'error' ? <InlineError message="Chat history could not be loaded." /> : null}
        {status === 'ready' && conversations.length === 0 ? <p className={styles.empty}>Your conversations will appear here.</p> : null}
        {groups.map((group) => (
          <section key={group.label} className={styles.group} aria-label={group.label}>
            <h2 className={styles.groupLabel}>{group.label}</h2>
            <ul className={styles.list}>
              {group.conversations.map((conversation) => {
                const deletion = deletions.pending.get(conversation.id);
                return (
                  <li key={conversation.id} className={styles.entry}>
                    {deletion ? (
                      <DeletionCountdown
                        title={conversation.title}
                        deletion={deletion}
                        onUndo={() => {
                          restoredFocusId.current = conversation.id;
                          deletions.undo(conversation.id);
                        }}
                      />
                    ) : (
                      <>
                        <NavLink
                          to={`/chat/${conversation.id}`}
                          className={styles.item}
                          aria-current={conversation.id === activeConversationId ? 'page' : undefined}
                          onClick={onNavigate}
                        >
                          <span className={styles.itemTitle}>{conversation.title}</span>
                          <span className={styles.itemTime}>{formatConversationTime(conversation.updatedAt, new Date())}</span>
                        </NavLink>
                        <button
                          id={`delete-chat-${conversation.id}`}
                          type="button"
                          className={styles.delete}
                          aria-label={`Delete chat “${conversation.title}”`}
                          title="Delete chat"
                          onClick={() => deletions.schedule(conversation.id)}
                        >
                          <Icon name="trash" size={16} />
                        </button>
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
        <ul className={styles.list}>
          {hasMore ? <li ref={sentinelRef} className={styles.loadMore} aria-hidden="true" /> : null}
        </ul>
        {status === 'loading' ? (
          <div className={styles.loading} role="status">
            <Spinner size={16} />
            <span>Loading chats…</span>
          </div>
        ) : null}
      </nav>
    </Drawer>
  );
}
