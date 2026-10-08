import type { SheetActionView } from '@forms-ai/contracts';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ApiError } from '../src/services/api-client';
import { createFakeServices, message, step } from './support/fake-services';
import { renderApp } from './support/render-app';

type Fake = ReturnType<typeof createFakeServices>;

function proposeInChat({ spies, fixtures }: Fake, action: SheetActionView = fixtures.sheetAction) {
  spies.send.mockResolvedValue({
    ...fixtures.sendResult,
    assistantMessage: message('ASSISTANT', 'I prepared the Google Sheet. Click Create Google Sheet when it looks right.', {
      id: 'proposal-1',
      intent: action.kind === 'CREATE' ? 'CREATE_SHEET' : action.kind === 'MODIFY' ? 'MODIFY_SHEET' : 'READ_SHEET',
      sheetAction: action,
    }),
    draft: null,
    draftChanged: false,
  });
}

async function send(text = 'Create a spreadsheet called Event Leads with columns Name, Email') {
  const user = userEvent.setup();
  const composer = await screen.findByLabelText('Message Forms AI');
  await user.type(composer, text);
  await user.keyboard('{Enter}');
  return user;
}

describe('Google Sheets actions in chat', () => {
  it('shows the planned steps and only creates the sheet after the button is clicked', async () => {
    const fake = createFakeServices();
    proposeInChat(fake);
    renderApp(fake.services, '/chat');
    const user = await send();

    const card = await screen.findByRole('region', { name: 'New Google Sheet “Event Leads”' });
    expect(within(card).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'Create the spreadsheet “Event Leads”',
      'Add the tab “Sheet1” with columns Name, Email',
    ]);
    expect(within(card).getByText('Nothing is created until you click.')).toBeInTheDocument();
    expect(fake.spies.executeSheet).not.toHaveBeenCalled();

    await user.click(within(card).getByRole('button', { name: 'Create Google Sheet' }));
    expect(fake.spies.executeSheet).toHaveBeenCalledWith('sheet-action-1', false);

    const result = await screen.findByRole('region', { name: 'Google Sheets result for “Event Leads”' });
    expect(result).toHaveTextContent('Google Sheet created successfully. “Event Leads” is ready.');
    const open = within(result).getByRole('link', { name: 'Open sheet' });
    expect(open).toHaveAttribute('href', 'https://docs.google.com/spreadsheets/d/sheet-1/edit');
    expect(open).toHaveAttribute('target', '_blank');
    expect(open).toHaveAttribute('rel', 'noopener noreferrer');
    expect(within(card).getByText('Created in Google Sheets')).toBeInTheDocument();
    expect(within(card).queryByRole('button', { name: 'Create Google Sheet' })).not.toBeInTheDocument();
    expect(await screen.findByText('Your Google Sheet is ready. The link is in the chat.')).toBeInTheDocument();
  });

  it('asks for confirmation before destructive changes', async () => {
    const fake = createFakeServices();
    const destructive: SheetActionView = {
      ...fake.fixtures.sheetAction,
      kind: 'MODIFY',
      destructive: true,
      steps: [step('Clear the “Email” values from “Event Leads”')],
    };
    proposeInChat(fake, destructive);
    fake.spies.executeSheet.mockResolvedValue({ action: { ...destructive, status: 'SUCCEEDED' }, message: null });
    renderApp(fake.services, '/chat');
    const user = await send('Clear column B');

    const card = await screen.findByRole('region', { name: 'Changes to “Event Leads”' });
    expect(within(card).getByText('Removes data')).toBeInTheDocument();
    await user.click(within(card).getByRole('button', { name: 'Apply changes' }));
    const dialog = await screen.findByRole('dialog', { name: 'Remove data from Google Sheets?' });
    expect(dialog).toHaveTextContent('Clear the “Email” values from “Event Leads”');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(fake.spies.executeSheet).not.toHaveBeenCalled();

    await user.click(within(card).getByRole('button', { name: 'Apply changes' }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Yes, apply changes' }));
    expect(fake.spies.executeSheet).toHaveBeenCalledWith('sheet-action-1', true);
    expect(await within(card).findByText('Changes applied')).toBeInTheDocument();
  });

  it('offers re-consent when the Google connection lacks Google Sheets', async () => {
    const fake = createFakeServices();
    proposeInChat(fake);
    fake.spies.executeSheet.mockRejectedValueOnce(new ApiError(409, 'GOOGLE_SHEETS_ACCESS_REQUIRED', 'Allow Forms AI to use Google Sheets, then try again.'));
    fake.spies.executeSheet.mockRejectedValueOnce(new ApiError(409, 'GOOGLE_NOT_CONNECTED', 'Connect your Google account to continue.'));
    renderApp(fake.services, '/chat');
    const user = await send();
    const card = await screen.findByRole('region', { name: 'New Google Sheet “Event Leads”' });

    await user.click(within(card).getByRole('button', { name: 'Create Google Sheet' }));
    const allow = await within(card).findByRole('link', { name: 'Allow Google Sheets' });
    expect(allow).toHaveAttribute('href', '/auth/google?returnTo=%2Fchat%2Fconversation-1');

    await user.click(within(card).getByRole('button', { name: 'Create Google Sheet' }));
    expect(await within(card).findByRole('link', { name: 'Connect Google' })).toHaveAttribute('href', '/auth/google?returnTo=%2Fchat%2Fconversation-1');
  });

  it('shows a failed attempt, the persisted failure message and allows a retry', async () => {
    const fake = createFakeServices();
    proposeInChat(fake);
    const reason = 'Google Sheets is receiving too many requests. Please wait a minute and try again.';
    fake.spies.executeSheet.mockRejectedValueOnce(
      new ApiError(502, 'GOOGLE_SHEETS_FAILED', reason, {
        action: { ...fake.fixtures.sheetAction, status: 'FAILED', error: reason },
        message: message('ASSISTANT', `The Google Sheets action could not be completed. ${reason}`, { id: 'failure-1', intent: null }),
      }),
    );
    renderApp(fake.services, '/chat');
    const user = await send();
    const card = await screen.findByRole('region', { name: 'New Google Sheet “Event Leads”' });

    await user.click(within(card).getByRole('button', { name: 'Create Google Sheet' }));
    expect(await within(card).findByRole('alert')).toHaveTextContent(`The last attempt failed: ${reason}`);
    const log = screen.getByRole('log', { name: 'Conversation' });
    expect(within(log).getByText(/could not be completed/)).toBeInTheDocument();
    expect(within(log).queryByRole('link', { name: 'Open sheet' })).not.toBeInTheDocument();

    await user.click(within(card).getByRole('button', { name: 'Try again: Create Google Sheet' }));
    expect(await within(log).findByRole('link', { name: 'Open sheet' })).toBeInTheDocument();
    expect(fake.spies.executeSheet).toHaveBeenCalledTimes(2);
  });

  it('shows unexpected errors without losing the proposal', async () => {
    const fake = createFakeServices();
    proposeInChat(fake);
    fake.spies.executeSheet.mockRejectedValueOnce(new ApiError(0, 'NETWORK_UNAVAILABLE', 'Forms AI could not be reached. Check your connection and try again.'));
    renderApp(fake.services, '/chat');
    const user = await send();
    const card = await screen.findByRole('region', { name: 'New Google Sheet “Event Leads”' });
    await user.click(within(card).getByRole('button', { name: 'Create Google Sheet' }));
    expect(await within(card).findByRole('alert')).toHaveTextContent('could not be reached');
    expect(within(card).getByRole('button', { name: 'Create Google Sheet' })).toBeEnabled();
  });

  it('renders persisted read results as a bounded, horizontally scrollable table', async () => {
    const fake = createFakeServices();
    const read: SheetActionView = {
      ...fake.fixtures.sheetAction,
      id: 'read-1',
      kind: 'READ',
      status: 'SUCCEEDED',
      spreadsheetUrl: 'https://docs.google.com/spreadsheets/d/sheet-1/edit',
      table: {
        range: "'Sheet1'!A1:C201",
        values: [
          ['Name', 'Email', 'Phone'],
          ['Ada', 'ada@example.com'],
        ],
        totalRows: 250,
        truncated: true,
        label: 'Sheet1 · first 1 of 249 data rows · header row included',
      },
    };
    fake.spies.getConversation.mockResolvedValue({ ...fake.fixtures.detail, id: 'conversation-1' });
    fake.spies.messages.mockResolvedValue({
      items: [message('ASSISTANT', 'Here is the data from “Event Leads”.', { id: 'read-result', intent: null, sheetAction: read })],
      nextCursor: null,
    });
    renderApp(fake.services, '/chat/conversation-1');

    const region = await screen.findByRole('region', { name: 'Values from Sheet1 · first 1 of 249 data rows · header row included' });
    expect(region).toHaveAttribute('tabindex', '0');
    expect(within(region).getAllByRole('columnheader').map((cell) => cell.textContent)).toEqual(['Name', 'Email', 'Phone']);
    expect(within(region).getAllByRole('cell').map((cell) => cell.textContent)).toEqual(['Ada', 'ada@example.com', '']);
    expect(screen.getByText('Sheet1 · first 1 of 249 data rows · header row included')).toBeInTheDocument();
    expect(screen.queryByText(/A1:C201/)).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open sheet' })).toHaveAttribute('href', 'https://docs.google.com/spreadsheets/d/sheet-1/edit');
  });

  it('uses theme tokens and scrolls wide tables instead of the page', () => {
    const directory = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'components', 'chat');
    const read = (file: string) => readFileSync(join(directory, file), 'utf8');
    const cardStyles = read('sheet-action-card.module.css');
    const tableStyles = read('sheet-table.module.css');
    for (const css of [cardStyles, tableStyles]) {
      expect(css).not.toMatch(/#[0-9a-f]{3,8}\b/i);
      expect(css).not.toMatch(/rgba?\(/i);
    }
    expect(tableStyles).toMatch(/\.scroller\s*{[^}]*overflow:\s*auto/);
    expect(tableStyles).toMatch(/\.table\s*{[^}]*width:\s*max-content/);
    expect(cardStyles).toMatch(/@media \(max-width: 600px\)/);
  });
});

describe('Google settings', () => {
  it('shows Forms and Sheets permissions and offers re-consent for Google Sheets', async () => {
    const fake = createFakeServices();
    fake.spies.googleStatus.mockResolvedValue({
      connected: true,
      email: 'ada@gmail.com',
      connectedAt: '2026-01-01T00:00:00.000Z',
      capabilities: { forms: true, sheets: false },
    });
    renderApp(fake.services, '/settings?section=google');
    const permissions = await screen.findByRole('list', { name: 'Google permissions' });
    const items = within(permissions).getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('Google Forms');
    expect(items[0]).toHaveTextContent('Allowed');
    expect(items[1]).toHaveTextContent('Google Sheets');
    expect(items[1]).toHaveTextContent('Not allowed');
    expect(screen.getByRole('link', { name: 'Allow Google Sheets' })).toHaveAttribute('href', '/auth/google?returnTo=%2Fsettings');
    expect(screen.getByRole('button', { name: 'Disconnect' })).toBeInTheDocument();
  });

  it('shows both permissions as allowed once Google Sheets is granted', async () => {
    const fake = createFakeServices();
    fake.spies.googleStatus.mockResolvedValue({
      connected: true,
      email: 'ada@gmail.com',
      connectedAt: '2026-01-01T00:00:00.000Z',
      capabilities: { forms: true, sheets: true },
    });
    renderApp(fake.services, '/settings?section=google');
    const permissions = await screen.findByRole('list', { name: 'Google permissions' });
    await waitFor(() => expect(within(permissions).getAllByText('Allowed')).toHaveLength(2));
    expect(screen.queryByRole('link', { name: 'Allow Google Sheets' })).not.toBeInTheDocument();
  });

  it('offers to connect Google when not connected', async () => {
    const fake = createFakeServices();
    renderApp(fake.services, '/settings?section=google');
    expect(await screen.findByRole('link', { name: 'Connect Google' })).toHaveAttribute('href', '/auth/google?returnTo=%2Fsettings');
    expect(screen.getByRole('heading', { name: 'Google Forms & Sheets' })).toBeInTheDocument();
  });
});

describe('linking an existing Google Sheet', () => {
  const EXISTING_URL = 'https://docs.google.com/spreadsheets/d/1HackathonRegistrations0123456789abcdefXYZ/edit';

  function linkAction(fake: Fake, overrides: Partial<SheetActionView> = {}): SheetActionView {
    return {
      ...fake.fixtures.sheetAction,
      id: 'link-1',
      kind: 'LINK',
      spreadsheetTitle: 'Hackathon Registrations',
      tabs: ['Registrations', 'Analytics'],
      steps: [step('Connect the existing Google Sheet “Hackathon Registrations” to this chat')],
      ...overrides,
    };
  }

  it('shows the found sheet and connects it only after Connect Google Sheet is clicked', async () => {
    const fake = createFakeServices();
    const pending = linkAction(fake);
    const connected: SheetActionView = { ...pending, status: 'SUCCEEDED', spreadsheetUrl: EXISTING_URL, spreadsheetOrigin: 'LINKED_EXISTING' };
    proposeInChat(fake, pending);
    fake.spies.executeSheet.mockResolvedValue({
      action: connected,
      message: message('ASSISTANT', 'Google Sheet connected successfully. “Hackathon Registrations” is now the active spreadsheet in this chat.', {
        id: 'link-result',
        intent: null,
        sheetAction: connected,
      }),
    });
    renderApp(fake.services, '/chat');
    const user = await send(`Use this Google Sheet: ${EXISTING_URL}`);

    const card = await screen.findByRole('region', { name: 'Google Sheet found' });
    expect(within(card).getByText('Spreadsheet Name').nextElementSibling).toHaveTextContent('Hackathon Registrations');
    expect(within(card).getByText('Tabs').nextElementSibling).toHaveTextContent('Registrations, Analytics');
    expect(within(card).getByText('Connecting does not change the spreadsheet.')).toBeInTheDocument();
    expect(fake.spies.executeSheet).not.toHaveBeenCalled();

    await user.click(within(card).getByRole('button', { name: 'Connect Google Sheet' }));
    expect(fake.spies.executeSheet).toHaveBeenCalledWith('link-1', false);
    const result = await screen.findByRole('region', { name: 'Google Sheets result for “Hackathon Registrations”' });
    expect(result).toHaveTextContent('Google Sheet connected successfully.');
    expect(within(result).getByRole('link', { name: 'Open sheet' })).toHaveAttribute('href', EXISTING_URL);
    expect(within(card).getByText('Connected to this chat')).toBeInTheDocument();
    expect(await screen.findByText('Google Sheet connected. The link is in the chat.')).toBeInTheDocument();
  });

  it('asks for Google access when the sheet could not be previewed yet', async () => {
    const fake = createFakeServices();
    proposeInChat(fake, linkAction(fake, { spreadsheetTitle: 'Google Sheet', tabs: [] }));
    fake.spies.executeSheet.mockRejectedValueOnce(new ApiError(409, 'GOOGLE_SHEETS_ACCESS_REQUIRED', 'Allow Forms AI to use Google Sheets, then try again.'));
    renderApp(fake.services, '/chat');
    const user = await send(`Use this Google Sheet: ${EXISTING_URL}`);
    const card = await screen.findByRole('region', { name: 'Connect a Google Sheet' });
    expect(within(card).queryByText('Spreadsheet Name')).not.toBeInTheDocument();
    await user.click(within(card).getByRole('button', { name: 'Connect Google Sheet' }));
    expect(await within(card).findByRole('link', { name: 'Allow Google Sheets' })).toHaveAttribute('href', '/auth/google?returnTo=%2Fchat%2Fconversation-1');
  });

  it('shows a summary below the read result headline', async () => {
    const fake = createFakeServices();
    const read: SheetActionView = {
      ...linkAction(fake),
      id: 'read-2',
      kind: 'READ',
      status: 'SUCCEEDED',
      spreadsheetUrl: EXISTING_URL,
      table: { range: "'Registrations'!A1:C3", label: 'Registrations · 1 data row · header row included', values: [['Name', 'Email', 'College'], ['Ada', 'ada@example.com', 'Analytical']], totalRows: 2, truncated: false },
    };
    fake.spies.getConversation.mockResolvedValue({ ...fake.fixtures.detail, id: 'conversation-1' });
    fake.spies.messages.mockResolvedValue({
      items: [message('ASSISTANT', 'Here is the data from “Hackathon Registrations”.\n\nSummary: 1 registration from Analytical.', { id: 'r', intent: null, sheetAction: read })],
      nextCursor: null,
    });
    renderApp(fake.services, '/chat/conversation-1');
    const result = await screen.findByRole('region', { name: 'Google Sheets result for “Hackathon Registrations”' });
    expect(within(result).getByText('Summary: 1 registration from Analytical.').tagName).toBe('P');
    expect(within(result).getByRole('region', { name: 'Values from Registrations · 1 data row · header row included' })).toBeInTheDocument();
  });
});

describe('record update cards', () => {
  it('shows the field change instead of cell coordinates', async () => {
    const fake = createFakeServices();
    const update: SheetActionView = {
      ...fake.fixtures.sheetAction,
      id: 'update-1',
      kind: 'MODIFY',
      spreadsheetTitle: 'Forms AI Student Registration',
      steps: [step("Update Rahul's Year", { from: '3rd Year', to: '4th Year' })],
    };
    proposeInChat(fake, update);
    renderApp(fake.services, '/chat');
    await send("Change Rahul's Year from 3rd Year to 4th Year.");

    const card = await screen.findByRole('region', { name: 'Changes to “Forms AI Student Registration”' });
    const [item] = within(card).getAllByRole('listitem');
    expect(item).toHaveTextContent("Update Rahul's Year");
    expect(item).toHaveTextContent(/3rd Year\s*→.*4th Year/);
    expect(item).toHaveTextContent(/from 3rd Year/);
    expect(card.textContent).not.toMatch(/\b[A-Z]{1,3}\d+\b/);
  });
});

describe('read cards', () => {
  it('keeps the requested data-row count and notes the header row separately', async () => {
    const fake = createFakeServices();
    const read: SheetActionView = {
      ...fake.fixtures.sheetAction,
      id: 'read-3',
      kind: 'READ',
      spreadsheetTitle: 'Forms AI Student Registration',
      steps: [{ ...step('Read the first 3 data rows from “Students”'), note: 'Header row included' }],
    };
    proposeInChat(fake, read);
    renderApp(fake.services, '/chat');
    await send('Show me the first 3 rows from the Students sheet.');

    const card = await screen.findByRole('region', { name: 'Read from “Forms AI Student Registration”' });
    const [item] = within(card).getAllByRole('listitem');
    expect(within(item!).getByText('Read the first 3 data rows from “Students”')).toBeInTheDocument();
    expect(within(item!).getByText('Header row included')).toBeInTheDocument();
    expect(card.textContent).not.toMatch(/A1:|first 4/);
  });
});
