import Ionicons from "@expo/vector-icons/Ionicons";
import { useTheme } from "@/hooks/use-theme";
import { Link } from "expo-router";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { MarkdownIt } from "react-native-markdown-display";
import type { BlogSummary } from "@/types/blog";
import { formatDate, initials } from "@/lib/reading";
import ArticleImage from "./ArticleImage";
import AuthorProfileSheet from "./AuthorProfileSheet";

const parser = MarkdownIt({ html: false });

function excerptText(markdown: string): string {
  return parser
    .parse(markdown, {})
    .map((token) => {
      if (!token.children) return token.type === "fence" ? token.content : "";
      return token.children
        .map((child) =>
          ["text", "code_inline"].includes(child.type)
            ? child.content
            : child.type === "softbreak"
              ? " "
              : "",
        )
        .join("");
    })
    .join(" ")
    .replace(/\s+/gu, " ")
    .trim();
}

export default function ArticleCard({
  blog,
  editable = false,
  onManage,
}: {
  blog: BlogSummary;
  editable?: boolean;
  onManage?: () => void;
}) {
  const { colors } = useTheme();
  const [profileOpen, setProfileOpen] = useState(false);
  const editRoute = {
    pathname: "/posts/[id]/edit",
    params: { id: blog.id },
  } as const;
  const isDraft = editable && blog.status === "draft";
  return (
    <View
      className={
        editable ? "relative flex-none border-b border-border" : "flex-none"
      }
    >
      <View className={editable ? "article-row border-b-0" : "article-row"}>
        <Pressable
          className="min-h-11 min-w-11 flex-none items-center justify-center"
          accessibilityRole="button"
          accessibilityLabel={`View ${blog.author.displayName}'s profile`}
          onPress={() => setProfileOpen(true)}
        >
          <View className="article-avatar" accessible={false}>
            <Text className="article-avatar-text">
              {initials(blog.author.displayName)}
            </Text>
          </View>
        </Pressable>
        <View className="article-copy">
          <View
            className={onManage ? "article-byline pr-10" : "article-byline"}
          >
            <Pressable
              className="min-h-11 shrink justify-center"
              accessibilityRole="button"
              accessibilityLabel={`View ${blog.author.displayName}'s profile`}
              onPress={() => setProfileOpen(true)}
            >
              <Text className="article-author" numberOfLines={1}>
                {blog.author.displayName}
              </Text>
            </Pressable>
            <Text className="article-date">
              {formatDate(isDraft ? blog.updatedAt : blog.publishedAt)}
            </Text>
          </View>
          <Link
            href={
              isDraft
                ? editRoute
                : { pathname: "/blogs/[slug]", params: { slug: blog.slug } }
            }
            asChild
          >
            <Pressable
              accessibilityRole="link"
              accessibilityLabel={
                isDraft
                  ? `Edit draft ${blog.title}`
                  : `Read ${blog.title} by ${blog.author.displayName}`
              }
              className="active:opacity-60"
            >
              <View className="article-heading">
                <Text className="article-title" numberOfLines={2}>
                  {blog.title}
                </Text>
                <Text className="article-topic" numberOfLines={1}>
                  {blog.categoryName}
                </Text>
              </View>
              {editable && (
                <View className="mt-2 items-start">
                  <Text className="post-status">
                    {isDraft ? "Draft · Only you" : "Published"}
                  </Text>
                  {blog.publicationBlocked && (
                    <Text className="form-error mt-2">
                      Publishing restricted by moderation. You can still edit
                      this draft.
                    </Text>
                  )}
                </View>
              )}
              <Text className="article-excerpt" numberOfLines={3}>
                {excerptText(blog.excerpt)}
              </Text>
              <ArticleImage
                key={blog.coverImageUrl}
                url={blog.coverImageUrl}
                feed
              />
            </Pressable>
          </Link>
        </View>
      </View>
      {editable && onManage && (
        <Pressable
          className="icon-button absolute right-2 top-3"
          accessibilityRole="button"
          accessibilityLabel={`Manage ${blog.title}`}
          onPress={onManage}
        >
          <Ionicons
            name="ellipsis-horizontal"
            size={23}
            color={colors.secondary}
          />
        </Pressable>
      )}
      {profileOpen && (
        <AuthorProfileSheet
          author={blog.author}
          onClose={() => setProfileOpen(false)}
        />
      )}
    </View>
  );
}
