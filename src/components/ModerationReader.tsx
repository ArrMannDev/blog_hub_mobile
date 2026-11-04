import Ionicons from "@expo/vector-icons/Ionicons";
import { useState } from "react";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/hooks/use-theme";
import type { Blog } from "@/types/blog";
import ActionButton from "./ActionButton";
import ArticleBody, { ArticleToolbar } from "./ArticleBody";
import ArticleDiscussion from "./ArticleDiscussion";
import Screen from "./Screen";

export default function ModerationReader({
  blog,
  busy,
  error,
  onBack,
  onTogglePublication,
  onTrash,
}: {
  blog: Blog;
  busy: boolean;
  error: string;
  onBack: () => void;
  onTogglePublication: () => void;
  onTrash?: () => void;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [sheet, setSheet] = useState<"actions" | "confirm-trash" | null>(null);
  const close = () => setSheet(null);
  const published = blog.status === "published";

  return (
    <Screen edges={["top", "bottom", "left", "right"]}>
      <ArticleToolbar
        onBack={onBack}
        backLabel="Back to moderate posts"
        action={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open moderation actions"
            accessibilityState={{ expanded: sheet !== null }}
            className="icon-button"
            disabled={busy}
            onPress={() => setSheet("actions")}
          >
            <Ionicons
              name="ellipsis-horizontal"
              size={24}
              color={colors.foreground}
            />
          </Pressable>
        }
      />
      {sheet && (
        <Modal visible transparent animationType="slide" onRequestClose={close}>
          <View
            className="flex-1 justify-end"
            style={{ paddingTop: insets.top + 24 }}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Dismiss moderation actions"
              className="absolute inset-0 bg-black/40"
              onPress={close}
            />
            <View
              accessibilityViewIsModal
              className="max-h-[90%] rounded-t-3xl bg-background px-5 pt-3"
              style={{ paddingBottom: Math.max(insets.bottom, 16) }}
            >
              <View className="mb-2 h-1 w-10 self-center rounded-full bg-control-border" />
              <View className="flex-row items-center justify-between gap-3">
                <Text
                  className="font-title text-xl text-foreground"
                  accessibilityRole="header"
                >
                  {sheet === "confirm-trash"
                    ? "Move to Trash?"
                    : "Post options"}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Close post options"
                  className="icon-button"
                  onPress={close}
                >
                  <Ionicons
                    name="close-outline"
                    size={24}
                    color={colors.foreground}
                  />
                </Pressable>
              </View>
              <ScrollView className="grow-0" contentContainerClassName="pb-2">
                {sheet === "confirm-trash" ? (
                  <View className="rounded-2xl bg-surface px-4 py-3">
                    <Text className="form-description">
                      The post will be removed from public view.
                    </Text>
                    <ActionButton
                      label="Cancel"
                      onPress={() => setSheet("actions")}
                      disabled={busy}
                    />
                    <ActionButton
                      label="Move to Trash"
                      disabled={busy}
                      destructive
                      onPress={() => {
                        close();
                        onTrash?.();
                      }}
                    />
                  </View>
                ) : (
                  <View className="gap-2">
                    <Pressable
                      accessibilityRole="button"
                      className="post-action-row rounded-2xl bg-surface px-4"
                      disabled={busy}
                      onPress={() => {
                        close();
                        onTogglePublication();
                      }}
                    >
                      <Ionicons
                        name={
                          published
                            ? "lock-closed-outline"
                            : "lock-open-outline"
                        }
                        size={24}
                        color={colors.foreground}
                      />
                      <Text className="post-action-label flex-1">
                        {published
                          ? "Unpublish and block author publishing"
                          : "Publish and clear publishing block"}
                      </Text>
                    </Pressable>
                    {onTrash && (
                      <Pressable
                        accessibilityRole="button"
                        className="post-action-row rounded-2xl bg-surface px-4"
                        disabled={busy}
                        onPress={() => setSheet("confirm-trash")}
                      >
                        <Ionicons
                          name="trash-outline"
                          size={24}
                          color={colors.destructive}
                        />
                        <Text className="flex-1 text-base font-semibold text-destructive">
                          Move to Trash
                        </Text>
                      </Pressable>
                    )}
                  </View>
                )}
              </ScrollView>
            </View>
          </View>
        </Modal>
      )}
      {!!error && (
        <Text accessibilityRole="alert" className="form-error mx-5 mb-3">
          {error}
        </Text>
      )}
      {busy && (
        <Text className="form-description mx-5 mb-3">Updating post…</Text>
      )}
      {published ? (
        <ArticleDiscussion blogId={blog.id} openComments={false}>
          <ArticleBody blog={blog} />
        </ArticleDiscussion>
      ) : (
        <ScrollView className="flex-1" contentContainerClassName="pb-6">
          <ArticleBody blog={blog} />
        </ScrollView>
      )}
    </Screen>
  );
}
