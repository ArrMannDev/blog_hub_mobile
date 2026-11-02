import { Link, Redirect } from "expo-router";
import { useContext, useRef, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import BlogEditor from "@/components/BlogEditor";
import { FormMessage } from "@/components/AuthFields";
import FormScreen from "@/components/FormScreen";
import { useAuth } from "@/contexts/AuthContext";
import { BlogContext } from "@/contexts/BlogContext";
import { useTags } from "@/hooks/use-tags";
import { useCategories } from "@/hooks/use-categories";
import { useTheme } from "@/hooks/use-theme";
import { ApiError } from "@/lib/api";
import { myBlogsApi } from "@/lib/my-blogs-api";
import type { BlogEdits } from "@/types/blog";

export default function NewPostScreen() {
  const { user, isRestoring } = useAuth();
  const { colors } = useTheme();
  if (isRestoring)
    return (
      <FormScreen title="Create post" description="Checking your session…">
        <ActivityIndicator color={colors.foreground} />
      </FormScreen>
    );
  if (!user)
    return (
      <Redirect
        href={{ pathname: "/auth/[action]", params: { action: "sign-in" } }}
      />
    );
  return <Composer key={user.id} />;
}

function Composer() {
  const { getAccessToken } = useAuth();
  const cache = useContext(BlogContext);
  const { categories, loading, error, retry } = useCategories();
  const [categoryId, setCategoryId] = useState("");
  const [tagIds, setTagIds] = useState<string[]>([]);
  const {
    tags,
    loading: tagsLoading,
    error: tagsError,
    retry: retryTags,
  } = useTags(categoryId);
  const [uncertain, setUncertain] = useState(false);
  const createdId = useRef<string | null>(null);

  async function save(edits: BlogEdits) {
    if (uncertain)
      throw new Error("Check your Profile before creating another post.");
    if (
      !createdId.current &&
      !categories.some((category) => category.id === categoryId)
    )
      throw new Error("Choose a category for your post.");
    if (
      !createdId.current &&
      (tagIds.length > 10 ||
        tagIds.some(
          (id) =>
            !tags.some((tag) => tag.id === id && tag.categoryId === categoryId),
        ))
    )
      throw new Error("Choose tags from the selected category.");
    const token = await getAccessToken();
    if (createdId.current) {
      const result = await myBlogsApi.update(createdId.current, edits, token);
      cache?.invalidate();
      return result;
    }
    try {
      const result = await myBlogsApi.create(
        { ...edits, categoryId, tagIds, status: edits.status ?? "draft" },
        token,
      );
      if (!result || typeof result.id !== "string" || !result.id)
        throw new Error("Missing post confirmation");
      // Later saves must update this post, never submit another creation request.
      createdId.current = result.id;
      cache?.invalidate();
      return result;
    } catch (failure) {
      if (!(failure instanceof ApiError) || failure.status >= 500) {
        setUncertain(true);
        throw new Error(
          "We couldn't confirm whether your post was saved. Check your Profile before creating another one.",
        );
      }
      throw failure;
    }
  }

  return (
    <BlogEditor onSave={save} disabled={uncertain}>
      {(saving) => (
        <View className="mb-5">
          <Text className="field-label">Category · Required</Text>
          <Text className="form-description mb-3">
            Choose one main topic for your post.
          </Text>
          {loading ? (
            <Text className="form-description">Loading categories…</Text>
          ) : error ? (
            <Pressable
              accessibilityRole="button"
              className="text-action"
              onPress={retry}
              disabled={saving}
            >
              <Text className="text-action-label">
                Retry loading categories
              </Text>
            </Pressable>
          ) : categories.length === 0 ? (
            <FormMessage>
              No categories are available yet. A category is required to create
              a post.
            </FormMessage>
          ) : (
            <View
              className="flex-row flex-wrap gap-2"
              accessibilityRole="radiogroup"
            >
              {categories.map((category) => (
                <Pressable
                  key={category.id}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: categoryId === category.id }}
                  disabled={uncertain || saving}
                  onPress={() => {
                    if (category.id !== categoryId) {
                      setCategoryId(category.id);
                      setTagIds([]);
                    }
                  }}
                  className={`min-h-11 max-w-full justify-center rounded-lg border px-3 py-2 ${categoryId === category.id ? "border-foreground bg-navigation" : "border-border bg-surface"}`}
                >
                  <Text className="text-[14px] leading-[20px] text-foreground">
                    {category.name}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}
          <View className="mt-6 border-t border-border pt-5">
            <Text className="field-label">Tags · Optional</Text>
            <Text className="form-description mb-3">
              Add up to 10 labels within your category. {tagIds.length}/10
              selected.
            </Text>
            {!categoryId ? (
              <Text className="form-description">
                Choose a category to see its tags.
              </Text>
            ) : tagsLoading ? (
              <Text className="form-description">Loading tags…</Text>
            ) : tagsError ? (
              <Pressable
                accessibilityRole="button"
                disabled={saving || uncertain}
                className="text-action"
                onPress={retryTags}
              >
                <Text className="text-action-label">Retry loading tags</Text>
              </Pressable>
            ) : tags.length === 0 ? (
              <Text className="form-description">
                No tags in this category yet. You can post without tags.
              </Text>
            ) : (
              <View className="flex-row flex-wrap gap-2">
                {tags.map((tag) => {
                  const selected = tagIds.includes(tag.id);
                  const disabled =
                    saving || uncertain || (!selected && tagIds.length >= 10);
                  return (
                    <Pressable
                      key={tag.id}
                      accessibilityRole="checkbox"
                      accessibilityLabel={tag.name}
                      accessibilityState={{ checked: selected, disabled }}
                      disabled={disabled}
                      onPress={() =>
                        setTagIds((current) =>
                          current.includes(tag.id)
                            ? current.filter((id) => id !== tag.id)
                            : current.length < 10
                              ? [...current, tag.id]
                              : current,
                        )
                      }
                      className={`min-h-11 max-w-full justify-center rounded-full border px-3 py-2 disabled:opacity-50 ${selected ? "border-foreground bg-foreground" : "border-border bg-navigation"}`}
                    >
                      <Text
                        className={`text-[14px] leading-[20px] ${selected ? "text-background" : "text-foreground"}`}
                      >
                        #{tag.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            )}
          </View>
          {uncertain && (
            <Link href="/(tabs)/profile" asChild>
              <Pressable accessibilityRole="link" className="text-action mt-2">
                <Text className="text-action-label">Check my posts</Text>
              </Pressable>
            </Link>
          )}
        </View>
      )}
    </BlogEditor>
  );
}
