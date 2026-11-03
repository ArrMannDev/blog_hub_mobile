import { useAuth } from "@/contexts/AuthContext";
import { usePrivatePage } from "@/hooks/use-private-page";
import { activityApi } from "@/lib/activity-api";
import { actionLabels } from "@/lib/history";
import { formatDate } from "@/lib/reading";
import { Link, Redirect } from "expo-router";
import { useRef, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { FormMessage } from "./AuthFields";
import PrivateActivityList from "./PrivateActivityList";
import Screen from "./Screen";

export default function AccountActivity({
  kind,
}: {
  kind: "notifications" | "history";
}) {
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
  return kind === "notifications" ? (
    <Notifications key={user.id} />
  ) : (
    <History key={user.id} />
  );
}

function Notifications() {
  const feed = usePrivatePage(activityApi.notifications);
  const { getAccessToken } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);

  async function read(id?: string) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      const token = await getAccessToken();
      if (id) await activityApi.markRead(id, token);
      else await activityApi.markAllRead(token);
      feed.refresh();
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Couldn't mark notifications as read.",
      );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return (
    <PrivateActivityList
      title="Notifications"
      description="Moderation notices about your posts."
      empty="You're all caught up"
      feed={feed}
      renderItem={({ item }) => (
        <View className="border-b border-border py-4">
          <View className="flex-row items-center gap-2">
            {!item.readAt && (
              <View className="h-2 w-2 rounded-full bg-foreground" />
            )}
            <Text className="min-w-0 flex-1 text-[16px] leading-6 text-foreground">
              {item.blogTitle}
            </Text>
          </View>
          <Text className="mt-2 text-[15px] leading-5 text-foreground">
            {item.message}
          </Text>
          <Text className="mt-2 text-[13px] leading-5 text-secondary">
            {formatDate(item.createdAt)} · {item.readAt ? "Read" : "Unread"}
          </Text>
          <View className="flex-row flex-wrap gap-4">
            {item.type !== "post_deleted" && (
              <Link
                href={{
                  pathname: "/posts/[id]/edit",
                  params: { id: item.blogId },
                }}
                asChild
              >
                <Pressable accessibilityRole="link" className="text-action">
                  <Text className="text-action-label">Open post</Text>
                </Pressable>
              </Link>
            )}
            {!item.readAt && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Mark ${item.blogTitle} as read`}
                className="text-action"
                disabled={busy}
                onPress={() => {
                  void read(item.id);
                }}
              >
                <Text className="text-action-label">Mark as read</Text>
              </Pressable>
            )}
          </View>
        </View>
      )}
    >
      <View className="mt-3">
        <Text accessibilityLiveRegion="polite" className="form-description">
          {feed.unreadCount} unread
        </Text>
        {feed.unreadCount > 0 && (
          <Pressable
            accessibilityRole="button"
            className="text-action"
            disabled={busy}
            onPress={() => {
              void read();
            }}
          >
            <Text className="text-action-label">
              {busy ? "Updating…" : "Mark all as read"}
            </Text>
          </Pressable>
        )}
        {!!error && <FormMessage error>{error}</FormMessage>}
      </View>
    </PrivateActivityList>
  );
}

function History() {
  const feed = usePrivatePage(activityApi.history);
  return (
    <PrivateActivityList
      title="Post history"
      description="Changes you made to posts. New posts appear here after their first change. Admin moderation notices appear in Notifications."
      empty="No changes recorded yet"
      feed={feed}
      renderItem={({ item }) => (
        <Link
          href={{ pathname: "/history/[id]", params: { id: item.id } }}
          asChild
        >
          <Pressable
            accessibilityRole="link"
            className="border-b border-border py-4"
          >
            <Text className="text-[13px] leading-5 text-secondary">
              {actionLabels[item.action]} · {formatDate(item.createdAt)}
            </Text>
            <Text className="mt-1 font-title text-[19px] leading-6.75 text-foreground">
              {item.blogTitle}
            </Text>
            <Text className="text-action-label mt-2">View changes</Text>
          </Pressable>
        </Link>
      )}
    />
  );
}
