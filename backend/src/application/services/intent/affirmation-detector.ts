const AFFIRMATIONS = new Set([
  'ok',
  'okay',
  'okey',
  'k',
  'kk',
  'sure',
  'yes',
  'yeah',
  'yep',
  'yup',
  'ya',
  'alright',
  'all right',
  'fine',
  'cool',
  'great',
  'nice',
  'perfect',
  'sounds good',
  'looks good',
  'go ahead',
  'do it',
  'please do',
  'yes please',
  'ok sure',
  'okay sure',
  'sure thing',
  'of course',
  'absolutely',
  'definitely',
]);

export class AffirmationDetector {
  isBareAffirmation(message: string): boolean {
    return AFFIRMATIONS.has(this.normalize(message));
  }

  private normalize(message: string): string {
    return message
      .toLowerCase()
      .replace(/[^a-z\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
}
