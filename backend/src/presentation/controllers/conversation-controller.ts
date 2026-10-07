import type { Request, Response } from 'express';
import type { SendChatMessageUseCase } from '../../application/use-cases/chat/send-chat-message-use-case.js';
import type {
  CreateConversationUseCase,
  DeleteConversationUseCase,
  GetConversationMessagesUseCase,
  GetConversationUseCase,
  ListConversationsUseCase,
} from '../../application/use-cases/conversations/conversation-use-cases.js';
import { principalOf } from '../http/principal.js';
import {
  conversationPageQuerySchema,
  conversationParamsSchema,
  createConversationBodySchema,
  messagePageQuerySchema,
  sendMessageBodySchema,
} from '../validators/request-schemas.js';
import type { RequestValidator } from '../validators/request-validator.js';

export interface ConversationUseCases {
  create: CreateConversationUseCase;
  list: ListConversationsUseCase;
  get: GetConversationUseCase;
  delete: DeleteConversationUseCase;
  messages: GetConversationMessagesUseCase;
  sendMessage: SendChatMessageUseCase;
}

export class ConversationController {
  constructor(
    private readonly useCases: ConversationUseCases,
    private readonly validator: RequestValidator,
  ) {}

  readonly create = async (request: Request, response: Response): Promise<void> => {
    const body = this.validator.body(createConversationBodySchema, request.body);
    const conversation = await this.useCases.create.execute(principalOf(response).userId, body.title);
    response.status(201).json({ conversation });
  };

  readonly list = async (request: Request, response: Response): Promise<void> => {
    const query = this.validator.query(conversationPageQuerySchema, request.query);
    response.json(
      await this.useCases.list.execute(principalOf(response).userId, { limit: query.limit, cursor: query.cursor ?? null }),
    );
  };

  readonly get = async (request: Request, response: Response): Promise<void> => {
    const { conversationId } = this.validator.params(conversationParamsSchema, request.params);
    response.json({ conversation: await this.useCases.get.execute(principalOf(response).userId, conversationId) });
  };

  readonly delete = async (request: Request, response: Response): Promise<void> => {
    const { conversationId } = this.validator.params(conversationParamsSchema, request.params);
    await this.useCases.delete.execute(principalOf(response).userId, conversationId);
    response.status(204).end();
  };

  readonly messages = async (request: Request, response: Response): Promise<void> => {
    const { conversationId } = this.validator.params(conversationParamsSchema, request.params);
    const query = this.validator.query(messagePageQuerySchema, request.query);
    response.json(
      await this.useCases.messages.execute(principalOf(response).userId, conversationId, {
        limit: query.limit,
        cursor: query.cursor ?? null,
      }),
    );
  };

  readonly sendMessage = async (request: Request, response: Response): Promise<void> => {
    const { conversationId } = this.validator.params(conversationParamsSchema, request.params);
    const body = this.validator.body(sendMessageBodySchema, request.body);
    response.json(await this.useCases.sendMessage.execute(principalOf(response).userId, conversationId, body.content));
  };
}
