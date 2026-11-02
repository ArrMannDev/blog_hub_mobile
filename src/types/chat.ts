export interface ChatMessage {
  id: string;
  conversationId: string;
  senderId: string;
  clientMessageId: string;
  content: string | null;
  deletedAt: string | null;
  isRead: boolean;
  createdAt: string;
}

export interface LocalMessage extends ChatMessage {
  delivery?: "sending" | "failed";
  error?: string;
}

export interface Conversation {
  id: string;
  otherUser: { id: string; displayName: string };
  lastMessage: ChatMessage | null;
  unreadCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface MessageDeleted {
  messageId: string;
  conversationId: string;
  deletedAt: string;
}
export interface ReadReceipt {
  conversationId: string;
  readerId: string;
  updated: number;
}
export interface TypingEvent {
  conversationId: string;
  userId: string;
}
export type ChatAck<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } };
export type ChatEvent =
  | "connected"
  | "message:new"
  | "message:deleted"
  | "message:read"
  | "typing:start"
  | "typing:stop";
