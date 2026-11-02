import { usePreventRemove } from "expo-router";
import { useRef, useState, type ReactNode } from "react";
import {
  Alert,
  Keyboard,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { useTheme } from "@/hooks/use-theme";
import { validateBlogEdits } from "@/lib/blog-validation";
import { ApiError } from "@/lib/api";
import type { Blog, BlogEdits, BlogStatus } from "@/types/blog";
import { FormField, FormMessage, SubmitButton } from "./AuthFields";
import FormScreen from "./FormScreen";
import MarkdownBody from "./MarkdownBody";

export default function BlogEditor({
  blog,
  onSave,
  children,
  disabled = false,
  extraDirty = false,
}: {
  blog?: Blog;
  children?: (saving: boolean) => ReactNode;
  disabled?: boolean;
  extraDirty?: boolean;
  onSave(edits: BlogEdits): Promise<Blog>;
}) {
  const { colors } = useTheme();
  const [saved, setSaved] = useState(blog);
  const [title, setTitle] = useState(blog?.title ?? "");
  const [content, setContent] = useState(blog?.content ?? "");
  const [preview, setPreview] = useState(false);
  const [errors, setErrors] = useState<{ title?: string; content?: string }>(
    {},
  );
  const [failure, setFailure] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [discarded, setDiscarded] = useState(false);
  const pending = useRef(false);
  const dirty =
    title.trim() !== (saved?.title ?? "") ||
    content !== (saved?.content ?? "") ||
    extraDirty;

  usePreventRemove(saving || (dirty && !discarded), ({ repeat }) => {
    if (pending.current) {
      Alert.alert("Saving your post", "Please wait until saving finishes.");
      return;
    }
    const discard = () => {
      setDiscarded(true);
      repeat();
    };
    if (Platform.OS === "web") {
      if (window.confirm("Discard your unsaved changes?")) discard();
    } else {
      Alert.alert("Discard changes?", "Your unsaved edits will be lost.", [
        { text: "Keep editing", style: "cancel" },
        { text: "Discard", style: "destructive", onPress: discard },
      ]);
    }
  });

  async function save(status?: BlogStatus) {
    if (disabled || pending.current || (!dirty && !status)) return;
    if (status === "published" && saved?.publicationBlocked) return;
    const validation = validateBlogEdits({ title, content });
    setErrors(validation);
    setFailure("");
    setNotice("");
    if (validation.title || validation.content) {
      setPreview(false);
      return;
    }
    Keyboard.dismiss();
    pending.current = true;
    setSaving(true);
    try {
      const result = await onSave({
        title: title.trim(),
        content,
        ...(status ? { status } : {}),
      });
      setSaved(result);
      setTitle(result.title);
      setContent(result.content);
      setNotice(
        status === "draft"
          ? saved
            ? "Moved to drafts. This post is no longer public."
            : "Your draft is saved."
          : status === "published"
            ? "Your post is published."
            : "Changes saved.",
      );
    } catch (error) {
      if (
        status === "published" &&
        error instanceof ApiError &&
        error.status === 403
      )
        setSaved((current) =>
          current ? { ...current, publicationBlocked: true } : current,
        );
      setFailure(
        `${error instanceof Error ? error.message : "Couldn't save this post."} Your edits are still here.`,
      );
    } finally {
      pending.current = false;
      setSaving(false);
    }
  }

  return (
    <FormScreen
      title={saved ? "Edit post" : "Create post"}
      description={
        saved?.status === "published"
          ? "Published · Saving updates your live article."
          : saved
            ? "Draft · Your changes stay private."
            : "Share a story, or save a private draft."
      }
    >
      {saved?.publicationBlocked && (
        <FormMessage>
          This post has publishing restrictions. You can still edit its content.
        </FormMessage>
      )}
      {!!failure && <FormMessage error>{failure}</FormMessage>}
      {!!notice && <FormMessage>{notice}</FormMessage>}
      <FormField
        label="Title"
        value={title}
        error={errors.title}
        editable={!saving}
        autoCapitalize="sentences"
        maxLength={400}
        onChangeText={(value) => {
          setTitle(value);
          setNotice("");
          setDiscarded(false);
        }}
      />
      {children?.(saving)}
      <View
        className="mb-4 flex-row gap-6 border-b border-border"
        accessibilityRole="tablist"
      >
        {[false, true].map((value) => (
          <Pressable
            key={String(value)}
            accessibilityRole="tab"
            disabled={saving}
            accessibilityState={{ selected: preview === value }}
            className={`category-option ${preview === value ? "category-selected" : ""}`}
            onPress={() => {
              Keyboard.dismiss();
              setPreview(value);
            }}
          >
            <Text
              className={`category-label ${preview === value ? "category-label-selected" : ""}`}
            >
              {value ? "Preview" : "Write"}
            </Text>
          </Pressable>
        ))}
      </View>
      {preview ? (
        <View className="mb-6">
          <Text className="reader-title mb-4" accessibilityRole="header">
            {title}
          </Text>
          <View className="mt-4">
            <MarkdownBody content={content} />
          </View>
        </View>
      ) : (
        <View className="mb-5">
          <Text className="field-label">Content</Text>
          <TextInput
            accessibilityLabel="Post content"
            accessibilityHint="Write your article in Markdown"
            multiline
            textAlignVertical="top"
            scrollEnabled
            editable={!saving}
            value={content}
            autoCapitalize="sentences"
            selectionColor={colors.focus}
            className={`post-content-input ${errors.content ? "border-destructive" : "border-control-border"}`}
            onChangeText={(value) => {
              setContent(value);
              setNotice("");
              setDiscarded(false);
            }}
          />
          {!!errors.content && (
            <Text accessibilityLiveRegion="polite" className="form-error mt-2">
              {errors.content}
            </Text>
          )}
          <Text className="form-description mt-2">
            {saved
              ? "Status actions also save your text, category, tags, and cover changes."
              : "Markdown is supported. Save a draft to keep this post private, or publish when you are ready."}
          </Text>
        </View>
      )}
      <SubmitButton
        label={saved ? "Save changes" : "Save draft"}
        pendingLabel="Saving…"
        busy={saving}
        disabled={disabled || !dirty}
        onPress={() => save(saved ? undefined : "draft")}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityState={{
          disabled:
            disabled ||
            saving ||
            (saved?.status === "draft" && saved?.publicationBlocked),
          busy: saving,
        }}
        disabled={
          disabled ||
          saving ||
          (saved?.status === "draft" && saved?.publicationBlocked)
        }
        className="secondary-button mt-3 disabled:opacity-50"
        onPress={() =>
          save(saved?.status === "published" ? "draft" : "published")
        }
      >
        <Text className="text-[16px] leading-[24px] font-semibold text-foreground">
          {saved?.status === "published" ? "Move to draft" : "Publish post"}
        </Text>
      </Pressable>
    </FormScreen>
  );
}
