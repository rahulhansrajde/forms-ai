import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArtifactPanel } from '../components/artifact/artifact-panel';
import { AmbientBackground } from '../components/brand/ambient-background';
import { ChatComposer, type ChatComposerHandle } from '../components/chat/chat-composer';
import { MessageList } from '../components/chat/message-list';
import { NewChatHero } from '../components/chat/new-chat-hero';
import { Button } from '../components/ui/button';
import { Icon } from '../components/ui/icon';
import { IconButton } from '../components/ui/icon-button';
import { EmptyState, InlineError, LoadingState } from '../components/ui/states';
import { useConversationMessages } from '../hooks/use-conversation-messages';
import { useDraftWorkspace } from '../hooks/use-draft-workspace';
import { useIsCompactLayout } from '../hooks/use-media-query';
import { WorkspaceLayout } from '../layouts/workspace-layout';
import { useConversationList } from '../state/conversation-list-context';
import { useServices } from '../state/services-context';
import { useToast } from '../state/toast-context';
import { errorMessage } from '../utils/error-messages';
import { googleReturnMessage } from '../utils/google-return';
import styles from './chat-workspace-page.module.css';

export function ChatWorkspacePage() {
  const { conversationId = null } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const services = useServices();
  const conversationList = useConversationList();
  const { notify } = useToast();
  const compact = useIsCompactLayout();
  const messages = useConversationMessages(conversationId);
  const workspace = useDraftWorkspace(messages.activeDraftId);
  const composerRef = useRef<ChatComposerHandle>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(() => searchParams.get('google') === 'connected');
  const [pending, setPending] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [trackedConversationId, setTrackedConversationId] = useState(conversationId);
  const googleReturn = searchParams.get('google');

  if (trackedConversationId !== conversationId) {
    setTrackedConversationId(conversationId);
    if (conversationId !== messages.conversationId) {
      setPreviewOpen(false);
      setSendError(null);
    }
  }

  useEffect(() => {
    if (!googleReturn) {
      return;
    }
    notify(googleReturnMessage(googleReturn));
    setSearchParams({}, { replace: true });
  }, [googleReturn, notify, setSearchParams]);

  const startNewChat = useCallback(() => {
    setSidebarOpen(false);
    setPreviewOpen(false);
    navigate('/chat');
    composerRef.current?.focus();
  }, [navigate]);

  const send = async (content: string) => {
    setPending(content);
    setSendError(null);
    try {
      let id = messages.conversationId;
      if (!id) {
        const created = await services.conversations.create();
        id = created.id;
        messages.adopt(id);
        conversationList.upsert(created);
        navigate(`/chat/${id}`);
      }
      const result = await services.conversations.send(id, content);
      messages.append([result.userMessage, result.assistantMessage]);
      conversationList.upsert(result.conversation);
      if (result.draft) {
        messages.setActiveDraftId(result.draft.id);
        workspace.receive(result.draft);
      }
    } catch (error) {
      setSendError(errorMessage(error));
      composerRef.current?.restore(content);
    } finally {
      setPending(null);
    }
  };

  const hasDraft = messages.activeDraftId !== null;
  const showHero = messages.conversationId === null && pending === null;
  const openPreview = hasDraft ? () => setPreviewOpen(true) : null;

  const headerActions = hasDraft ? (
    compact ? (
      <IconButton icon="preview" variant="outlined" label={previewOpen ? 'Hide preview' : 'Show preview'} aria-pressed={previewOpen} onClick={() => setPreviewOpen((open) => !open)} />
    ) : (
      <Button variant="secondary" size="sm" icon={<Icon name="preview" size={16} />} aria-pressed={previewOpen} onClick={() => setPreviewOpen((open) => !open)}>
        {previewOpen ? 'Hide preview' : 'Show preview'}
      </Button>
    )
  ) : null;

  return (
    <WorkspaceLayout
      sidebarOpen={sidebarOpen}
      onSidebarChange={setSidebarOpen}
      onNewChat={startNewChat}
      activeConversationId={messages.conversationId}
      headerActions={headerActions}
      artifactOpen={previewOpen && hasDraft}
      artifact={
        <ArtifactPanel
          open={previewOpen && hasDraft}
          modal={compact}
          conversationId={messages.conversationId}
          workspace={workspace}
          onClose={() => setPreviewOpen(false)}
        />
      }
    >
      {showHero ? (
        <div className={styles.heroStage}>
          <AmbientBackground />
          <div className={styles.heroContent}>
            <NewChatHero />
            {sendError ? <InlineError message={sendError} /> : null}
            <ChatComposer ref={composerRef} busy={pending !== null} onSubmit={(content) => void send(content)} />
          </div>
        </div>
      ) : (
        <div className={styles.conversation}>
          {messages.status === 'loading' ? <LoadingState label="Loading conversation…" /> : null}
          {messages.status === 'error' ? (
            <EmptyState
              title="This conversation could not be opened"
              description={messages.error ?? undefined}
              action={
                <div className={styles.errorActions}>
                  <Button variant="secondary" onClick={messages.retry}>
                    Try again
                  </Button>
                  <Button onClick={startNewChat}>New chat</Button>
                </div>
              }
            />
          ) : null}
          {messages.status === 'ready' || pending !== null ? (
            <MessageList
              messages={messages.messages}
              pendingContent={pending}
              hasOlder={messages.olderCursor !== null}
              loadingOlder={messages.loadingOlder}
              onLoadOlder={() => void messages.loadOlder()}
              onShowPreview={openPreview}
            />
          ) : null}
          <div className={styles.dock}>
            {sendError ? <InlineError message={sendError} /> : null}
            <ChatComposer ref={composerRef} busy={pending !== null || messages.status === 'loading'} onSubmit={(content) => void send(content)} placeholder="Ask for changes, suggestions or a new form…" />
          </div>
        </div>
      )}
    </WorkspaceLayout>
  );
}
