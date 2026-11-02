import { Redirect, router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator } from "react-native";
import PostComposer from "@/components/PostComposer";
import FormScreen from "@/components/FormScreen";
import StateMessage from "@/components/StateMessage";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/hooks/use-theme";
import { ApiError } from "@/lib/api";
import { myBlogsApi } from "@/lib/my-blogs-api";
import type { Blog } from "@/types/blog";

export default function EditPostScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, isRestoring } = useAuth();
  const { colors } = useTheme();
  if (isRestoring)
    return (
      <FormScreen title="Edit post" description="Checking your session…">
        <ActivityIndicator color={colors.foreground} />
      </FormScreen>
    );
  if (!user) return <Redirect href="/(tabs)/profile" />;
  if (
    typeof id !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
  )
    return <Redirect href="/(tabs)/profile" />;
  return <OwnedPost key={`${user.id}:${id}`} id={id} userId={user.id} />;
}

function OwnedPost({ id, userId }: { id: string; userId: string }) {
  const { getAccessToken } = useAuth();
  const { colors } = useTheme();
  const [blog, setBlog] = useState<Blog | null>(null);
  const [error, setError] = useState("");
  const [unavailable, setUnavailable] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const token = await getAccessToken();
        if (controller.signal.aborted) return;
        const result = await myBlogsApi.detail(id, token, controller.signal);
        if (controller.signal.aborted) return;
        if (result.author.id !== userId) throw new ApiError(403);
        setBlog(result);
      } catch (failure) {
        if (controller.signal.aborted) return;
        setUnavailable(
          failure instanceof ApiError && [403, 404].includes(failure.status),
        );
        setError(
          failure instanceof Error
            ? failure.message
            : "Couldn't open your post. Please try again.",
        );
      }
    }
    void load();
    return () => controller.abort();
  }, [getAccessToken, id, userId, attempt]);

  if (blog) return <PostComposer blog={blog} />;
  return (
    <FormScreen title="Edit post" description="Make changes to your article.">
      {error ? (
        <StateMessage
          title={
            unavailable
              ? "This post isn't available"
              : "Couldn't open your post"
          }
          description={
            unavailable
              ? "It may have been removed, or it belongs to another account."
              : error
          }
          action={unavailable ? "Back to profile" : "Try again"}
          onAction={
            unavailable
              ? () => router.replace("/(tabs)/profile")
              : () => {
                  setError("");
                  setAttempt((value) => value + 1);
                }
          }
        />
      ) : (
        <ActivityIndicator
          color={colors.foreground}
          accessibilityLabel="Loading your post"
        />
      )}
    </FormScreen>
  );
}
