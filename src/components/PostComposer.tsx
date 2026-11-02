import { Link } from "expo-router";
import { useContext, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import BlogEditor from "@/components/BlogEditor";
import { FormMessage } from "@/components/AuthFields";
import CoverPicker from "./CoverPicker";
import { useAuth } from "@/contexts/AuthContext";
import { BlogContext } from "@/contexts/BlogContext";
import { useTags } from "@/hooks/use-tags";
import { useCategories } from "@/hooks/use-categories";
import { ApiError } from "@/lib/api";
import { myBlogsApi } from "@/lib/my-blogs-api";
import type { Blog, BlogEdits, CoverUpload } from "@/types/blog";

export default function PostComposer({ blog }: { blog?: Blog }) {
  const { getAccessToken } = useAuth();
  const cache = useContext(BlogContext);
  const { categories, loading, error, retry } = useCategories();
  const [saved, setSaved] = useState(blog);
  const [categoryId, setCategoryId] = useState(blog?.categoryId ?? "");
  const [tagIds, setTagIds] = useState<string[]>(
    blog?.tags.map((tag) => tag.id) ?? [],
  );
  const [image, setImage] = useState<CoverUpload | null | undefined>(undefined);
  const [picking, setPicking] = useState(false);
  const {
    tags,
    loading: tagsLoading,
    error: tagsError,
    retry: retryTags,
  } = useTags(categoryId);
  const [uncertain, setUncertain] = useState(false);
  const createdId = useRef<string | null>(blog?.id ?? null);
  const categoryChanged = categoryId !== (saved?.categoryId ?? "");
  const tagsChanged =
    categoryChanged ||
    [...tagIds].sort().join() !==
      (saved?.tags
        .map((tag) => tag.id)
        .sort()
        .join() ?? "");
  const taxonomyChanged = categoryChanged || tagsChanged;

  function accepted(result: Blog) {
    setSaved(result);
    setCategoryId(result.categoryId ?? "");
    setTagIds(result.tags.map((tag) => tag.id));
    setImage(undefined);
    cache?.invalidate();
    return result;
  }

  async function save(edits: BlogEdits) {
    if (uncertain)
      throw new Error("Check your Profile before creating another post.");
    if ((!createdId.current || taxonomyChanged) && (loading || error))
      throw new Error("Load the current categories before saving your post.");
    if (
      (!createdId.current || taxonomyChanged) &&
      categoryId &&
      (tagsLoading || tagsError)
    )
      throw new Error("Load the current tags before saving your post.");
    if (
      (!createdId.current || taxonomyChanged) &&
      !categories.some((category) => category.id === categoryId)
    )
      throw new Error("Choose a category for your post.");
    if (
      (!createdId.current || taxonomyChanged) &&
      (tagIds.length > 10 ||
        tagIds.some(
          (id) =>
            !tags.some((tag) => tag.id === id && tag.categoryId === categoryId),
        ))
    )
      throw new Error("Choose tags from the selected category.");
    const token = await getAccessToken();
    const input = {
      ...edits,
      ...(categoryChanged ? { categoryId } : {}),
      ...(tagsChanged ? { tagIds } : {}),
      ...(image ? { image } : image === null ? { coverImageUrl: null } : {}),
    };
    if (createdId.current) {
      return accepted(await myBlogsApi.update(createdId.current, input, token));
    }
    try {
      const result = await myBlogsApi.create(
        { ...input, categoryId, tagIds, status: edits.status ?? "draft" },
        token,
      );
      if (!result || typeof result.id !== "string" || !result.id)
        throw new Error("Missing post confirmation");
      // Later saves must update this post, never submit another creation request.
      createdId.current = result.id;
      return accepted(result);
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
    <BlogEditor
      blog={blog}
      onSave={save}
      disabled={uncertain || picking}
      extraDirty={taxonomyChanged || image !== undefined}
    >
      {(saving) => (
        <View className="mb-5">
          <CoverPicker
            value={image}
            existingUrl={saved?.coverImageUrl ?? null}
            onChange={setImage}
            onPicking={setPicking}
            disabled={saving || uncertain || picking}
          />
          <Link href="/topics" asChild>
            <Pressable
              accessibilityRole="link"
              className="text-action mb-3"
              disabled={saving || uncertain}
            >
              <Text className="text-action-label">
                Manage categories and tags
              </Text>
            </Pressable>
          </Link>
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
            {!tagsLoading &&
              !tagsError &&
              tagIds.some((id) => !tags.some((tag) => tag.id === id)) && (
                <View className="mb-3">
                  <Text className="form-description">
                    Some selected tags are no longer available.
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    className="text-action"
                    disabled={saving || uncertain}
                    onPress={() =>
                      setTagIds((current) =>
                        current.filter((id) =>
                          tags.some((tag) => tag.id === id),
                        ),
                      )
                    }
                  >
                    <Text className="text-action-label">
                      Remove unavailable tags
                    </Text>
                  </Pressable>
                </View>
              )}
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
