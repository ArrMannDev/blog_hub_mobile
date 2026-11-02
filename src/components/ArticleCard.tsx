import { Link } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { MarkdownIt } from "react-native-markdown-display";
import type { BlogSummary } from "@/types/blog";
import { formatDate, initials } from "@/lib/reading";
import ArticleImage from "./ArticleImage";

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
}: {
  blog: BlogSummary;
  editable?: boolean;
}) {
  const editRoute = {
    pathname: "/posts/[id]/edit",
    params: { id: blog.id },
  } as const;
  const isDraft = editable && blog.status === "draft";
  return (
    <View
      className={editable ? "flex-none border-b border-border" : "flex-none"}
    >
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
          className={editable ? "article-row border-b-0 pb-2" : "article-row"}
        >
          <View className="article-avatar" accessible={false}>
            <Text className="article-avatar-text">
              {initials(blog.author.displayName)}
            </Text>
          </View>
          <View className="article-copy">
            <View className="article-byline">
              <Text className="article-author" numberOfLines={1}>
                {blog.author.displayName}
              </Text>
              <Text className="article-date">
                {formatDate(isDraft ? blog.updatedAt : blog.publishedAt)}
              </Text>
            </View>
            <View className="article-heading">
              <Text className="article-title" numberOfLines={2}>
                {blog.title}
              </Text>
              <Text className="article-topic" numberOfLines={1}>
                {blog.categoryName}
              </Text>
            </View>
            <Text className="article-excerpt" numberOfLines={3}>
              {excerptText(blog.excerpt)}
            </Text>
            <ArticleImage
              key={blog.coverImageUrl}
              url={blog.coverImageUrl}
              feed
            />
          </View>
        </Pressable>
      </Link>
      {editable && (
        <View className="ml-[68px] mr-4 flex-row flex-wrap items-center justify-between gap-2 pb-3">
          <Text className="post-status">
            {isDraft ? "Draft · Only you" : "Published"}
          </Text>
          <Link href={editRoute} asChild>
            <Pressable
              accessibilityRole="link"
              accessibilityLabel={`Edit ${blog.title}`}
              className="text-action px-2"
            >
              <Text className="text-action-label">Edit post</Text>
            </Pressable>
          </Link>
          {blog.publicationBlocked && (
            <Text className="form-error w-full">
              Publishing restricted by moderation. You can still edit this
              draft.
            </Text>
          )}
        </View>
      )}
    </View>
  );
}
