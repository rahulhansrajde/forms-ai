import type {
  ConversationDetail,
  ConversationSummary,
  DraftView,
  ExecuteSheetActionResult,
  FormSchema,
  GoogleConnectionView,
  MessageView,
  PublicationView,
  PublishResult,
  SendMessageResult,
  SheetActionStep,
  SheetActionView,
  UserView,
} from '@forms-ai/contracts';
import { vi } from 'vitest';
import { ApiClient, ApiError } from '../../src/services/api-client';
import {
  AuthService,
  ConversationService,
  DraftService,
  GoogleService,
  SheetsService,
  type FormsAIServices,
} from '../../src/services/forms-ai-services';

const USER: UserView = {
  id: 'user-1',
  firstName: 'Ada',
  lastName: 'Lovelace',
  email: 'ada@example.com',
  createdAt: '2026-01-01T00:00:00.000Z',
};

export const SCHEMA: FormSchema = {
  title: 'College Hackathon Registration',
  description: 'Register now',
  sections: [
    {
      id: 'section_1',
      title: '',
      description: '',
      questions: [
        { id: 'question_1', type: 'SHORT_ANSWER', title: 'Full Name', description: '', required: true },
        { id: 'question_2', type: 'DROPDOWN', title: 'Year of Study', description: '', required: false, options: ['1st Year', '2nd Year'] },
      ],
    },
  ],
};

export function draftView(overrides: Partial<DraftView> = {}): DraftView {
  return {
    id: 'draft-1',
    conversationId: 'conversation-1',
    title: SCHEMA.title,
    status: 'DRAFT',
    currentVersion: {
      id: 'version-1',
      draftId: 'draft-1',
      versionNumber: 1,
      source: 'AI',
      createdAt: '2026-01-01T00:00:00.000Z',
      schema: SCHEMA,
    },
    publication: null,
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

export function step(text: string, change: { from: string; to: string } | null = null): SheetActionStep {
  return { text, done: text, change };
}

export function message(role: MessageView['role'], content: string, overrides: Partial<MessageView> = {}): MessageView {
  return {
    id: `${role}-${content}`,
    conversationId: 'conversation-1',
    role,
    content,
    intent: role === 'ASSISTANT' ? 'NORMAL_CHAT' : null,
    publishedForm: null,
    sheetAction: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

export function createFakeServices(options: { authenticated?: boolean } = {}) {
  const api = new ApiClient();
  const auth = new AuthService(api);
  const conversations = new ConversationService(api);
  const drafts = new DraftService(api);
  const google = new GoogleService(api);
  const sheets = new SheetsService(api);

  const conversation: ConversationSummary = { id: 'conversation-1', title: 'New chat', updatedAt: '2026-01-01T00:00:00.000Z' };
  const detail: ConversationDetail = { ...conversation, createdAt: conversation.updatedAt, activeDraftId: null };
  const sendResult: SendMessageResult = {
    conversation: { ...conversation, title: 'Create a hackathon form' },
    userMessage: message('USER', 'Create a hackathon form', { intent: 'CREATE_FORM' }),
    assistantMessage: message('ASSISTANT', 'I created a draft.', { intent: 'CREATE_FORM' }),
    draft: draftView(),
    draftChanged: true,
  };
  const connection: GoogleConnectionView = { connected: false, email: null, connectedAt: null, capabilities: { forms: false, sheets: false } };
  const publication: PublicationView = {
    jobId: 'job-1',
    status: 'SUCCEEDED',
    currentStep: 'COMPLETED',
    versionId: 'version-1',
    error: null,
    googleFormId: 'google-form-1',
    responderUrl: 'https://docs.google.com/forms/d/e/x/viewform',
    editUrl: 'https://docs.google.com/forms/d/x/edit',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
  const publishResult: PublishResult = {
    publication,
    message: message('ASSISTANT', 'Google Form created successfully. Your form is ready.', {
      id: 'publication-message-1',
      intent: null,
      publishedForm: {
        title: 'College Hackathon Registration',
        versionNumber: 1,
        responderUrl: 'https://docs.google.com/forms/d/e/x/viewform',
        editUrl: 'https://docs.google.com/forms/d/x/edit',
      },
    }),
  };

  const sheetAction: SheetActionView = {
    id: 'sheet-action-1',
    kind: 'CREATE',
    status: 'PENDING',
    spreadsheetTitle: 'Event Leads',
    summary: 'Create the spreadsheet.',
    steps: [step('Create the spreadsheet “Event Leads”'), step('Add the tab “Sheet1” with columns Name, Email')],
    destructive: false,
    spreadsheetUrl: null,
    spreadsheetOrigin: null,
    tabs: [],
    error: null,
    table: null,
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
  const completedSheetAction: SheetActionView = {
    ...sheetAction,
    status: 'SUCCEEDED',
    spreadsheetUrl: 'https://docs.google.com/spreadsheets/d/sheet-1/edit',
    spreadsheetOrigin: 'CREATED_BY_FORMS_AI',
    tabs: ['Sheet1'],
  };
  const sheetResult: ExecuteSheetActionResult = {
    action: completedSheetAction,
    message: message('ASSISTANT', 'Google Sheet created successfully. “Event Leads” is ready.', {
      id: 'sheet-result-1',
      intent: null,
      sheetAction: completedSheetAction,
    }),
  };

  const spies = {
    currentUser: vi.spyOn(auth, 'currentUser').mockImplementation(async () => {
      if (options.authenticated === false) {
        throw new ApiError(401, 'AUTHENTICATION_REQUIRED', 'Please log in to continue.');
      }
      return USER;
    }),
    logIn: vi.spyOn(auth, 'logIn').mockResolvedValue(USER),
    signUp: vi.spyOn(auth, 'signUp').mockResolvedValue(USER),
    logOut: vi.spyOn(auth, 'logOut').mockResolvedValue(undefined),
    createConversation: vi.spyOn(conversations, 'create').mockResolvedValue(conversation),
    listConversations: vi.spyOn(conversations, 'list').mockResolvedValue({ items: [], nextCursor: null }),
    getConversation: vi.spyOn(conversations, 'get').mockResolvedValue(detail),
    deleteConversation: vi.spyOn(conversations, 'delete').mockResolvedValue(undefined),
    messages: vi.spyOn(conversations, 'messages').mockResolvedValue({ items: [], nextCursor: null }),
    send: vi.spyOn(conversations, 'send').mockResolvedValue(sendResult),
    getDraft: vi.spyOn(drafts, 'get').mockResolvedValue(draftView()),
    versions: vi.spyOn(drafts, 'versions').mockResolvedValue({ items: [], nextCursor: null }),
    applyOperations: vi.spyOn(drafts, 'applyOperations').mockResolvedValue(draftView()),
    googleStatus: vi.spyOn(google, 'status').mockResolvedValue(connection),
    publish: vi.spyOn(google, 'publish').mockResolvedValue(publishResult),
    executeSheet: vi.spyOn(sheets, 'execute').mockResolvedValue(sheetResult),
  };

  const services: FormsAIServices = { api, auth, conversations, drafts, google, sheets };
  return { services, spies, fixtures: { conversation, detail, sendResult, publication, publishResult, sheetAction, sheetResult } };
}
