const DEFAULT_RETURN_PATH = '/settings';
const SAFE_PATH = /^\/(?!\/)[A-Za-z0-9\-._~/]*$/;

export class ReturnPathPolicy {
  sanitize(candidate: string | undefined): string {
    return candidate && SAFE_PATH.test(candidate) && candidate.length <= 200 ? candidate : DEFAULT_RETURN_PATH;
  }

  withStatus(frontendOrigin: string, returnTo: string, status: 'connected' | 'denied' | 'error'): string {
    const url = new URL(this.sanitize(returnTo), `${frontendOrigin}/`);
    url.searchParams.set('google', status);
    return url.toString();
  }
}
