import { request } from "./api";
import type { Conversation, ChatMessage } from "@/types/chat";
import type { PrivatePage } from "@/types/activity";

export async function countUnreadMessages(token: string, signal: AbortSignal) {
  const counts = new Map<string, number>();
  let page = 1;

  while (!signal.aborted) {
    const result = await chatApi.conversations(page, token, signal);
    for (const conversation of result.items) {
      counts.set(conversation.id, conversation.unreadCount);
    }
    if (page >= result.totalPages) {
      break;
    }
    page += 1;
  }

  return [...counts.values()].reduce((total, count) => {
    return total + count;
  }, 0);
}

export const chatApi = {
  conversations: (page: number, token: string, signal?: AbortSignal) => {
    return request<PrivatePage<Conversation>>(
      `/chat/conversations?page=${page}&limit=20`,
      { headers: { Authorization: `Bearer ${token}` }, signal },
    );
  },
  start: (recipientId: string, token: string) => {
    return request<Conversation>("/chat/conversations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ recipientId }),
    });
  },
  messages: (id: string, page: number, token: string, signal?: AbortSignal) => {
    return request<PrivatePage<ChatMessage>>(
      `/chat/conversations/${encodeURIComponent(id)}/messages?page=${page}&limit=20`,
      { headers: { Authorization: `Bearer ${token}` }, signal },
    );
  },
};
