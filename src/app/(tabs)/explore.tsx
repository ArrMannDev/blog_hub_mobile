import BlogFeed from "@/components/BlogFeed";
import CategoryStrip from "@/components/CategoryStrip";
import Screen from "@/components/Screen";
import { useCategories } from "@/hooks/use-categories";
import { useTheme } from "@/hooks/use-theme";
import { api } from "@/lib/api";
import { filterQuery } from "@/lib/reading";
import type { BlogFilters, Tag } from "@/types/blog";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import {
    Keyboard,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    ScrollView,
    Text,
    TextInput,
    View,
} from "react-native";

export default function ExploreScreen() {
  const params = useLocalSearchParams<{ category?: string; tag?: string }>();
  const category = typeof params.category === "string" ? params.category : "";
  const tag = typeof params.tag === "string" ? params.tag : "";
  return <Explore key={category + ":" + tag} initial={{ category, tag }} />;
}

function Explore({ initial }: { initial: BlogFilters }) {
  const { colors } = useTheme();
  const { categories, error: categoryError, retry } = useCategories();
  const [draft, setDraft] = useState<BlogFilters>(initial);
  const [query, setQuery] = useState(() => filterQuery({ ...initial }));
  const [expanded, setExpanded] = useState(false);
  const [tags, setTags] = useState<Tag[]>([]);
  const [tagError, setTagError] = useState(false);
  const [tagAttempt, setTagAttempt] = useState(0);
  const selectedCategory = categories.find(
    (category) => category.slug === draft.category,
  );
  const activeFilters = [draft.category, draft.tag, draft.author].filter(
    Boolean,
  ).length;

  useEffect(() => {
    if (!selectedCategory) return;
    const controller = new AbortController();
    api
      .tags(selectedCategory.id, controller.signal)
      .then((items) => {
        if (!controller.signal.aborted) {
          setTags(items);
          setTagError(false);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setTagError(true);
      });
    return () => controller.abort();
  }, [selectedCategory, tagAttempt]);

  function search() {
    Keyboard.dismiss();
    setQuery(filterQuery({ ...draft }));
    setExpanded(false);
  }

  function clear() {
    setDraft({});
    setTags([]);
    setQuery("");
    setExpanded(false);
  }

  return (
    <Screen>
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          className="max-h-[65%] grow-0"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View className="px-5 pt-5 pb-4">
            <Text className="screen-title" accessibilityRole="header">
              Find your next read
            </Text>
            <Text className="mt-2 text-[14px] leading-5 text-secondary">
              A story, an idea, a different perspective.
            </Text>
            <View className="mt-5 flex-row items-center gap-2">
              <TextInput
                accessibilityLabel="Search titles and article content"
                placeholder="Search articles"
                placeholderTextColor={colors.secondary}
                selectionColor={colors.focus}
                className="search-input"
                value={draft.q ?? ""}
                onChangeText={(q) => setDraft((current) => ({ ...current, q }))}
                onSubmitEditing={search}
                maxLength={200}
                returnKeyType="search"
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Search"
                className="action-button px-4"
                onPress={search}
              >
                <Ionicons
                  name="search-outline"
                  size={21}
                  color={colors.background}
                />
              </Pressable>
            </View>
            <View className="mt-1 flex-row items-center justify-between">
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded }}
                className="text-action flex-row items-center gap-2"
                onPress={() => setExpanded((value) => !value)}
              >
                <Ionicons
                  name="options-outline"
                  size={18}
                  color={colors.focus}
                />
                <Text className="text-action-label">
                  {activeFilters
                    ? "Filters (" + activeFilters + ")"
                    : "Filter articles"}
                </Text>
              </Pressable>
              {query || activeFilters > 0 || draft.q ? (
                <Pressable
                  accessibilityRole="button"
                  className="text-action"
                  onPress={clear}
                >
                  <Text className="text-action-label">Clear all</Text>
                </Pressable>
              ) : null}
            </View>
            {!expanded && !!query && (
              <Text className="mt-1 text-[14px] leading-5text-secondary">
                {[
                  draft.category && (selectedCategory?.name ?? draft.category),
                  draft.tag &&
                    (tags.find((tag) => tag.slug === draft.tag)?.name ??
                      draft.tag),
                  draft.author,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </Text>
            )}
          </View>
          {expanded && (
            <View className="pb-5">
              <Text className="field-label px-5">Category</Text>
              <CategoryStrip
                categories={categories}
                selected={draft.category}
                onSelect={(category) => {
                  setDraft((current) => ({ ...current, category, tag: "" }));
                  setTags([]);
                  setTagError(false);
                }}
              />
              {categoryError && (
                <Pressable
                  accessibilityRole="button"
                  className="text-action mx-5"
                  onPress={retry}
                >
                  <Text className="text-action-label">
                    Retry loading categories
                  </Text>
                </Pressable>
              )}
              {!!draft.category && (
                <View className="mt-4">
                  <Text className="field-label px-5">Tag</Text>
                  <CategoryStrip
                    categories={tags}
                    selected={draft.tag}
                    allLabel="All tags"
                    onSelect={(tag) =>
                      setDraft((current) => ({ ...current, tag }))
                    }
                  />
                  {tagError && (
                    <Pressable
                      accessibilityRole="button"
                      className="text-action mx-5"
                      onPress={() => setTagAttempt((value) => value + 1)}
                    >
                      <Text className="text-action-label">
                        Retry loading tags
                      </Text>
                    </Pressable>
                  )}
                </View>
              )}
              <View className="mt-4 px-5">
                <Text className="field-label">Author name</Text>
                <TextInput
                  accessibilityLabel="Filter by author display name"
                  className="search-input"
                  placeholder="Search an author's name"
                  placeholderTextColor={colors.secondary}
                  selectionColor={colors.focus}
                  value={draft.author ?? ""}
                  onChangeText={(author) =>
                    setDraft((current) => ({ ...current, author }))
                  }
                  maxLength={100}
                  returnKeyType="search"
                  onSubmitEditing={search}
                />
                <Pressable
                  accessibilityRole="button"
                  className="action-button mt-4"
                  onPress={search}
                >
                  <Text className="action-label">Apply filters</Text>
                </Pressable>
              </View>
            </View>
          )}
        </ScrollView>
        <View className="border-t border-border" />
        <BlogFeed key={query} query={query} filtered={!!query} />
      </KeyboardAvoidingView>
    </Screen>
  );
}
