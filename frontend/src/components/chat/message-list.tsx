import type { MessageView } from '@forms-ai/contracts';
import { useEffect, useLayoutEffect, useRef } from 'react';
import { offersPreview } from '../../utils/intent-presentation';
import { Button } from '../ui/button';
import { Icon } from '../ui/icon';
import { Logo } from '../ui/logo';
import { Spinner } from '../ui/spinner';
import { GoogleFormCreatedMessage } from './google-form-created-message';
import styles from './message-list.module.css';

interface MessageListProps {
  messages: readonly MessageView[];
  pendingContent: string | null;
  hasOlder: boolean;
  loadingOlder: boolean;
  onLoadOlder(): void;
  onShowPreview: (() => void) | null;
}

export function MessageList({ messages, pendingContent, hasOlder, loadingOlder, onLoadOlder, onShowPreview }: MessageListProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const previousFirstId = useRef<string | null>(null);
  const previousHeight = useRef(0);
  const lastMessageId = messages[messages.length - 1]?.id ?? null;
  const firstMessageId = messages[0]?.id ?? null;

  useLayoutEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) {
      return;
    }
    if (previousFirstId.current !== null && firstMessageId !== previousFirstId.current && previousHeight.current > 0) {
      scroller.scrollTop += scroller.scrollHeight - previousHeight.current;
    }
    previousFirstId.current = firstMessageId;
    previousHeight.current = scroller.scrollHeight;
  }, [firstMessageId]);

  useLayoutEffect(() => {
    const scroller = scrollerRef.current;
    if (scroller) {
      scroller.scrollTop = scroller.scrollHeight;
      previousHeight.current = scroller.scrollHeight;
    }
  }, [lastMessageId, pendingContent]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    const scroller = scrollerRef.current;
    if (!sentinel || !scroller || !hasOlder) {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting) && !loadingOlder) {
          previousHeight.current = scroller.scrollHeight;
          onLoadOlder();
        }
      },
      { root: scroller, rootMargin: '200px 0px 0px 0px' },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasOlder, loadingOlder, onLoadOlder]);

  return (
    <div ref={scrollerRef} className={styles.scroller} tabIndex={-1}>
      <div className={styles.column} role="log" aria-label="Conversation" aria-live="polite" aria-relevant="additions">
        {hasOlder ? (
          <div ref={sentinelRef} className={styles.older}>
            {loadingOlder ? <Spinner size={16} /> : <span className="visually-hidden">Scroll up to load older messages</span>}
          </div>
        ) : null}
        {messages.map((message) => (
          <MessageItem key={message.id} message={message} onShowPreview={onShowPreview} />
        ))}
        {pendingContent !== null ? (
          <>
            <div className={styles.user}>
              <p className={styles.userBubble}>{pendingContent}</p>
            </div>
            <div className={styles.assistant} aria-label="Forms AI is thinking">
              <span className={styles.avatar}>
                <Logo size={28} decorative />
              </span>
              <span className={styles.thinking}>
                <span>Thinking</span>
                <span className={styles.dots} aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </span>
              </span>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

function MessageItem({ message, onShowPreview }: { message: MessageView; onShowPreview: (() => void) | null }) {
  if (message.role === 'USER') {
    return (
      <div className={styles.user}>
        <p className={styles.userBubble}>{message.content}</p>
      </div>
    );
  }
  return (
    <div className={styles.assistant}>
      <span className={styles.avatar}>
        <Logo size={28} decorative />
      </span>
      <div className={styles.assistantBody}>
        <span className="visually-hidden">Forms AI said:</span>
        {message.publishedForm ? (
          <GoogleFormCreatedMessage content={message.content} form={message.publishedForm} />
        ) : (
          <p className={styles.assistantText}>{message.content}</p>
        )}
        {onShowPreview && offersPreview(message.intent) ? (
          <Button variant="secondary" size="sm" icon={<Icon name="preview" size={16} />} onClick={onShowPreview}>
            Show preview
          </Button>
        ) : null}
      </div>
    </div>
  );
}
