import type {
  ChangePasswordRequest,
  ConversationDetail,
  ConversationSummary,
  CursorPage,
  DraftView,
  FormOperation,
  FormVersionSummary,
  FormVersionView,
  GoogleConnectionView,
  LogInRequest,
  MessageView,
  PublicationView,
  SendMessageResult,
  SignUpRequest,
  UpdateProfileRequest,
  UserView,
} from '@forms-ai/contracts';
import { ApiClient } from './api-client';

export class AuthService {
  constructor(private readonly api: ApiClient) {}

  async signUp(request: SignUpRequest): Promise<UserView> {
    return (await this.api.post<{ user: UserView }>('/auth/signup', request)).user;
  }

  async logIn(request: LogInRequest): Promise<UserView> {
    return (await this.api.post<{ user: UserView }>('/auth/login', request)).user;
  }

  async logOut(): Promise<void> {
    await this.api.post<void>('/auth/logout');
  }

  async currentUser(): Promise<UserView> {
    return (await this.api.get<{ user: UserView }>('/auth/me')).user;
  }

  async updateProfile(request: UpdateProfileRequest): Promise<UserView> {
    return (await this.api.patch<{ user: UserView }>('/auth/me', request)).user;
  }

  async changePassword(request: ChangePasswordRequest): Promise<void> {
    await this.api.post<void>('/auth/password', request);
  }
}

export class ConversationService {
  constructor(private readonly api: ApiClient) {}

  async create(): Promise<ConversationSummary> {
    return (await this.api.post<{ conversation: ConversationSummary }>('/conversations', {})).conversation;
  }

  list(cursor: string | null): Promise<CursorPage<ConversationSummary>> {
    return this.api.get('/conversations', { cursor });
  }

  async get(conversationId: string): Promise<ConversationDetail> {
    return (await this.api.get<{ conversation: ConversationDetail }>(`/conversations/${conversationId}`)).conversation;
  }

  messages(conversationId: string, cursor: string | null): Promise<CursorPage<MessageView>> {
    return this.api.get(`/conversations/${conversationId}/messages`, { cursor });
  }

  send(conversationId: string, content: string): Promise<SendMessageResult> {
    return this.api.post(`/conversations/${conversationId}/messages`, { content });
  }
}

export class DraftService {
  constructor(private readonly api: ApiClient) {}

  async get(draftId: string): Promise<DraftView> {
    return (await this.api.get<{ draft: DraftView }>(`/drafts/${draftId}`)).draft;
  }

  versions(draftId: string, cursor: string | null): Promise<CursorPage<FormVersionSummary>> {
    return this.api.get(`/drafts/${draftId}/versions`, { cursor });
  }

  async version(draftId: string, versionId: string): Promise<FormVersionView> {
    return (await this.api.get<{ version: FormVersionView }>(`/drafts/${draftId}/versions/${versionId}`)).version;
  }

  async applyOperations(draftId: string, baseVersionId: string, operations: FormOperation[]): Promise<DraftView> {
    return (await this.api.post<{ draft: DraftView }>(`/drafts/${draftId}/versions`, { baseVersionId, operations })).draft;
  }

  async restore(draftId: string, baseVersionId: string, restoreVersionId: string): Promise<DraftView> {
    return (await this.api.post<{ draft: DraftView }>(`/drafts/${draftId}/versions`, { baseVersionId, restoreVersionId })).draft;
  }
}

export class GoogleService {
  constructor(private readonly api: ApiClient) {}

  async status(): Promise<GoogleConnectionView> {
    return (await this.api.get<{ connection: GoogleConnectionView }>('/integrations/google/status')).connection;
  }

  async disconnect(): Promise<void> {
    await this.api.delete<void>('/integrations/google');
  }

  async publish(draftId: string, versionId: string): Promise<PublicationView> {
    return (await this.api.post<{ publication: PublicationView }>('/google-forms/publish', { draftId, versionId })).publication;
  }

  authorizationPath(returnTo: string): string {
    return `/auth/google?returnTo=${encodeURIComponent(returnTo)}`;
  }
}

export interface FormsAIServices {
  api: ApiClient;
  auth: AuthService;
  conversations: ConversationService;
  drafts: DraftService;
  google: GoogleService;
}

export function createServices(api: ApiClient = new ApiClient()): FormsAIServices {
  return {
    api,
    auth: new AuthService(api),
    conversations: new ConversationService(api),
    drafts: new DraftService(api),
    google: new GoogleService(api),
  };
}
