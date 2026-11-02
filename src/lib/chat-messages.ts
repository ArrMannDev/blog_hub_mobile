import type { ChatMessage, LocalMessage, MessageDeleted } from "@/types/chat";

export const isUuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

export function validateMessage(content: string) {
  if (!content.trim() || [...content].length > 2000)
    throw new Error("Write a message between 1 and 2,000 characters.");
}

export function isChatMessage(value: unknown): value is ChatMessage {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return (
    ["id", "conversationId", "senderId", "clientMessageId", "createdAt"].every(
      (key) => typeof item[key] === "string" && !!item[key],
    ) &&
    typeof item.isRead === "boolean" &&
    (item.content === null || typeof item.content === "string") &&
    (item.deletedAt === null || typeof item.deletedAt === "string")
  );
}

export function mergeMessages(
  current: LocalMessage[],
  incoming: LocalMessage[],
  deleted: ReadonlyMap<string, MessageDeleted>,
) {
  const messages = new Map<string, LocalMessage>();
  for (const item of [...current, ...incoming]) {
    const key = `${item.senderId}:${item.clientMessageId}`;
    const previous = messages.get(key);
    // A delayed history page or acknowledgement must never resurrect deleted text.
    const tombstone =
      deleted.get(item.id) ||
      (previous?.deletedAt ? { deletedAt: previous.deletedAt } : null);
    messages.set(
      key,
      tombstone
        ? {
            ...item,
            content: null,
            deletedAt: tombstone.deletedAt,
            delivery: undefined,
            error: undefined,
          }
        : { ...item, isRead: item.isRead || previous?.isRead === true },
    );
  }
  return [...messages.values()].sort(
    (a, b) =>
      b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id),
  );
}
