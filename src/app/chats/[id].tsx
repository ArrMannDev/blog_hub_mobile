import Ionicons from "@expo/vector-icons/Ionicons";
import {
  Redirect,
  router,
  useFocusEffect,
  useLocalSearchParams,
} from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import Screen from "@/components/Screen";
import StateMessage from "@/components/StateMessage";
import MessageBubble from "@/components/MessageBubble";
import { useAuth } from "@/contexts/AuthContext";
import { useChat } from "@/contexts/ChatContext";
import { useMessages } from "@/hooks/use-messages";
import { useTheme } from "@/hooks/use-theme";
import { isUuid } from "@/lib/chat-messages";
import type { LocalMessage } from "@/types/chat";

export default function ConversationScreen() {
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();
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
  if (typeof id !== "string" || !isUuid(id))
    return <Redirect href="/chats/inbox" />;
  return (
    <Thread
      key={`${user.id}:${id}`}
      id={id}
      name={typeof name === "string" ? name : "Conversation"}
      userId={user.id}
    />
  );
}

function Thread({
  id,
  name,
  userId,
}: {
  id: string;
  name: string;
  userId: string;
}) {
  const { colors } = useTheme();
  const feed = useMessages(id);
  const {
    status,
    reconnect,
    sendMessage,
    retryMessage,
    deleteMessage,
    markRead,
    setTyping,
    typing,
    drafts,
    setDraft,
  } = useChat();
  const draft = drafts[id] ?? "";
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState(false);
  const pendingDelete = useRef(false);
  const list = useRef<FlatList<LocalMessage>>(null);
  const nearLatest = useRef(true);
  const typingStop = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const unreadKey = feed.messages
    .filter(
      (item) => item.senderId !== userId && !item.deletedAt && !item.isRead,
    )
    .map((item) => item.id)
    .join();
  const newestId = feed.messages[0]?.id;

  useEffect(() => {
    if (nearLatest.current)
      list.current?.scrollToOffset({ offset: 0, animated: false });
  }, [newestId]);
  useFocusEffect(
    useCallback(() => {
      if (status !== "connected" || !unreadKey || feed.unavailable) return;
      const timer = setTimeout(() => {
        void markRead(id).catch(() =>
          setError("Couldn't confirm read status. Pull down to refresh."),
        );
      }, 400);
      return () => clearTimeout(timer);
    }, [status, unreadKey, id, markRead, feed.unavailable]),
  );
  useFocusEffect(
    useCallback(
      () => () => {
        clearTimeout(typingStop.current);
        setTyping(id, false);
      },
      [id, setTyping],
    ),
  );

  function changeDraft(value: string) {
    setDraft(id, value);
    setError("");
    setTyping(id, !!value.trim());
    clearTimeout(typingStop.current);
    typingStop.current = setTimeout(() => setTyping(id, false), 1800);
  }

  function send() {
    try {
      sendMessage(id, draft);
      setDraft(id, "");
      setError("");
      clearTimeout(typingStop.current);
      setTyping(id, false);
      list.current?.scrollToOffset({ offset: 0, animated: true });
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Couldn't send this message.",
      );
    }
  }

  async function remove(message: LocalMessage) {
    if (pendingDelete.current) return;
    pendingDelete.current = true;
    setDeleting(true);
    setError("");
    try {
      await deleteMessage(message);
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Couldn't delete this message. Refresh before trying again.",
      );
    } finally {
      pendingDelete.current = false;
      setDeleting(false);
    }
  }

  function confirmDelete(message: LocalMessage) {
    if (
      pendingDelete.current ||
      message.senderId !== userId ||
      message.delivery ||
      message.deletedAt
    )
      return;
    const description =
      "Delete your message for everyone? A deleted-message placeholder will remain.";
    if (Platform.OS === "web") {
      if (window.confirm(description)) void remove(message);
    } else
      Alert.alert("Delete message?", description, [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            void remove(message);
          },
        },
      ]);
  }

  return (
    <Screen edges={["top", "bottom", "left", "right"]}>
      <View className="screen-header gap-2">
        <Pressable
          className="icon-button -ml-3"
          accessibilityRole="button"
          accessibilityLabel="Back to Inbox"
          onPress={() =>
            router.canGoBack() ? router.back() : router.replace("/chats/inbox")
          }
        >
          <Ionicons
            name="arrow-back-outline"
            size={24}
            color={colors.foreground}
          />
        </Pressable>
        <View className="min-w-0 flex-1">
          <Text
            numberOfLines={1}
            className="text-[18px] leading-[25px] font-semibold text-foreground"
          >
            {name}
          </Text>
          <Text
            accessibilityLiveRegion="polite"
            className="text-[12px] leading-[18px] text-secondary"
          >
            {typing[id] && status === "connected"
              ? "Typing…"
              : status === "connected"
                ? "Connected"
                : status === "connecting"
                  ? "Connecting…"
                  : "Offline"}
          </Text>
        </View>
        {status !== "connected" && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Reconnect chat"
            className="icon-button"
            onPress={reconnect}
          >
            <Ionicons
              name="refresh-outline"
              size={22}
              color={colors.foreground}
            />
          </Pressable>
        )}
      </View>
      {feed.unavailable ? (
        <StateMessage
          title="Conversation unavailable"
          description="This conversation may no longer exist, or your account cannot access it."
          action="Back to Inbox"
          onAction={() => router.replace("/chats/inbox")}
        />
      ) : (
        <KeyboardAvoidingView
          className="flex-1"
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <FlatList
            ref={list}
            className="flex-1"
            inverted
            data={feed.messages}
            keyExtractor={(item) => `${item.senderId}:${item.clientMessageId}`}
            renderItem={({ item }) => (
              <MessageBubble
                message={item}
                userId={userId}
                onRetry={() => retryMessage(item)}
                onDelete={() => confirmDelete(item)}
              />
            )}
            onEndReached={feed.loadOlder}
            onEndReachedThreshold={0.3}
            scrollEventThrottle={100}
            onScroll={(event) => {
              nearLatest.current = event.nativeEvent.contentOffset.y < 80;
            }}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            contentContainerClassName="py-3"
            ListEmptyComponent={
              !feed.loading && !feed.error ? (
                <View>
                  <StateMessage
                    title="Say hello"
                    description="Start this conversation with a message."
                  />
                </View>
              ) : undefined
            }
            ListFooterComponent={
              feed.loading ? (
                <ActivityIndicator
                  className="py-4"
                  color={colors.foreground}
                  accessibilityLabel="Loading messages"
                />
              ) : feed.error ? (
                <View>
                  <StateMessage
                    title="Couldn't load messages"
                    description={feed.error}
                    action="Try again"
                    onAction={feed.retry}
                  />
                </View>
              ) : undefined
            }
          />
          <Pressable
            accessibilityRole="button"
            className="text-action self-center"
            onPress={feed.refresh}
          >
            <Text className="text-[12px] leading-[18px] text-secondary">
              Refresh messages
            </Text>
          </Pressable>
          {!!error && (
            <Text accessibilityRole="alert" className="form-error px-5 pb-2">
              {error}
            </Text>
          )}
          {deleting && (
            <ActivityIndicator
              className="pb-2"
              color={colors.foreground}
              accessibilityLabel="Deleting message"
            />
          )}
          <View className="border-t border-border px-4 pt-3 pb-2">
            <View className="flex-row items-end gap-2">
              <TextInput
                accessibilityLabel="Message"
                accessibilityHint="Up to 2,000 characters"
                multiline
                maxLength={4000}
                value={draft}
                onChangeText={changeDraft}
                placeholder="Write a message…"
                placeholderTextColor={colors.secondary}
                selectionColor={colors.focus}
                className="min-h-12 max-h-32 flex-1 rounded-2xl border border-control-border bg-surface px-4 py-3 text-[16px] leading-[24px] text-foreground"
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Send message"
                disabled={!draft.trim() || [...draft].length > 2000}
                className="h-12 w-12 items-center justify-center rounded-full bg-foreground disabled:opacity-40"
                onPress={send}
              >
                <Ionicons name="arrow-up" size={24} color={colors.background} />
              </Pressable>
            </View>
            <Text className="mt-1 text-right text-[11px] leading-[16px] text-secondary">
              {[...draft].length}/2000 · Hold your sent message to delete
            </Text>
          </View>
        </KeyboardAvoidingView>
      )}
    </Screen>
  );
}
