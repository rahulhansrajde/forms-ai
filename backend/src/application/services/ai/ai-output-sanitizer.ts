import { isChoiceQuestionType, isQuestionType } from '@forms-ai/contracts';

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export class AIOutputSanitizer {
  sanitize(output: unknown): unknown {
    if (Array.isArray(output)) {
      return output.map((entry) => this.sanitize(entry));
    }
    if (!isObject(output)) {
      return output;
    }
    const cleaned: JsonObject = {};
    for (const [key, value] of Object.entries(output)) {
      if (value !== null) {
        cleaned[key] = this.sanitize(value);
      }
    }
    return this.dropPlaceholderFields(cleaned);
  }

  private dropPlaceholderFields(node: JsonObject): JsonObject {
    const type = node.type;
    const describesQuestion = isQuestionType(type) && typeof node.title === 'string';
    if (Array.isArray(node.options) && (node.options.length === 0 || (describesQuestion && !isChoiceQuestionType(type)))) {
      delete node.options;
    }
    if (isObject(node.scale) && ((describesQuestion && type !== 'LINEAR_SCALE') || this.isPlaceholderScale(node.scale))) {
      delete node.scale;
    }
    return node;
  }

  private isPlaceholderScale(scale: JsonObject): boolean {
    return typeof scale.max !== 'number' || scale.max < 2;
  }
}
