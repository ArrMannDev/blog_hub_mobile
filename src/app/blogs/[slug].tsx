import Ionicons from "@expo/vector-icons/Ionicons";
import { Link, router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import ArticleImage from "@/components/ArticleImage";
import AuthorLine from "@/components/AuthorLine";
import MarkdownBody from "@/components/MarkdownBody";
import Screen from "@/components/Screen";
import StateMessage from "@/components/StateMessage";
import { useTheme } from "@/hooks/use-theme";
import { api, ApiError } from "@/lib/api";
import type { Blog } from "@/types/blog";

export default function ArticleScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  return (
    <ArticleReader key={slug} slug={typeof slug === "string" ? slug : ""} />
  );
}

function ArticleReader({ slug }: { slug: string }) {
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
      <View className="screen-header">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back to articles"
          className="icon-button -ml-3"
          onPress={back}
        >
          <Ionicons
            name="arrow-back-outline"
            size={24}
            color={colors.foreground}
          />
        </Pressable>
        <Text className="font-brand text-[16px] text-foreground">BlogHub</Text>
      </View>
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
        <ScrollView
          contentContainerClassName="pb-8"
          showsVerticalScrollIndicator={false}
        >
          <View className="px-5 pt-2 pb-6">
            <View className="flex-row flex-wrap items-center gap-x-2 gap-y-1">
              <Text
                className="reader-title max-w-full shrink"
                accessibilityRole="header"
                selectable
              >
                {blog.title}
              </Text>
              {blog.category ? (
                <Link
                  href={{
                    pathname: "/explore",
                    params: { category: blog.category.slug },
                  }}
                  asChild
                >
                  <Pressable
                    accessibilityRole="link"
                    accessibilityLabel={`Category: ${blog.category.name}`}
                    className="min-h-11 max-w-full justify-center"
                  >
                    <Text className="rounded-full border border-border bg-navigation px-2 py-1 text-[12px] leading-[18px] text-foreground">
                      {blog.category.name}
                    </Text>
                  </Pressable>
                </Link>
              ) : (
                <Text className="rounded-full border border-border bg-navigation px-2 py-1 text-[12px] leading-[18px] text-foreground">
                  {blog.categoryName}
                </Text>
              )}
            </View>
            <View className="mt-3">
              <AuthorLine author={blog.author} date={blog.publishedAt} />
            </View>
          </View>
          <ArticleImage key={blog.coverImageUrl} url={blog.coverImageUrl} />
          <View className="px-5 pt-6">
            <MarkdownBody content={blog.content} />
            {blog.tags.length > 0 && (
              <View className="mt-4 border-t border-border pt-4">
                <Text className="field-label">Tags</Text>
                <View className="flex-row flex-wrap gap-2">
                  {blog.tags.map((tag) => (
                    <Link
                      key={tag.id}
                      href={{
                        pathname: "/explore",
                        params: {
                          ...(blog.category
                            ? { category: blog.category.slug }
                            : {}),
                          tag: tag.slug,
                        },
                      }}
                      asChild
                    >
                      <Pressable
                        accessibilityRole="link"
                        className="min-h-11 justify-center rounded-full bg-navigation px-3"
                      >
                        <Text className="text-[14px] leading-[20px] text-foreground">
                          #{tag.name}
                        </Text>
                      </Pressable>
                    </Link>
                  ))}
                </View>
              </View>
            )}
          </View>
        </ScrollView>
      )}
    </Screen>
  );
}
