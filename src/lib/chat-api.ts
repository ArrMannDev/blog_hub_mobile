import { request } from "./api";
import type { Conversation, ChatMessage } from "@/types/chat";
import type { PrivatePage } from "@/types/activity";

export const chatApi = {
  conversations: (page: number, token: string, signal?: AbortSignal) =>
    request<PrivatePage<Conversation>>(
      `/chat/conversations?page=${page}&limit=20`,
      { headers: { Authorization: `Bearer ${token}` }, signal },
    ),
  start: (recipientId: string, token: string) =>
    request<Conversation>("/chat/conversations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ recipientId }),
    }),
  messages: (id: string, page: number, token: string, signal?: AbortSignal) =>
    request<PrivatePage<ChatMessage>>(
      `/chat/conversations/${encodeURIComponent(id)}/messages?page=${page}&limit=20`,
      { headers: { Authorization: `Bearer ${token}` }, signal },
    ),
};
