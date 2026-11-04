import { Link, Redirect, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import FormScreen from "@/components/FormScreen";
import StateMessage from "@/components/StateMessage";
import MarkdownBody from "@/components/MarkdownBody";
import ArticleImage from "@/components/ArticleImage";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/hooks/use-theme";
import { activityApi } from "@/lib/activity-api";
import { actionLabels, historyFields, historyValue } from "@/lib/history";
import { formatDate } from "@/lib/reading";
import type { PostActionDetail } from "@/types/activity";

export default function PostHistoryDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, isRestoring } = useAuth();
  if (isRestoring)
    return (
      <FormScreen title="Post history" description="Checking session…">
        <ActivityIndicator />
      </FormScreen>
    );
  if (!user)
    return (
      <Redirect
        href={{ pathname: "/auth/[action]", params: { action: "sign-in" } }}
      />
    );
  if (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id))
    return <Redirect href="/history" />;
  return <HistoryDetail key={`${user.id}:${id}`} id={id} userId={user.id} />;
}

function HistoryDetail({ id, userId }: { id: string; userId: string }) {
  const { getAccessToken } = useAuth();
  const { colors } = useTheme();
  const [record, setRecord] = useState<PostActionDetail | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const token = await getAccessToken();
        if (controller.signal.aborted) return;
        const result = await activityApi.action(id, token, controller.signal);
        if (controller.signal.aborted) return;
        if (result.actorId !== userId)
          throw new Error(
            "This history entry isn't available for your account.",
          );
        setRecord(result);
      } catch (failure) {
        if (!controller.signal.aborted)
          setError(
            failure instanceof Error
              ? failure.message
              : "Couldn't open this history entry.",
          );
      }
    }
    void load();
    return () => controller.abort();
  }, [getAccessToken, id, userId, attempt]);

  return (
    <FormScreen
      title={record ? actionLabels[record.action] : "Post history"}
      description={
        record
          ? `${record.blogTitle} · ${formatDate(record.createdAt)}`
          : "Review a recorded change to a post."
      }
    >
      {record ? (
        <>
          {Object.entries(record.changes).map(([field, change]) => (
            <View
              key={field}
              className="mb-5 rounded-xl border border-border bg-surface p-4"
            >
              <Text className="field-label">
                {historyFields[field] || field}
              </Text>
              <ChangeValue label="Before" value={change.old} />
              <ChangeValue label="After" value={change.new} />
            </View>
          ))}
          {record.snapshot && (
            <View>
              <Text className="field-label">Before deletion</Text>
              <Text className="form-description mb-4">
                This saved copy is read-only. The deleted post cannot be
                restored here.
              </Text>
              <Text className="reader-title mb-3">{record.snapshot.title}</Text>
              <Text className="form-description mb-3">
                {record.snapshot.categoryName} · {record.snapshot.status}
                {record.snapshot.tags.length
                  ? ` · ${record.snapshot.tags.map((tag) => `#${tag.name}`).join(", ")}`
                  : ""}
              </Text>
              <ArticleImage url={record.snapshot.coverImageUrl} />
              <View className="mt-4">
                <MarkdownBody content={record.snapshot.content} />
              </View>
            </View>
          )}
          {!record.snapshot && Object.keys(record.changes).length === 0 && (
            <Text className="form-description">
              No field details are available for this action.
            </Text>
          )}
          {!["deleted", "trashed", "permanently_deleted"].includes(
            record.action,
          ) &&
            record.postAuthorId === userId && (
              <Link
                href={{
                  pathname: "/posts/[id]/edit",
                  params: { id: record.blogId },
                }}
                asChild
              >
                <Pressable
                  accessibilityRole="link"
                  className="secondary-button mt-4"
                >
                  <Text className="text-[15px] leading-[22px] font-semibold text-foreground">
                    Open current post
                  </Text>
                </Pressable>
              </Link>
            )}
        </>
      ) : error ? (
        <StateMessage
          title="History unavailable"
          description={error}
          action="Try again"
          onAction={() => {
            setError("");
            setAttempt((value) => value + 1);
          }}
        />
      ) : (
        <ActivityIndicator
          color={colors.foreground}
          accessibilityLabel="Loading post history"
        />
      )}
    </FormScreen>
  );
}

function ChangeValue({ label, value }: { label: string; value: unknown }) {
  const [expanded, setExpanded] = useState(false);
  const text = historyValue(value);
  return (
    <View className="mt-3">
      <Text className="text-[12px] leading-[18px] font-semibold text-secondary">
        {label}
      </Text>
      <Text
        selectable
        numberOfLines={expanded ? undefined : 8}
        className="mt-1 text-[15px] leading-[23px] text-foreground"
      >
        {text}
      </Text>
      {(text.length > 200 || text.includes("\n")) && (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          className="text-action"
          onPress={() => setExpanded((current) => !current)}
        >
          <Text className="text-action-label">
            {expanded ? "Show less" : "Show full value"}
          </Text>
        </Pressable>
      )}
    </View>
  );
}
