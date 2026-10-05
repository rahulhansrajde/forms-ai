import type { ApiErrorBody, ErrorCode } from '@forms-ai/contracts';

export type ClientErrorCode = ErrorCode | 'NETWORK_UNAVAILABLE';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ClientErrorCode,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

type QueryValue = string | number | null | undefined;

const FALLBACK_MESSAGE = 'Something went wrong. Please try again.';

export class ApiClient {
  private readonly sessionExpiredListeners = new Set<() => void>();

  constructor(private readonly baseUrl = '') {}

  onSessionExpired(listener: () => void): () => void {
    this.sessionExpiredListeners.add(listener);
    return () => this.sessionExpiredListeners.delete(listener);
  }

  get<T>(path: string, query: Record<string, QueryValue> = {}): Promise<T> {
    return this.request<T>('GET', `${path}${this.queryString(query)}`);
  }

  post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('POST', path, body ?? {});
  }

  patch<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>('PATCH', path, body);
  }

  delete<T>(path: string): Promise<T> {
    return this.request<T>('DELETE', path);
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const response = await this.send(method, path, body);
    if (response.status === 204) {
      return undefined as T;
    }
    const payload = await this.readJson(response);
    if (!response.ok) {
      throw this.failure(response.status, payload);
    }
    return payload as T;
  }

  private async send(method: string, path: string, body: unknown): Promise<Response> {
    try {
      return await fetch(`${this.baseUrl}${path}`, {
        method,
        credentials: 'same-origin',
        headers: body === undefined ? { Accept: 'application/json' } : { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      throw new ApiError(0, 'NETWORK_UNAVAILABLE', 'Forms AI could not be reached. Check your connection and try again.');
    }
  }

  private async readJson(response: Response): Promise<unknown> {
    try {
      return await response.json();
    } catch {
      return null;
    }
  }

  private failure(status: number, payload: unknown): ApiError {
    const body = (payload as Partial<ApiErrorBody> | null)?.error;
    const error = new ApiError(status, body?.code ?? 'INTERNAL_ERROR', body?.message ?? FALLBACK_MESSAGE, body?.details);
    if (error.code === 'AUTHENTICATION_REQUIRED') {
      this.sessionExpiredListeners.forEach((listener) => listener());
    }
    return error;
  }

  private queryString(query: Record<string, QueryValue>): string {
    const parameters = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value !== null && value !== undefined && value !== '') {
        parameters.set(key, String(value));
      }
    }
    const encoded = parameters.toString();
    return encoded ? `?${encoded}` : '';
  }
}
