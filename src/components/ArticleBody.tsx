import Ionicons from "@expo/vector-icons/Ionicons";
import { Link } from "expo-router";
import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { useTheme } from "@/hooks/use-theme";
import type { Blog } from "@/types/blog";
import ArticleImage from "./ArticleImage";
import AuthorLine from "./AuthorLine";
import MarkdownBody from "./MarkdownBody";

export function ArticleToolbar({
  onBack,
  backLabel,
  action,
}: {
  onBack: () => void;
  backLabel: string;
  action?: ReactNode;
}) {
  const { colors } = useTheme();
  return (
    <View className="screen-header">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={backLabel}
        className="icon-button -ml-3"
        onPress={onBack}
      >
        <Ionicons
          name="arrow-back-outline"
          size={24}
          color={colors.foreground}
        />
      </Pressable>
      <View className="flex-row items-center gap-2">
        <Text className="font-brand text-[16px] text-foreground">BlogHub</Text>
        {action}
      </View>
    </View>
  );
}

export default function ArticleBody({ blog }: { blog: Blog }) {
  return (
    <>
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
    </>
  );
}
