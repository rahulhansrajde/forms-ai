import { MESSAGE_MAX_LENGTH } from '@forms-ai/contracts';
import { forwardRef, useImperativeHandle, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { usePreferences } from '../../state/preferences-context';
import { IconButton } from '../ui/icon-button';
import styles from './chat-composer.module.css';

const MAX_HEIGHT_PX = 220;

interface ChatComposerProps {
  busy: boolean;
  onSubmit(content: string): void;
  placeholder?: string;
}

export interface ChatComposerHandle {
  focus(): void;
  restore(content: string): void;
}

export const ChatComposer = forwardRef<ChatComposerHandle, ChatComposerProps>(function ChatComposer(
  { busy, onSubmit, placeholder = 'Describe the form you need…' },
  ref,
) {
  const { sendWithEnter } = usePreferences();
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const canSend = value.trim().length > 0 && !busy;

  useImperativeHandle(
    ref,
    () => ({
      focus: () => textareaRef.current?.focus(),
      restore: (content: string) => setValue((current) => (current.length > 0 ? current : content)),
    }),
    [],
  );

  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, MAX_HEIGHT_PX)}px`;
  }, [value]);

  const submit = () => {
    if (!canSend) {
      return;
    }
    onSubmit(value.trim());
    setValue('');
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter' || event.nativeEvent.isComposing) {
      return;
    }
    const wantsSend = sendWithEnter ? !event.shiftKey : event.metaKey || event.ctrlKey;
    if (wantsSend) {
      event.preventDefault();
      submit();
    }
  };

  return (
    <form
      className={styles.composer}
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <label htmlFor="chat-message" className="visually-hidden">
        Message Forms AI
      </label>
      <textarea
        id="chat-message"
        ref={textareaRef}
        className={styles.input}
        rows={1}
        value={value}
        maxLength={MESSAGE_MAX_LENGTH}
        placeholder={placeholder}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={handleKeyDown}
        aria-describedby="chat-message-hint"
      />
      <span id="chat-message-hint" className="visually-hidden">
        {sendWithEnter ? 'Press Enter to send and Shift+Enter for a new line.' : 'Press Control+Enter to send.'}
      </span>
      <IconButton type="submit" icon="send" label={busy ? 'Waiting for a reply' : 'Send message'} variant="solid" disabled={!canSend} tooltip={false} />
    </form>
  );
});
