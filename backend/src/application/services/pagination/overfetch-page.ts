export interface OverfetchedPage<T> {
  items: T[];
  nextCursor: string | null;
}

export function pageFromOverfetch<T>(rows: readonly T[], limit: number, cursorOf: (last: T) => string): OverfetchedPage<T> {
  const items = rows.slice(0, limit);
  const last = items[items.length - 1];
  return { items, nextCursor: rows.length > limit && last !== undefined ? cursorOf(last) : null };
}
