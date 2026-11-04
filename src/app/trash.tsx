import { Redirect, router, useLocalSearchParams } from "expo-router";
import { useCallback, useRef, useState } from "react";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Alert, Platform, Pressable, Text, View } from "react-native";
import ActionButton from "@/components/ActionButton";
import FormScreen from "@/components/FormScreen";
import { useTheme } from "@/hooks/use-theme";
import { useAuth } from "@/contexts/AuthContext";
import { usePrivatePage } from "@/hooks/use-private-page";
import { ApiError, request } from "@/lib/api";
import { notifyPostChange } from "@/lib/post-events";
import { formatDate, initials } from "@/lib/reading";
import type { PrivatePage } from "@/types/activity";
import type { Blog, BlogSummary } from "@/types/blog";

type TrashedPost = BlogSummary & {
  deletedAt: string;
  canRestore: boolean;
  canPermanentlyDelete: boolean;
};

export default function TrashRoute() {
  const { scope } = useLocalSearchParams<{ scope?: string }>();
  const { user, isRestoring } = useAuth();
  if (isRestoring) return null;
  if (
    !user ||
    (scope === "admin" && !user.permissions?.includes("blogs.moderate"))
  )
    return <Redirect href="/(tabs)/profile" />;
  return <Trash key={user.id + scope} admin={scope === "admin"} />;
}

function Trash({ admin }: { admin: boolean }) {
  const { user, getAccessToken, checkSession } = useAuth();
  const { colors } = useTheme();
  const base = admin ? "/admin/blog-trash" : "/me/blog-trash";
  const page = usePrivatePage(
    useCallback(
      (page: number, token: string, signal?: AbortSignal) =>
        request<PrivatePage<TrashedPost>>(
          base + "?page=" + page + "&limit=10",
          {
            headers: { Authorization: "Bearer " + token },
            signal,
          },
        ),
      [base],
    ),
  );
  const [restored, setRestored] = useState<Blog | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);

  const canRestore = (item: TrashedPost) =>
    item.canRestore && (!admin || user?.permissions?.includes("blogs.restore"));
  const canPurge = (item: TrashedPost) =>
    item.canPermanentlyDelete &&
    (!admin || user?.permissions?.includes("blogs.purge"));

  async function act(item: TrashedPost, action: "restore" | "purge") {
    if (
      pending.current ||
      !user ||
      (action === "restore" ? !canRestore(item) : !canPurge(item))
    )
      return;
    pending.current = true;
    setBusy(true);
    setError("");
    setRestored(null);
    try {
      const headers = { Authorization: "Bearer " + (await getAccessToken()) };
      const path = base + "/" + encodeURIComponent(item.id);
      if (action === "restore")
        setRestored(
          await request<Blog>(path + "/restore", { method: "POST", headers }),
        );
      else await request<void>(path, { method: "DELETE", headers });
      page.refresh();
      notifyPostChange(user.id, true);
      notifyPostChange(user.id);
    } catch (failure) {
      if (failure instanceof ApiError && failure.status === 401) {
        setError("Please try again after your session is refreshed.");
        await checkSession().catch(() => {});
      } else if (failure instanceof ApiError && failure.status === 403) {
        setError("You don’t have permission for this action.");
        await checkSession().catch(() => {});
      } else if (
        failure instanceof ApiError &&
        [404, 409].includes(failure.status)
      ) {
        page.refresh();
        setError("This post changed or is no longer in Trash.");
      } else
        setError(
          failure instanceof Error ? failure.message : "Couldn’t update Trash.",
        );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  function purge(item: TrashedPost) {
    const message =
      "Permanently delete this post and its comments and reactions? This cannot be undone.";
    if (Platform.OS === "web") {
      if (window.confirm(message)) void act(item, "purge");
    } else
      Alert.alert("Delete permanently?", message, [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete permanently",
          style: "destructive",
          onPress: () => void act(item, "purge"),
        },
      ]);
  }

  return (
    <FormScreen
      title={admin ? "Admin Trash" : "My Trash"}
      description="Restore a post as a draft or delete it permanently."
      titleAction={
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Reload Trash"
          className="icon-button"
          onPress={page.refresh}
          disabled={busy || page.loading}
        >
          <Ionicons name="reload-outline" size={23} color={colors.foreground} />
        </Pressable>
      }
    >
      {!!error && (
        <Text accessibilityRole="alert" className="form-error mb-3">
          {error}
        </Text>
      )}
      {busy && <Text className="form-description">Working…</Text>}
      {restored && (
        <>
          <Text className="form-description">Restored as a draft.</Text>
          {restored.author.id === user?.id && (
            <ActionButton
              label={"Open draft editor"}
              onPress={() =>
                router.push({
                  pathname: "/posts/[id]/edit",
                  params: { id: restored.id },
                })
              }
              disabled={busy}
            />
          )}
        </>
      )}
      {page.items.map((item) => (
        <View
          key={item.id}
          className="mb-4 rounded-xl border border-border bg-surface p-4"
        >
          <View className="mb-3 flex-row items-center gap-3">
            <View
              className="size-9 items-center justify-center rounded-full bg-navigation"
              accessible={false}
            >
              <Text className="font-title text-sm text-foreground">
                {initials(item.author.displayName)}
              </Text>
            </View>
            <View className="min-w-0 flex-1">
              <Text className="font-semibold text-foreground">
                {item.author.displayName}
              </Text>
              <Text className="form-description">
                Trashed {formatDate(item.deletedAt)}
              </Text>
            </View>
          </View>
          <Text
            className="font-title text-lg text-foreground"
            accessibilityRole="header"
          >
            {item.title}
          </Text>
          {!!item.excerpt && (
            <Text className="form-description mt-1">{item.excerpt}</Text>
          )}
          {!!item.category?.name && (
            <Text className="mt-2 self-start rounded-full bg-navigation px-2 py-1 text-xs text-foreground">
              {item.category.name}
            </Text>
          )}
          {!admin && !item.canRestore && (
            <Text className="form-description mt-2">
              Only an authorized admin can restore this post.
            </Text>
          )}
          {(canRestore(item) || canPurge(item)) && (
            <View className="mt-3 flex-row flex-wrap gap-x-4 border-t border-border">
              {canRestore(item) && (
                <ActionButton
                  label="Restore as draft"
                  onPress={() => void act(item, "restore")}
                  disabled={busy || page.loading}
                />
              )}
              {canPurge(item) && (
                <ActionButton
                  label="Delete permanently"
                  onPress={() => purge(item)}
                  disabled={busy || page.loading}
                  destructive
                />
              )}
            </View>
          )}
        </View>
      ))}
      {page.loading && <Text className="form-description">Loading Trash…</Text>}
      {!page.loading && !page.error && !page.items.length && (
        <Text className="form-description">Trash is empty.</Text>
      )}
      {!!page.error && (
        <Text accessibilityRole="alert" className="form-error">
          {page.error}
        </Text>
      )}
      {page.hasMore && !page.error && (
        <ActionButton
          label="Load more"
          onPress={page.loadMore}
          disabled={page.loading || busy}
        />
      )}
    </FormScreen>
  );
}
