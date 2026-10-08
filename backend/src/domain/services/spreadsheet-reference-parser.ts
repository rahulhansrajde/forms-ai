export type SpreadsheetReference = { kind: 'FOUND'; spreadsheetId: string } | { kind: 'INVALID'; reason: string } | { kind: 'NONE' };

const ID_PATTERN = /^[A-Za-z0-9_-]{20,128}$/;
const URL_CANDIDATES = /https?:\/\/[^\s<>"'`]+/gi;
const TRAILING_PUNCTUATION = /[.,;:!?)\]}»”’]+$/;
const EXPLICIT_ID = /\b(?:spreadsheet|sheet)\s*id\b\s*(?:is|:|=|-)?\s*["'“‘`]?([^\s"'”’`,;]+)/i;
const GOOGLE_HOSTS = new Set(['docs.google.com', 'drive.google.com']);
const SHEETS_URL_HINT = 'Open the spreadsheet in Google Sheets and copy the link from the address bar. It looks like https://docs.google.com/spreadsheets/d/…/edit.';

type UrlResult = { kind: 'FOUND'; spreadsheetId: string } | { kind: 'INVALID'; reason: string } | null;

export class SpreadsheetReferenceParser {
  parse(text: string): SpreadsheetReference {
    const urlResults = [...text.matchAll(URL_CANDIDATES)].map((match) => this.fromUrl(match[0].replace(TRAILING_PUNCTUATION, ''))).filter((result) => result !== null);
    const found = [...new Set(urlResults.flatMap((result) => (result.kind === 'FOUND' ? [result.spreadsheetId] : [])))];
    if (found.length > 1) {
      return { kind: 'INVALID', reason: 'That message contains more than one Google Sheets link. Send one link at a time.' };
    }
    if (found.length === 1) {
      return { kind: 'FOUND', spreadsheetId: found[0]! };
    }
    const invalid = urlResults.find((result) => result.kind === 'INVALID');
    if (invalid) {
      return invalid;
    }
    const explicit = EXPLICIT_ID.exec(text)?.[1];
    if (explicit === undefined) {
      return { kind: 'NONE' };
    }
    const candidate = explicit.replace(TRAILING_PUNCTUATION, '');
    return this.isValidId(candidate)
      ? { kind: 'FOUND', spreadsheetId: candidate }
      : { kind: 'INVALID', reason: `“${candidate.slice(0, 60)}” is not a valid Google Sheets spreadsheet ID. ${SHEETS_URL_HINT}` };
  }

  isValidId(value: string): boolean {
    return ID_PATTERN.test(value);
  }

  canonicalUrl(spreadsheetId: string): string {
    if (!this.isValidId(spreadsheetId)) {
      throw new Error('Invalid spreadsheet ID.');
    }
    return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;
  }

  private fromUrl(candidate: string): UrlResult {
    let url: URL;
    try {
      url = new URL(candidate);
    } catch {
      return null;
    }
    if (!GOOGLE_HOSTS.has(url.hostname.toLowerCase())) {
      return null;
    }
    const segments = url.pathname.split('/').filter((segment) => segment.length > 0);
    if (url.hostname.toLowerCase() !== 'docs.google.com' || segments[0] !== 'spreadsheets') {
      return { kind: 'INVALID', reason: `That link is not a Google Sheet. ${SHEETS_URL_HINT}` };
    }
    const marker = segments.indexOf('d');
    const id = marker > 0 ? segments[marker + 1] : undefined;
    if (id === 'e') {
      return { kind: 'INVALID', reason: `That is a “Publish to the web” link, which cannot be edited. ${SHEETS_URL_HINT}` };
    }
    if (id === undefined || !this.isValidId(id)) {
      return { kind: 'INVALID', reason: `That Google Sheets link does not contain a valid spreadsheet ID. ${SHEETS_URL_HINT}` };
    }
    return { kind: 'FOUND', spreadsheetId: id };
  }
}
