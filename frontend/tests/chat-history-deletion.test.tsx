import type { ConversationSummary } from '@forms-ai/contracts';
import { act, fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../src/services/api-client';
import { createFakeServices } from './support/fake-services';
import { renderApp } from './support/render-app';

const NOW = new Date().toISOString();
const CONVERSATIONS: ConversationSummary[] = [
  { id: 'conversation-1', title: 'Hackathon registration', updatedAt: NOW },
  { id: 'conversation-2', title: 'Team feedback survey', updatedAt: NOW },
];

async function openHistory(path = '/chat/conversation-2') {
  const fake = createFakeServices();
  fake.spies.listConversations.mockResolvedValue({ items: CONVERSATIONS, nextCursor: null });
  fake.spies.getConversation.mockImplementation(async (id: string) => ({
    id,
    title: CONVERSATIONS.find((conversation) => conversation.id === id)?.title ?? 'Chat',
    createdAt: NOW,
    updatedAt: NOW,
    activeDraftId: null,
  }));
  renderApp(fake.services, path);
  await userEvent.setup().click(await screen.findByRole('button', { name: 'Open sidebar' }));
  const history = await screen.findByRole('navigation', { name: 'Previous conversations' });
  await within(history).findByText('Hackathon registration');
  vi.useFakeTimers();
  return { ...fake, history };
}

function click(element: HTMLElement) {
  act(() => {
    fireEvent.click(element);
  });
}

async function advance(milliseconds: number) {
  await act(async () => {
    vi.advanceTimersByTime(milliseconds);
  });
}

describe('chat history deletion', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows a delete control for every conversation', async () => {
    const { history } = await openHistory();
    expect(within(history).getByRole('button', { name: 'Delete chat “Hackathon registration”' })).toBeInTheDocument();
    expect(within(history).getByRole('button', { name: 'Delete chat “Team feedback survey”' })).toBeInTheDocument();
  });

  it('waits five seconds with a countdown and lets Undo cancel without deleting anything', async () => {
    const { history, spies } = await openHistory();
    click(within(history).getByRole('button', { name: 'Delete chat “Hackathon registration”' }));

    const undo = within(history).getByRole('button', { name: 'Undo deleting “Hackathon registration”' });
    expect(undo).toHaveFocus();
    expect(within(history).getByText('5')).toBeInTheDocument();
    expect(within(history).getByRole('status')).toHaveTextContent('will be deleted in 5 seconds');
    await advance(2100);
    expect(within(history).getByText('3')).toBeInTheDocument();
    await advance(2899);
    expect(spies.deleteConversation).not.toHaveBeenCalled();

    click(undo);
    expect(within(history).getByRole('link', { name: /Hackathon registration/ })).toBeInTheDocument();
    expect(within(history).getByRole('button', { name: 'Delete chat “Hackathon registration”' })).toHaveFocus();
    await advance(10000);
    expect(spies.deleteConversation).not.toHaveBeenCalled();
  });

  it('permanently deletes exactly once after five seconds and removes the conversation', async () => {
    const { history, spies } = await openHistory();
    click(within(history).getByRole('button', { name: 'Delete chat “Hackathon registration”' }));
    await advance(4999);
    expect(spies.deleteConversation).not.toHaveBeenCalled();
    await advance(1);
    await advance(10000);
    expect(spies.deleteConversation).toHaveBeenCalledTimes(1);
    expect(spies.deleteConversation).toHaveBeenCalledWith('conversation-1');
    expect(within(history).queryByText('Hackathon registration')).not.toBeInTheDocument();
    expect(within(history).getByText('Team feedback survey')).toBeInTheDocument();
  });

  it('keeps the open conversation usable during the countdown and leaves it once it is deleted', async () => {
    const { history } = await openHistory('/chat/conversation-2');
    click(within(history).getByRole('button', { name: 'Delete chat “Team feedback survey”' }));
    expect(screen.getByLabelText('Message Forms AI')).toBeEnabled();
    await advance(5000);
    expect(screen.getByRole('heading', { name: 'Start a new chat' })).toBeInTheDocument();
  });

  it('restores the conversation and explains when the server cannot delete it', async () => {
    const { history, spies } = await openHistory();
    spies.deleteConversation.mockRejectedValueOnce(new ApiError(500, 'INTERNAL_ERROR', 'Something went wrong.'));
    click(within(history).getByRole('button', { name: 'Delete chat “Hackathon registration”' }));
    await advance(5000);
    expect(screen.getByText(/could not be deleted/)).toBeInTheDocument();
    expect(within(history).getByRole('button', { name: 'Delete chat “Hackathon registration”' })).toBeInTheDocument();
    expect(spies.deleteConversation).toHaveBeenCalledTimes(1);
  });

  it('runs independent countdowns for different conversations', async () => {
    const { history, spies } = await openHistory('/chat');
    click(within(history).getByRole('button', { name: 'Delete chat “Hackathon registration”' }));
    await advance(2000);
    click(within(history).getByRole('button', { name: 'Delete chat “Team feedback survey”' }));
    await advance(3000);
    expect(spies.deleteConversation).toHaveBeenCalledTimes(1);
    click(within(history).getByRole('button', { name: 'Undo deleting “Team feedback survey”' }));
    await advance(10000);
    expect(spies.deleteConversation).toHaveBeenCalledTimes(1);
    expect(within(history).getByText('Team feedback survey')).toBeInTheDocument();
  });
});
