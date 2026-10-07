import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { ApiError } from '../src/services/api-client';
import { createFakeServices, draftView, message } from './support/fake-services';
import { renderApp } from './support/render-app';

async function sendFirstMessage(user: ReturnType<typeof userEvent.setup>, text = 'Create a hackathon form') {
  const composer = await screen.findByLabelText('Message Forms AI');
  await user.type(composer, text);
  await user.keyboard('{Enter}');
}

describe('chat workspace', () => {
  it('starts with a closed sidebar, a hero phrase and no preview panel', async () => {
    const { services, spies } = createFakeServices();
    renderApp(services, '/chat');
    expect(await screen.findByRole('heading', { name: 'Start a new chat' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open sidebar' })).toBeInTheDocument();
    expect(screen.queryByRole('complementary', { name: 'Chat history' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /show preview/i })).not.toBeInTheDocument();
    expect(spies.listConversations).not.toHaveBeenCalled();
    expect(spies.createConversation).not.toHaveBeenCalled();
  });

  it('opens the sidebar and only then loads conversation metadata', async () => {
    const { services, spies } = createFakeServices();
    spies.listConversations.mockResolvedValue({
      items: [{ id: 'conversation-9', title: 'Feedback form', updatedAt: new Date().toISOString() }],
      nextCursor: null,
    });
    renderApp(services, '/chat');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Open sidebar' }));
    const sidebar = await screen.findByRole('complementary', { name: 'Chat history' });
    expect(await within(sidebar).findByRole('link', { name: /Feedback form/ })).toHaveAttribute('href', '/chat/conversation-9');
    expect(within(sidebar).getByText('Today')).toBeInTheDocument();
    expect(spies.listConversations).toHaveBeenCalledTimes(1);
    expect(spies.messages).not.toHaveBeenCalled();
  });

  it('creates the conversation on the first message and offers the draft preview', async () => {
    const { services, spies } = createFakeServices();
    renderApp(services, '/chat');
    const user = userEvent.setup();
    await sendFirstMessage(user);
    expect(spies.createConversation).toHaveBeenCalledTimes(1);
    expect(spies.send).toHaveBeenCalledWith('conversation-1', 'Create a hackathon form');
    expect(await screen.findByText('I created a draft.')).toBeInTheDocument();
    expect(spies.messages).not.toHaveBeenCalled();
    expect(spies.publish).not.toHaveBeenCalled();
    const previewButtons = screen.getAllByRole('button', { name: /show preview/i });
    expect(previewButtons.length).toBeGreaterThan(0);
    expect(screen.queryByRole('dialog', { name: 'Form draft preview' })).not.toBeInTheDocument();
  });

  it('uses Shift+Enter for a new line and Enter to send', async () => {
    const { services, spies } = createFakeServices();
    renderApp(services, '/chat');
    const user = userEvent.setup();
    const composer = await screen.findByLabelText('Message Forms AI');
    await user.type(composer, 'Line one{Shift>}{Enter}{/Shift}Line two');
    expect(composer).toHaveValue('Line one\nLine two');
    expect(spies.send).not.toHaveBeenCalled();
    await user.keyboard('{Enter}');
    await waitFor(() => expect(spies.send).toHaveBeenCalledWith('conversation-1', 'Line one\nLine two'));
  });

  it('opens the editable preview, edits create versions, and closing keeps the draft', async () => {
    const { services, spies } = createFakeServices();
    spies.applyOperations.mockResolvedValue(
      draftView({ currentVersion: { ...draftView().currentVersion, id: 'version-2', versionNumber: 2, source: 'MANUAL' } }),
    );
    renderApp(services, '/chat');
    const user = userEvent.setup();
    await sendFirstMessage(user);
    await user.click((await screen.findAllByRole('button', { name: /show preview/i }))[0]!);
    const panel = await screen.findByRole('complementary', { name: 'Form draft preview' });
    const title = within(panel).getByLabelText('Form title');
    expect(title).toHaveValue('College Hackathon Registration');
    expect(spies.getDraft).not.toHaveBeenCalled();

    await user.clear(title);
    await user.type(title, 'Hack Night{Enter}');
    await waitFor(() =>
      expect(spies.applyOperations).toHaveBeenCalledWith('draft-1', 'version-1', [{ type: 'UPDATE_TITLE', title: 'Hack Night' }]),
    );
    expect(await within(panel).findByRole('button', { name: /Version 2 of 2/ })).toBeInTheDocument();

    await user.click(within(panel).getAllByRole('switch', { name: 'Required' })[1]!);
    await waitFor(() =>
      expect(spies.applyOperations).toHaveBeenLastCalledWith('draft-1', 'version-2', [
        { type: 'UPDATE_QUESTION', questionId: 'question_2', changes: { required: true } },
      ]),
    );

    await user.click(within(panel).getByRole('button', { name: 'Close preview' }));
    expect(screen.queryByRole('complementary', { name: 'Form draft preview' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Message Forms AI')).toBeEnabled();
    await user.click(screen.getAllByRole('button', { name: /show preview/i })[0]!);
    expect(await screen.findByRole('complementary', { name: 'Form draft preview' })).toBeInTheDocument();
  });

  it('asks to connect Google Forms instead of publishing when not connected', async () => {
    const { services, spies } = createFakeServices();
    renderApp(services, '/chat');
    const user = userEvent.setup();
    await sendFirstMessage(user);
    await user.click((await screen.findAllByRole('button', { name: /show preview/i }))[0]!);
    const panel = await screen.findByRole('complementary', { name: 'Form draft preview' });
    await waitFor(() => expect(spies.googleStatus).toHaveBeenCalled());
    await user.click(within(panel).getByRole('button', { name: 'Create GForm' }));
    const connect = await within(panel).findByRole('link', { name: 'Connect Google Forms' });
    expect(connect).toHaveAttribute('href', '/auth/google?returnTo=%2Fchat%2Fconversation-1');
    expect(spies.publish).not.toHaveBeenCalled();
  });

  it('publishes only after explicit confirmation and shows the result in chat, not in the preview', async () => {
    const { services, spies } = createFakeServices();
    spies.googleStatus.mockResolvedValue({ connected: true, email: 'ada@gmail.com', connectedAt: '2026-01-01T00:00:00.000Z' });
    renderApp(services, '/chat');
    const user = userEvent.setup();
    await sendFirstMessage(user);
    await user.click((await screen.findAllByRole('button', { name: /show preview/i }))[0]!);
    const panel = await screen.findByRole('complementary', { name: 'Form draft preview' });
    await waitFor(() => expect(spies.googleStatus).toHaveBeenCalled());
    await user.click(within(panel).getByRole('button', { name: 'Create GForm' }));
    const dialog = await screen.findByRole('dialog', { name: 'Create a Google Form?' });
    expect(dialog).toHaveTextContent('actual Google Form');
    expect(spies.publish).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole('button', { name: 'Create GForm' }));
    expect(spies.publish).toHaveBeenCalledWith('draft-1', 'version-1');
    const log = screen.getByRole('log', { name: 'Conversation' });
    const result = await within(log).findByRole('region', { name: 'Google Form created' });
    expect(result).toHaveTextContent('Google Form created successfully. Your form is ready.');
    expect(within(result).getByRole('link', { name: 'Open form' })).toHaveAttribute('href', 'https://docs.google.com/forms/d/e/x/viewform');
    expect(within(result).getByRole('link', { name: 'Open form' })).toHaveAttribute('target', '_blank');
    expect(within(result).getByRole('link', { name: 'Open editor' })).toHaveAttribute('href', 'https://docs.google.com/forms/d/x/edit');
    expect(within(result).getByRole('img', { name: /QR code that opens the form/ })).toBeInTheDocument();
    expect(within(result).getByText('Scan to open the form.')).toBeInTheDocument();
    expect(within(panel).queryByText(/created successfully/)).not.toBeInTheDocument();
    expect(within(panel).queryByRole('link', { name: 'Open form' })).not.toBeInTheDocument();
    expect(within(panel).queryByRole('link', { name: 'Open editor' })).not.toBeInTheDocument();
    expect(within(panel).queryByRole('img', { name: /QR code/ })).not.toBeInTheDocument();
    expect(within(panel).getByLabelText('Form title')).toHaveValue('College Hackathon Registration');
  });

  it('renders a persisted publication result when the conversation is reopened', async () => {
    const { services, spies, fixtures } = createFakeServices();
    spies.getConversation.mockResolvedValue({ ...fixtures.detail, id: 'conversation-1', activeDraftId: 'draft-1' });
    spies.messages.mockResolvedValue({ items: [message('USER', 'Create a hackathon form'), fixtures.publishResult.message!], nextCursor: null });
    renderApp(services, '/chat/conversation-1');
    const result = await screen.findByRole('region', { name: 'Google Form created' });
    expect(within(result).getByRole('link', { name: 'Open form' })).toHaveAttribute('href', 'https://docs.google.com/forms/d/e/x/viewform');
    expect(within(result).getByRole('img', { name: /QR code/ })).toBeInTheDocument();
  });

  it('keeps the draft and allows retry when publishing fails', async () => {
    const { services, spies, fixtures } = createFakeServices();
    spies.googleStatus.mockResolvedValue({ connected: true, email: 'ada@gmail.com', connectedAt: '2026-01-01T00:00:00.000Z' });
    spies.publish.mockRejectedValueOnce(
      new ApiError(502, 'PUBLISH_FAILED', 'Google Forms could not add items. Please try again.', {
        publication: { ...fixtures.publication, status: 'FAILED', currentStep: 'ADD_ITEMS', error: 'Google Forms could not add items.', responderUrl: null, editUrl: null },
        message: message('ASSISTANT', 'The Google Form for version 1 could not be created. Google Forms could not add items.', { id: 'failure-1', intent: null }),
      }),
    );
    renderApp(services, '/chat');
    const user = userEvent.setup();
    await sendFirstMessage(user);
    await user.click((await screen.findAllByRole('button', { name: /show preview/i }))[0]!);
    const panel = await screen.findByRole('complementary', { name: 'Form draft preview' });
    await waitFor(() => expect(spies.googleStatus).toHaveBeenCalled());
    await user.click(within(panel).getByRole('button', { name: 'Create GForm' }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Create GForm' }));
    expect(await within(panel).findByRole('alert')).toHaveTextContent('could not add items');
    expect(within(panel).getByLabelText('Form title')).toHaveValue('College Hackathon Registration');
    const log = screen.getByRole('log', { name: 'Conversation' });
    expect(within(log).getByText(/could not be created/)).toBeInTheDocument();
    expect(within(log).queryByRole('region', { name: 'Google Form created' })).not.toBeInTheDocument();
    await user.click(within(panel).getByRole('button', { name: 'Retry Create GForm' }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Create GForm' }));
    expect(await within(log).findByRole('region', { name: 'Google Form created' })).toBeInTheDocument();
    expect(within(panel).queryByRole('link', { name: 'Open form' })).not.toBeInTheDocument();
  });

  it('loads only the selected conversation and older messages on demand', async () => {
    const { services, spies } = createFakeServices();
    spies.getConversation.mockResolvedValue({
      id: 'conversation-7',
      title: 'Old chat',
      updatedAt: '2026-01-01T00:00:00.000Z',
      createdAt: '2026-01-01T00:00:00.000Z',
      activeDraftId: 'draft-1',
    });
    spies.messages.mockResolvedValueOnce({ items: [message('USER', 'Latest question'), message('ASSISTANT', 'Latest answer')], nextCursor: 'cursor-1' });
    spies.messages.mockResolvedValueOnce({ items: [message('USER', 'Very first question')], nextCursor: null });
    const callbacks: IntersectionObserverCallback[] = [];
    const original = window.IntersectionObserver;
    window.IntersectionObserver = class {
      constructor(callback: IntersectionObserverCallback) {
        callbacks.push(callback);
      }
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
      takeRecords(): IntersectionObserverEntry[] {
        return [];
      }
    } as unknown as typeof IntersectionObserver;
    try {
      renderApp(services, '/chat/conversation-7');
      expect(await screen.findByText('Latest answer')).toBeInTheDocument();
      expect(spies.messages).toHaveBeenCalledTimes(1);
      expect(spies.messages).toHaveBeenCalledWith('conversation-7', null);
      expect(spies.getDraft).not.toHaveBeenCalled();
      expect(screen.getByRole('button', { name: /show preview/i })).toBeInTheDocument();

      await act(async () => {
        callbacks.at(-1)?.([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
      });
      expect(await screen.findByText('Very first question')).toBeInTheDocument();
      expect(spies.messages).toHaveBeenLastCalledWith('conversation-7', 'cursor-1');
      const log = screen.getByRole('log', { name: 'Conversation' });
      expect(log.textContent?.indexOf('Very first question')).toBeLessThan(log.textContent?.indexOf('Latest question') ?? 0);
    } finally {
      window.IntersectionObserver = original;
    }
  });
});
