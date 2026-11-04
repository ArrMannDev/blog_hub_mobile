import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import {
  useEffect,
  useRef,
  useState,
  type PropsWithChildren,
  type ComponentRef,
} from "react";
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/contexts/AuthContext";
import { useComments } from "@/hooks/use-comments";
import { useTheme } from "@/hooks/use-theme";
import { ApiError } from "@/lib/api";
import { commentContent, discussionApi } from "@/lib/discussion-api";
import type { Comment } from "@/types/discussion";
import CommentItem from "./CommentItem";
import ReactionBar from "./ReactionBar";

type Target = { mode: "reply" | "edit"; comment: Comment };

export default function ArticleDiscussion(
  props: PropsWithChildren<{ blogId: string; openComments?: boolean }>,
) {
  const { user } = useAuth();
  return (
    <Discussion key={`${props.blogId}:${user?.id ?? "guest"}`} {...props} />
  );
}

function Discussion({
  blogId,
  children,
  openComments = false,
}: PropsWithChildren<{ blogId: string; openComments?: boolean }>) {
  const { user, getAccessToken, isRestoring } = useAuth();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [offset, setOffset] = useState(0);
  const [revision, setRevision] = useState(0);
  const comments = useComments(blogId, undefined, true, revision);
  const [text, setText] = useState("");
  const [target, setTarget] = useState<Target | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [uncertain, setUncertain] = useState(false);
  const pending = useRef(false);
  const mounted = useRef(true);
  const input = useRef<ComponentRef<typeof TextInput>>(null);
  const list = useRef<FlatList<Comment>>(null);
  const commentsOffset = useRef<number | null>(null);
  const jumped = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const signIn = () =>
    router.push({ pathname: "/auth/[action]", params: { action: "sign-in" } });
  function compose(next?: Target) {
    if (pending.current || isRestoring || uncertain) return;
    if (!user) {
      signIn();
      return;
    }
    if (next?.mode === "edit" && next.comment.author.id !== user.id) return;
    if (
      text &&
      (target?.comment.id !== next?.comment.id || target?.mode !== next?.mode)
    ) {
      setError(
        "Send or cancel your current text before starting another comment.",
      );
      return;
    }
    setTarget(next ?? null);
    setError("");
    setNotice("");
    if (
      next?.mode === "edit" &&
      (target?.mode !== "edit" || target.comment.id !== next.comment.id)
    )
      setText(next.comment.content);
    input.current?.focus();
  }
  function cancel() {
    if (pending.current) return;
    setTarget(null);
    setText("");
    setError("");
    setUncertain(false);
  }
  async function send() {
    if (pending.current || uncertain || isRestoring) return;
    if (!user) {
      signIn();
      return;
    }
    let content: string;
    try {
      content = commentContent(text);
    } catch (failure) {
      setError((failure as Error).message);
      return;
    }
    pending.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    let submitted = false;
    try {
      const token = await getAccessToken();
      if (!mounted.current) return;
      submitted = true;
      await discussionApi.save(
        blogId,
        content,
        token,
        target?.mode === "edit"
          ? { editId: target.comment.id }
          : target
            ? { parentId: target.comment.parentId ?? target.comment.id }
            : {},
      );
      if (!mounted.current) return;
      setText("");
      setTarget(null);
      setRevision((value) => value + 1);
      setNotice(
        target?.mode === "edit"
          ? "Comment updated."
          : target
            ? "Reply sent."
            : "Comment sent.",
      );
    } catch (failure) {
      if (!mounted.current) return;
      const unknown = !(failure instanceof ApiError) || failure.status >= 500;
      if (submitted && unknown && target?.mode !== "edit") {
        setUncertain(true);
        setError(
          "Couldn't confirm whether your comment was sent. Refresh comments to check before starting another. Your text is kept here.",
        );
      } else
        setError(
          failure instanceof Error
            ? failure.message
            : "Couldn't save your comment.",
        );
    } finally {
      pending.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  function remove(comment: Comment) {
    if (
      !user ||
      pending.current ||
      (comment.author.id !== user.id && !user.permissions?.includes("comments.delete"))
    )
      return;
    const run = async () => {
      if (pending.current || !mounted.current) return;
      pending.current = true;
      setBusy(true);
      setError("");
      try {
        const token = await getAccessToken();
        if (!mounted.current) return;
        await discussionApi.remove(comment.id, token);
        if (!mounted.current) return;
        if (
          target?.comment.id === comment.id ||
          target?.comment.parentId === comment.id
        ) {
          setTarget(null);
          setText("");
          setUncertain(false);
        }
        setRevision((value) => value + 1);
        setNotice("Comment deleted.");
      } catch (failure) {
        if (mounted.current)
          setError(
            failure instanceof Error
              ? failure.message
              : "Couldn't delete this comment.",
          );
      } finally {
        pending.current = false;
        if (mounted.current) setBusy(false);
      }
    };
    const description = comment.parentId
      ? "Delete this reply permanently?"
      : "Delete this comment and all its replies permanently?";
    if (Platform.OS === "web") {
      if (window.confirm(description)) void run();
    } else
      Alert.alert("Delete comment?", description, [
        { text: "Keep", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            void run();
          },
        },
      ]);
  }
  return (
    <KeyboardAvoidingView
      className="flex-1"
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={insets.top + offset}
      onLayout={(event) => setOffset(event.nativeEvent.layout.y)}
    >
      <FlatList
        ref={list}
        onContentSizeChange={() => {
          if (
            openComments &&
            !jumped.current &&
            commentsOffset.current !== null
          ) {
            list.current?.scrollToOffset({
              offset: commentsOffset.current,
              animated: false,
            });
            jumped.current = true;
          }
        }}
        data={comments.items}
        keyExtractor={(comment) => comment.id}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
        contentContainerClassName="pb-5"
        initialNumToRender={6}
        ListHeaderComponent={
          <>
            {children}
            <View className="mx-5 mt-5 border-y border-border py-1">
              <ReactionBar
                kind="blogs"
                id={blogId}
                commentCount={comments.total}
                onComment={() => compose()}
              />
            </View>
            <View
              className="mx-5 mt-5 flex-row items-center justify-between"
              onLayout={(event) => {
                commentsOffset.current = event.nativeEvent.layout.y;
              }}
            >
              <Text
                className="text-[17px] font-semibold text-foreground"
                accessibilityRole="header"
              >
                Comments
              </Text>
              <Text className="text-[12px] text-secondary">Oldest first</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              className="text-action mx-5"
              disabled={comments.loading || busy}
              onPress={() => setRevision((value) => value + 1)}
            >
              <Text className="text-action-label">Refresh comments</Text>
            </Pressable>
          </>
        }
        renderItem={({ item }) => (
          <View className="px-5">
            <CommentItem
              comment={item}
              busy={busy}
              revision={revision}
              onReply={(comment) => compose({ mode: "reply", comment })}
              onEdit={(comment) => compose({ mode: "edit", comment })}
              onDelete={remove}
            />
          </View>
        )}
        ListFooterComponent={
          <View className="px-5">
            {comments.loading && (
              <Text className="form-description py-4">Loading comments…</Text>
            )}
            {!!comments.error && (
              <View className="mt-3">
                <Text className="form-error">{comments.error}</Text>
                <Pressable
                  accessibilityRole="button"
                  className="text-action"
                  onPress={comments.retry}
                >
                  <Text className="text-action-label">Retry comments</Text>
                </Pressable>
              </View>
            )}
            {!comments.loading &&
              !comments.error &&
              comments.items.length === 0 && (
                <Text className="form-description py-4">
                  Start the conversation. Be the first to comment.
                </Text>
              )}
            {comments.hasMore && !comments.error && (
              <Pressable
                accessibilityRole="button"
                className="text-action"
                disabled={comments.loading}
                onPress={comments.loadMore}
              >
                <Text className="text-action-label">More comments</Text>
              </Pressable>
            )}
          </View>
        }
      />
      <View className="border-t border-border bg-background px-5 pt-2 pb-2">
        {!!notice && (
          <Text
            accessibilityLiveRegion="polite"
            className="form-description mb-2"
          >
            {notice}
          </Text>
        )}
        {!!error && (
          <Text accessibilityLiveRegion="polite" className="form-error mb-2">
            {error}
          </Text>
        )}
        {(target || uncertain || !!text) && (
          <View className="flex-row items-center justify-between gap-2">
            <Text
              className="flex-1 text-[12px] text-secondary"
              numberOfLines={1}
            >
              {target?.mode === "edit"
                ? "Editing your comment"
                : target
                  ? `Replying to ${target.comment.author.displayName}`
                  : "New comment"}
            </Text>
            <Pressable
              accessibilityRole="button"
              className="min-h-11 justify-center"
              disabled={busy}
              onPress={cancel}
            >
              <Text className="text-[13px] font-semibold text-secondary">
                {uncertain ? "Discard text" : "Cancel"}
              </Text>
            </Pressable>
          </View>
        )}
        {user ? (
          <View className="flex-row items-end gap-2">
            <TextInput
              ref={input}
              accessibilityLabel={
                target?.mode === "edit" ? "Edit comment" : "Write a comment"
              }
              placeholder={
                target
                  ? target.mode === "edit"
                    ? "Edit comment…"
                    : "Write a reply…"
                  : "Write a comment…"
              }
              placeholderTextColor={colors.secondary}
              selectionColor={colors.focus}
              multiline
              maxLength={4000}
              editable={!busy && !uncertain}
              value={text}
              onChangeText={setText}
              className="min-h-11 max-h-28 flex-1 rounded-2xl border border-border bg-surface px-4 py-3 text-[15px] leading-[21px] text-foreground"
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                target?.mode === "edit" ? "Save comment" : "Send comment"
              }
              accessibilityState={{
                disabled: busy || uncertain || !text.trim(),
                busy,
              }}
              disabled={busy || uncertain || isRestoring || !text.trim()}
              className="h-11 w-11 items-center justify-center rounded-full bg-navigation disabled:opacity-50"
              onPress={() => void send()}
            >
              <Ionicons
                name={target?.mode === "edit" ? "checkmark" : "arrow-up"}
                size={23}
                color={colors.foreground}
              />
            </Pressable>
          </View>
        ) : (
          <Pressable
            accessibilityRole="button"
            className="min-h-12 justify-center rounded-full bg-surface px-4"
            disabled={isRestoring}
            onPress={signIn}
          >
            <Text className="text-[14px] text-secondary">
              Sign in to write a comment
            </Text>
          </Pressable>
        )}
        {user && !!text && (
          <Text className="mt-1 text-right text-[11px] text-secondary">
            {[...text.trim()].length}/2,000
          </Text>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}
