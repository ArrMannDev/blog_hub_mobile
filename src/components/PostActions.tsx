import { useAuth } from "@/contexts/AuthContext";
import { BlogContext } from "@/contexts/BlogContext";
import { useTheme } from "@/hooks/use-theme";
import { ApiError } from "@/lib/api";
import { postCrud } from "@/lib/post-crud";
import type { BlogSummary } from "@/types/blog";
import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { useContext, useRef, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Modal,
    Platform,
    Pressable,
    ScrollView,
    Text,
    View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FormMessage } from "./AuthFields";

export default function PostActions({
  blog,
  onClose,
  onChanged,
}: {
  blog: BlogSummary;
  onClose(): void;
  onChanged(id: string): void;
}) {
  const { user, getAccessToken } = useAuth();
  const cache = useContext(BlogContext);
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [blocked, setBlocked] = useState(blog.publicationBlocked);
  const pending = useRef(false);
  const isPublished = blog.status === "published";

  function close() {
    if (!pending.current) onClose();
  }

  async function update(action: "status" | "delete" | "discard") {
    if (pending.current || (action === "status" && !isPublished && blocked))
      return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      if (!user) throw new Error("Sign in before changing a post.");
      if (action === "discard") {
        await postCrud.discardLocal(user, blog, getAccessToken);
      } else if (action === "delete") {
        try {
          await postCrud.remove(user, blog, getAccessToken);
        } catch (failure) {
          if (!(failure instanceof ApiError) || failure.status !== 404)
            throw failure;
        }
      } else {
        await postCrud.setStatus(
          user,
          blog,
          isPublished ? "draft" : "published",
          getAccessToken,
        );
      }
      cache?.invalidate();
      onChanged(blog.id);
      onClose();
    } catch (failure) {
      if (
        action === "status" &&
        !isPublished &&
        failure instanceof ApiError &&
        failure.status === 403
      )
        setBlocked(true);
      setError(
        failure instanceof Error
          ? failure.message
          : "Couldn't update this post. Please try again.",
      );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  function confirmDelete() {
    if (pending.current) return;
    const message = `Move “${blog.title}” to Trash?`;
    if (Platform.OS === "web") {
      if (window.confirm(message)) void update("delete");
    } else {
      Alert.alert("Move to Trash?", message, [
        { text: "Cancel", style: "cancel" },
        {
          text: "Move to Trash",
          style: "destructive",
          onPress: () => {
            void update("delete");
          },
        },
      ]);
    }
  }

  function confirmDiscard() {
    const message =
      "Discard the changes saved on this phone and load the server copy? Unsynced changes will be lost.";
    if (Platform.OS === "web") {
      if (window.confirm(message)) void update("discard");
    } else
      Alert.alert("Discard local changes?", message, [
        { text: "Keep changes", style: "cancel" },
        {
          text: "Discard local changes",
          style: "destructive",
          onPress: () => {
            void update("discard");
          },
        },
      ]);
  }

  return (
    <Modal visible transparent animationType="slide" onRequestClose={close}>
      <View
        className="flex-1 justify-end"
        style={{ paddingTop: insets.top + 24 }}
      >
        <Pressable
          className="absolute inset-0 bg-black/40"
          accessibilityRole="button"
          accessibilityLabel="Dismiss post options"
          onPress={close}
          disabled={busy}
        />
        <View
          className="max-h-[90%] rounded-t-3xl bg-background px-5 pt-3"
          style={{ paddingBottom: Math.max(insets.bottom, 16) }}
          accessibilityViewIsModal
        >
          <View className="flex-row items-center justify-between gap-3">
            <Text
              className="font-title text-[20px] leading-7 text-foreground"
              accessibilityRole="header"
            >
              Post options
            </Text>
            <Pressable
              className="icon-button"
              accessibilityRole="button"
              accessibilityLabel="Close post options"
              onPress={close}
              disabled={busy}
            >
              <Ionicons
                name="close-outline"
                size={25}
                color={colors.foreground}
              />
            </Pressable>
          </View>
          <Text className="form-description mb-4" numberOfLines={2}>
            {blog.title}
          </Text>
          <ScrollView
            className="grow-0"
            keyboardShouldPersistTaps="handled"
            contentContainerClassName="pb-2"
          >
            {!!error && <FormMessage error>{error}</FormMessage>}
            <View className="rounded-2xl bg-surface px-4">
              <Pressable
                className="post-action-row"
                accessibilityRole="button"
                disabled={busy}
                onPress={() => {
                  if (pending.current) return;
                  onClose();
                  router.push({
                    pathname: "/posts/[id]/edit",
                    params: { id: blog.id },
                  });
                }}
              >
                <Ionicons
                  name="create-outline"
                  size={25}
                  color={colors.foreground}
                />
                <View className="min-w-0 flex-1">
                  <Text className="post-action-label">Edit post</Text>
                  <Text className="form-description">
                    Change your title and content
                  </Text>
                </View>
              </Pressable>
              <Pressable
                className="post-action-row border-t border-border"
                accessibilityRole="button"
                accessibilityState={{
                  disabled: busy || (!isPublished && blocked),
                }}
                disabled={busy || (!isPublished && blocked)}
                onPress={() => {
                  void update("status");
                }}
              >
                <Ionicons
                  name={isPublished ? "document-text-outline" : "globe-outline"}
                  size={25}
                  color={colors.foreground}
                />
                <View className="min-w-0 flex-1">
                  <Text className="post-action-label">
                    {isPublished ? "Move to draft" : "Publish post"}
                  </Text>
                  <Text className="form-description">
                    {!isPublished && blocked
                      ? "Publishing restricted by moderation"
                      : isPublished
                        ? "Remove from public reading"
                        : "Make this post public"}
                  </Text>
                </View>
              </Pressable>
              {(blog.syncStatus === "failed" ||
                blog.syncStatus === "conflict") && (
                <Pressable
                  className="post-action-row border-t border-border"
                  accessibilityRole="button"
                  disabled={busy}
                  onPress={confirmDiscard}
                >
                  <Ionicons
                    name="refresh-outline"
                    size={25}
                    color={colors.foreground}
                  />
                  <View className="min-w-0 flex-1">
                    <Text className="post-action-label">
                      Discard local changes
                    </Text>
                    <Text className="form-description">
                      Review your saved text first. This loads the server copy.
                    </Text>
                  </View>
                </Pressable>
              )}
              <Pressable
                className="post-action-row border-t border-border"
                accessibilityRole="button"
                disabled={busy}
                onPress={confirmDelete}
              >
                <Ionicons
                  name="trash-outline"
                  size={25}
                  color={colors.destructive}
                />
                <View className="min-w-0 flex-1">
                  <Text className="post-action-label text-destructive">
                    Move to Trash
                  </Text>
                  <Text className="form-description">
                    Remove this post from your active posts
                  </Text>
                </View>
              </Pressable>
            </View>
            {busy && (
              <View className="mt-4 items-center">
                <ActivityIndicator
                  color={colors.foreground}
                  accessibilityLabel="Updating your post"
                />
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
