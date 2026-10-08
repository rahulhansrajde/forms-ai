const GOOGLE_RETURN_MESSAGES: Readonly<Record<string, string>> = {
  connected: 'Google connected. You can now create Google Forms and Google Sheets from Forms AI.',
  denied: 'Google access was not granted.',
  error: 'Google could not be connected. Please try again.',
};

export function googleReturnMessage(status: string): string {
  return GOOGLE_RETURN_MESSAGES[status] ?? 'Google could not be connected. Please try again.';
}
