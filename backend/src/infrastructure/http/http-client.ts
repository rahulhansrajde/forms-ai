import { ExternalServiceError } from '../../shared/errors/application-errors.js';

export interface HttpRequest {
  method: 'GET' | 'POST' | 'PUT';
  url: string;
  headers?: Record<string, string>;
  body?: string;
}

export interface HttpResponse {
  status: number;
  body: unknown;
}

export interface HttpClient {
  send(request: HttpRequest): Promise<HttpResponse>;
}

const DEFAULT_TIMEOUT_MS = 20_000;

export class FetchHttpClient implements HttpClient {
  constructor(private readonly timeoutMs: number = DEFAULT_TIMEOUT_MS) {}

  async send(request: HttpRequest): Promise<HttpResponse> {
    let response: Response;
    try {
      response = await fetch(request.url, {
        method: request.method,
        headers: request.headers,
        body: request.body,
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      throw new ExternalServiceError('An external service could not be reached.', { host: new URL(request.url).host }, { cause: error });
    }
    return { status: response.status, body: await this.readBody(response) };
  }

  private async readBody(response: Response): Promise<unknown> {
    const text = await response.text();
    if (text.length === 0) {
      return null;
    }
    try {
      return JSON.parse(text) as unknown;
    } catch {
      return text;
    }
  }
}

export function formEncoded(values: Record<string, string>): string {
  return new URLSearchParams(values).toString();
}
