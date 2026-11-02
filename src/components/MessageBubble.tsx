import { Pressable, Text, View } from "react-native";
import type { LocalMessage } from "@/types/chat";

export default function MessageBubble({
  message,
  userId,
  onRetry,
  onDelete,
}: {
  message: LocalMessage;
  userId: string;
  onRetry(): void;
  onDelete(): void;
}) {
  const own = message.senderId === userId;
  const canDelete = own && !message.delivery && !message.deletedAt;
  const date = new Date(message.createdAt);
  const time = Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
  return (
    <View className={`px-5 py-1.5 ${own ? "items-end" : "items-start"}`}>
      <Pressable
        disabled={!canDelete}
        accessibilityRole={canDelete ? "button" : undefined}
        accessibilityLabel={
          canDelete ? `${message.content}. Message options` : undefined
        }
        accessibilityHint={
          canDelete ? "Hold to delete your message" : undefined
        }
        accessibilityActions={
          canDelete ? [{ name: "delete", label: "Delete message" }] : undefined
        }
        onAccessibilityAction={(event) => {
          if (event.nativeEvent.actionName === "delete" && canDelete)
            onDelete();
        }}
        onLongPress={canDelete ? onDelete : undefined}
        className={`max-w-[85%] rounded-2xl px-4 py-3 ${own ? "rounded-br-sm bg-navigation" : "rounded-bl-sm border border-border bg-surface"}`}
      >
        <Text
          selectable
          className={`text-[16px] leading-[24px] ${message.deletedAt ? "italic text-secondary" : "text-foreground"}`}
        >
          {message.deletedAt ? "Message deleted" : message.content}
        </Text>
      </Pressable>
      <Text className="mt-1 text-[11px] leading-[17px] text-secondary">
        {time}
        {own && !message.deletedAt
          ? ` · ${message.delivery === "sending" ? "Sending…" : message.delivery === "failed" ? "Not confirmed" : message.isRead ? "Read" : "Sent"}`
          : ""}
      </Text>
      {own && message.delivery === "failed" && !message.deletedAt && (
        <View className="max-w-[85%] items-end">
          <Text className="mt-1 text-[12px] leading-[18px] text-destructive">
            {message.error}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Retry this message"
            className="text-action"
            onPress={onRetry}
          >
            <Text className="text-action-label">Retry</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}
