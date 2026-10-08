const SINGLE_QUOTES = /[‘’‚‛′´ʼ`]/g;
const DOUBLE_QUOTES = /[“”„‟″]/g;
const POSSESSIVE = /(?:'s|')$/i;
const SURROUNDING_QUOTES = /^["']+|["']+$/g;

export class TextNormalizer {
  clean(text: string): string {
    return text.normalize('NFKC').replace(SINGLE_QUOTES, "'").replace(DOUBLE_QUOTES, '"').replace(/\s+/g, ' ').trim();
  }

  unquote(text: string): string {
    return this.clean(text).replace(SURROUNDING_QUOTES, '').trim();
  }

  stripPossessive(text: string): string {
    return this.unquote(text).replace(POSSESSIVE, '').trim();
  }

  comparable(text: string): string {
    return this.unquote(text).toLowerCase();
  }

  words(text: string): string[] {
    return this.comparable(text)
      .replace(/[^\p{L}\p{N}@.]+/gu, ' ')
      .replace(/(?<![\p{L}\p{N}])\.|\.(?![\p{L}\p{N}])/gu, ' ')
      .split(' ')
      .filter((word) => word.length > 0);
  }
}
