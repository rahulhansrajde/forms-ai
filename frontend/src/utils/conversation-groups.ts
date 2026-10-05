import type { ConversationSummary } from '@forms-ai/contracts';

export type ConversationGroupLabel = 'Today' | 'Yesterday' | 'Previous 7 Days' | 'Older';

export interface ConversationGroup {
  label: ConversationGroupLabel;
  conversations: ConversationSummary[];
}

const GROUP_ORDER: readonly ConversationGroupLabel[] = ['Today', 'Yesterday', 'Previous 7 Days', 'Older'];
const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(moment: Date): number {
  return new Date(moment.getFullYear(), moment.getMonth(), moment.getDate()).getTime();
}

function groupLabelFor(updatedAt: Date, now: Date): ConversationGroupLabel {
  const today = startOfDay(now);
  const day = startOfDay(updatedAt);
  if (day >= today) {
    return 'Today';
  }
  if (day >= today - DAY_MS) {
    return 'Yesterday';
  }
  if (day >= today - 7 * DAY_MS) {
    return 'Previous 7 Days';
  }
  return 'Older';
}

export function groupConversations(conversations: readonly ConversationSummary[], now: Date): ConversationGroup[] {
  const buckets = new Map<ConversationGroupLabel, ConversationSummary[]>();
  for (const conversation of conversations) {
    const label = groupLabelFor(new Date(conversation.updatedAt), now);
    buckets.set(label, [...(buckets.get(label) ?? []), conversation]);
  }
  return GROUP_ORDER.filter((label) => buckets.has(label)).map((label) => ({ label, conversations: buckets.get(label) ?? [] }));
}

export function formatConversationTime(updatedAt: string, now: Date): string {
  const moment = new Date(updatedAt);
  const label = groupLabelFor(moment, now);
  if (label === 'Today' || label === 'Yesterday') {
    return moment.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }
  return moment.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    ...(moment.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }),
  });
}
