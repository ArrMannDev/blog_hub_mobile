import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/hooks/use-theme";
import { useReactions } from "@/hooks/use-reactions";

export default function ReactionBar({
  kind,
  id,
  commentCount,
  onComment,
}: {
  kind: "blogs" | "comments";
  id: string;
  commentCount?: number;
  onComment?: () => void;
}) {
  const { user, isRestoring } = useAuth();
  const { colors } = useTheme();
  const reaction = useReactions(kind, id);
  return (
    <View>
      <View className="flex-row flex-wrap items-center gap-x-4">
        {(["like", "dislike"] as const).map((type) => {
          const selected = reaction.myReaction === type;
          const disabled =
            isRestoring || reaction.busy || (!!user && !reaction.ready);
          return (
            <Pressable
              key={type}
              accessibilityRole="button"
              accessibilityLabel={`${type === "like" ? "Like" : "Dislike"}${selected ? ", selected; tap to remove" : ""}`}
              accessibilityState={{ selected, disabled, busy: reaction.busy }}
              disabled={disabled}
              className="min-h-11 flex-row items-center gap-2 py-2 disabled:opacity-50"
              onPress={() =>
                user
                  ? void reaction.react(type)
                  : router.push({
                      pathname: "/auth/[action]",
                      params: { action: "sign-in" },
                    })
              }
            >
              <Ionicons
                name={
                  type === "like"
                    ? selected
                      ? "thumbs-up"
                      : "thumbs-up-outline"
                    : selected
                      ? "thumbs-down"
                      : "thumbs-down-outline"
                }
                size={kind === "blogs" ? 23 : 17}
                color={selected ? colors.foreground : colors.secondary}
              />
              <Text
                className={
                  selected
                    ? "text-[13px] font-semibold text-foreground"
                    : "text-[13px] text-secondary"
                }
              >
                {reaction.ready
                  ? type === "like"
                    ? reaction.likeCount
                    : reaction.dislikeCount
                  : "—"}
              </Text>
            </Pressable>
          );
        })}
        {onComment && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Write a comment"
            className="min-h-11 flex-row items-center gap-2 py-2"
            onPress={onComment}
          >
            <Ionicons
              name="chatbubble-outline"
              size={23}
              color={colors.secondary}
            />
            <Text className="text-[13px] text-secondary">
              {commentCount ?? "Comment"}
            </Text>
          </Pressable>
        )}
      </View>
      {!!reaction.error && (
        <View className="mb-2">
          <Text accessibilityLiveRegion="polite" className="form-error">
            {reaction.error}
          </Text>
          <Pressable
            accessibilityRole="button"
            className="text-action"
            disabled={reaction.busy}
            onPress={() => void reaction.refresh()}
          >
            <Text className="text-action-label">Refresh reactions</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}
