import { Link, Redirect } from "expo-router";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { useAuth } from "@/contexts/AuthContext";
import { useChat } from "@/contexts/ChatContext";
import { useConversations } from "@/hooks/use-conversations";
import { formatDate, initials } from "@/lib/reading";
import PrivateActivityList from "@/components/PrivateActivityList";
import Screen from "@/components/Screen";

export default function InboxScreen() {
  const { user, isRestoring } = useAuth();
  if (isRestoring)
    return (
      <Screen>
        <ActivityIndicator accessibilityLabel="Checking session" />
      </Screen>
    );
  if (!user)
    return (
      <Redirect
        href={{ pathname: "/auth/[action]", params: { action: "sign-in" } }}
      />
    );
  return <Inbox key={user.id} />;
}

function Inbox() {
  const feed = useConversations();
  const { status, reconnect, deletedMessages } = useChat();
  return (
    <PrivateActivityList
      title="Inbox"
      description="Tap an author's avatar or name on a post, then Send message."
      empty="No conversations yet"
      feed={feed}
      renderItem={({ item }) => (
        <Link
          href={{
            pathname: "/chats/[id]",
            params: { id: item.id, name: item.otherUser.displayName },
          }}
          asChild
        >
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={`${item.otherUser.displayName}, ${item.unreadCount} unread messages`}
            className="flex-row items-center gap-3 border-b border-border py-4"
          >
            <View className="author-avatar" accessible={false}>
              <Text className="author-initials">
                {initials(item.otherUser.displayName)}
              </Text>
            </View>
            <View className="min-w-0 flex-1">
              <Text
                className="text-[16px] leading-[24px] font-semibold text-foreground"
                numberOfLines={1}
              >
                {item.otherUser.displayName}
              </Text>
              <Text
                className="mt-1 text-[14px] leading-[21px] text-secondary"
                numberOfLines={2}
              >
                {item.lastMessage
                  ? item.lastMessage.deletedAt ||
                    deletedMessages[item.lastMessage.id]
                    ? "Message deleted"
                    : item.lastMessage.content
                  : "Say hello"}
              </Text>
              <Text className="mt-1 text-[12px] leading-[18px] text-secondary">
                {formatDate(item.lastMessage?.createdAt ?? item.createdAt)}
              </Text>
            </View>
            {item.unreadCount > 0 && (
              <View className="min-h-7 min-w-7 items-center justify-center rounded-full bg-navigation px-2">
                <Text className="text-[12px] leading-[18px] font-semibold text-foreground">
                  {item.unreadCount}
                </Text>
              </View>
            )}
          </Pressable>
        </Link>
      )}
    >
      {status !== "connected" && (
        <Pressable
          accessibilityRole="button"
          className="text-action mt-2"
          onPress={reconnect}
        >
          <Text className="text-action-label">
            {status === "connecting"
              ? "Connecting…"
              : "Chat offline · Reconnect"}
          </Text>
        </Pressable>
      )}
    </PrivateActivityList>
  );
}
