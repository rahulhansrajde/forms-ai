const GOOGLE_RETURN_MESSAGES: Readonly<Record<string, string>> = {
  connected: 'Google Forms connected. You can now create Google Forms from your drafts.',
  denied: 'Google Forms access was not granted.',
  error: 'Google Forms could not be connected. Please try again.',
};

export function googleReturnMessage(status: string): string {
  return GOOGLE_RETURN_MESSAGES[status] ?? 'Google Forms could not be connected. Please try again.';
}
