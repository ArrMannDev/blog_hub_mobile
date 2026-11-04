import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useAuth } from "@/contexts/AuthContext";
import { useComments } from "@/hooks/use-comments";
import { formatDate, initials } from "@/lib/reading";
import type { Comment } from "@/types/discussion";
import ReactionBar from "./ReactionBar";

export interface CommentActions {
  busy: boolean;
  revision: number;
  onReply(comment: Comment): void;
  onEdit(comment: Comment): void;
  onDelete(comment: Comment): void;
}

export default function CommentItem({
  comment,
  ...actions
}: { comment: Comment } & CommentActions) {
  const { user } = useAuth();
  const [expanded, setExpanded] = useState(false);
  const replies = useComments(
    comment.blogId,
    comment.id,
    expanded && !comment.parentId,
    actions.revision,
  );
  const own = user?.id === comment.author.id;
  return (
    <View className="mt-4 flex-row items-start gap-2.5">
      <View
        className="mt-1 h-9 w-9 flex-none items-center justify-center rounded-full bg-navigation"
        accessible={false}
      >
        <Text className="text-[12px] font-semibold text-foreground">
          {initials(comment.author.displayName)}
        </Text>
      </View>
      <View className="min-w-0 flex-1">
        <View className="rounded-2xl bg-surface px-3 py-2.5">
          <Text className="text-[14px] leading-[20px] font-semibold text-foreground">
            {comment.author.displayName}
          </Text>
          <Text
            className="mt-1 text-[15px] leading-[22px] text-foreground"
            selectable
          >
            {comment.content}
          </Text>
        </View>
        <View className="flex-row flex-wrap items-center gap-x-4 px-1">
          <Text className="text-[11px] text-secondary">
            {formatDate(comment.createdAt)}
            {comment.updatedAt !== comment.createdAt ? " · Edited" : ""}
          </Text>
          <Pressable
            accessibilityRole="button"
            className="min-h-11 justify-center"
            disabled={actions.busy}
            onPress={() => actions.onReply(comment)}
          >
            <Text className="text-[12px] font-semibold text-secondary">
              Reply
            </Text>
          </Pressable>
          {own && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Edit comment by ${comment.author.displayName}`}
              className="min-h-11 justify-center"
              disabled={actions.busy}
              onPress={() => actions.onEdit(comment)}
            >
              <Text className="text-[12px] font-semibold text-secondary">
                Edit
              </Text>
            </Pressable>
          )}
          {(own || user?.permissions?.includes("comments.delete")) && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Delete comment by ${comment.author.displayName}`}
              className="min-h-11 justify-center"
              disabled={actions.busy}
              onPress={() => actions.onDelete(comment)}
            >
              <Text className="text-[12px] text-destructive">Delete</Text>
            </Pressable>
          )}
        </View>
        <ReactionBar kind="comments" id={comment.id} />
        {!comment.parentId && (comment.replyCount > 0 || expanded) && (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded }}
            className="text-action"
            onPress={() => setExpanded((value) => !value)}
          >
            <Text className="text-action-label">
              {expanded
                ? "Hide replies"
                : `View replies (${comment.replyCount})`}
            </Text>
          </Pressable>
        )}
        {expanded && (
          <View className="border-l border-border pl-2">
            {replies.items.map((reply) => (
              <CommentItem key={reply.id} comment={reply} {...actions} />
            ))}
            {replies.loading && (
              <Text className="form-description py-2">Loading replies…</Text>
            )}
            {!!replies.error && (
              <View>
                <Text className="form-error">{replies.error}</Text>
                <Pressable
                  accessibilityRole="button"
                  className="text-action"
                  onPress={replies.retry}
                >
                  <Text className="text-action-label">Retry replies</Text>
                </Pressable>
              </View>
            )}
            {replies.hasMore && !replies.error && (
              <Pressable
                accessibilityRole="button"
                className="text-action"
                disabled={replies.loading}
                onPress={replies.loadMore}
              >
                <Text className="text-action-label">More replies</Text>
              </Pressable>
            )}
          </View>
        )}
      </View>
    </View>
  );
}
