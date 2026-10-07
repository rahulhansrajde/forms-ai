const STRUCTURAL_KEYWORDS = new Set(['type', 'properties', 'required', 'items', 'enum', 'anyOf', 'description']);

export class BedrockSchemaAdapter {
  adapt(schema: Record<string, unknown>): Record<string, unknown> {
    return this.adaptNode(schema) as Record<string, unknown>;
  }

  private adaptNode(node: unknown): unknown {
    if (Array.isArray(node)) {
      return node.map((entry) => this.adaptNode(entry));
    }
    if (node === null || typeof node !== 'object') {
      return node;
    }
    const adapted: Record<string, unknown> = {};
    for (const [keyword, value] of Object.entries(node)) {
      if (keyword === 'const') {
        adapted.enum = [value];
      } else if (keyword === 'oneOf') {
        adapted.anyOf = this.adaptNode(value);
      } else if (keyword === 'properties' && value !== null && typeof value === 'object') {
        adapted.properties = Object.fromEntries(Object.entries(value).map(([name, child]) => [name, this.adaptNode(child)]));
      } else if (STRUCTURAL_KEYWORDS.has(keyword)) {
        adapted[keyword] = this.adaptNode(value);
      }
    }
    return adapted;
  }
}
