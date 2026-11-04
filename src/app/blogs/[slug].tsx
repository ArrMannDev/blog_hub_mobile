import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import ArticleBody, { ArticleToolbar } from "@/components/ArticleBody";
import ArticleDiscussion from "@/components/ArticleDiscussion";
import Screen from "@/components/Screen";
import StateMessage from "@/components/StateMessage";
import { useTheme } from "@/hooks/use-theme";
import { api, ApiError } from "@/lib/api";
import type { Blog } from "@/types/blog";

export default function ArticleScreen() {
  const { slug, comments } = useLocalSearchParams<{
    slug: string;
    comments?: string;
  }>();
  return (
    <ArticleReader
      key={`${slug}:${comments ?? ""}`}
      slug={typeof slug === "string" ? slug : ""}
      openComments={comments === "1"}
    />
  );
}

function ArticleReader({
  slug,
  openComments,
}: {
  slug: string;
  openComments: boolean;
}) {
  const { colors } = useTheme();
  const [blog, setBlog] = useState<Blog | null>(null);
  const [error, setError] = useState<"unavailable" | "network" | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    api
      .blog(slug, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) {
          setBlog(result);
          setError(null);
        }
      })
      .catch((failure: unknown) => {
        if (!controller.signal.aborted)
          setError(
            failure instanceof ApiError && failure.status === 404
              ? "unavailable"
              : "network",
          );
      });
    return () => controller.abort();
  }, [slug, attempt]);

  function back() {
    if (router.canGoBack()) router.back();
    else router.replace("/(tabs)");
  }

  return (
    <Screen edges={["top", "bottom", "left", "right"]}>
      <ArticleToolbar onBack={back} backLabel="Back to articles" />
      {error ? (
        <StateMessage
          title={
            error === "unavailable"
              ? "This article isn't available"
              : "Couldn't open this article"
          }
          description={
            error === "unavailable"
              ? "It may have been unpublished or removed. There's more to discover."
              : "Check your connection and try again."
          }
          action={error === "unavailable" ? "Back to browsing" : "Try again"}
          onAction={
            error === "unavailable"
              ? back
              : () => {
                  setError(null);
                  setAttempt((value) => value + 1);
                }
          }
        />
      ) : !blog ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator
            accessibilityLabel="Loading article"
            color={colors.foreground}
          />
        </View>
      ) : (
        <ArticleDiscussion blogId={blog.id} openComments={openComments}>
          <ArticleBody blog={blog} />
        </ArticleDiscussion>
      )}
    </Screen>
  );
}
