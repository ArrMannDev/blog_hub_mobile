import {
  Redirect,
  router,
  useFocusEffect,
  useLocalSearchParams,
  usePreventRemove,
} from "expo-router";
import { useCallback, useContext, useRef, useState } from "react";
import { ActivityIndicator, Text } from "react-native";
import FormScreen from "@/components/FormScreen";
import { FormField, FormMessage, SubmitButton } from "@/components/AuthFields";
import { useAuth } from "@/contexts/AuthContext";
import { BlogContext } from "@/contexts/BlogContext";
import { ApiError } from "@/lib/api";
import { canEditTaxonomy, taxonomyApi, taxonomyName } from "@/lib/taxonomy-api";
import type { TaxonomyEntry, TaxonomyKind } from "@/types/taxonomy";

interface TopicFormProps {
  kind: TaxonomyKind;
  id?: string;
  name?: string;
  categoryId?: string;
  categoryName?: string;
}

export default function TopicFormScreen() {
  const { user, isRestoring } = useAuth();
  const params = useLocalSearchParams<{
    kind?: string;
    id?: string;
    name?: string;
    categoryId?: string;
    categoryName?: string;
  }>();
  if (isRestoring)
    return (
      <FormScreen title="Categories and tags" description="Checking session…">
        <ActivityIndicator />
      </FormScreen>
    );
  if (!user)
    return (
      <Redirect
        href={{ pathname: "/auth/[action]", params: { action: "sign-in" } }}
      />
    );
  if (params.kind !== "categories" && params.kind !== "tags")
    return <Redirect href="/topics" />;
  if (params.kind === "tags" && !params.id && !params.categoryId)
    return <Redirect href="/topics" />;
  if (params.id)
    return (
      <RenameTopic
        key={`${user.id}:${params.kind}:${params.id}`}
        {...params}
        kind={params.kind}
      />
    );
  return (
    <TopicForm
      key={`${user.id}:${params.kind}:${params.id || params.categoryId || "new"}`}
      {...params}
      kind={params.kind}
    />
  );
}

function RenameTopic(props: TopicFormProps) {
  const { user } = useAuth();
  const [entry, setEntry] = useState<TaxonomyEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useFocusEffect(
    useCallback(() => {
      const controller = new AbortController();
      setLoading(true);
      taxonomyApi
        .list(props.kind, props.categoryId || "", controller.signal)
        .then((items) => {
          if (controller.signal.aborted) return;
          setEntry(items.find((item) => item.id === props.id) || null);
          setError("");
        })
        .catch(() => {
          if (!controller.signal.aborted)
            setError("Couldn't check ownership. Try again.");
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
      return () => controller.abort();
      // Retry replaces the focused callback to check current ownership again.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [props.kind, props.categoryId, props.id, attempt]),
  );

  if (!loading && !error && entry && user && canEditTaxonomy(entry, user))
    return <TopicForm {...props} name={entry.name} />;
  return (
    <FormScreen
      title="Rename entry"
      description="You can rename only categories and tags you created."
    >
      {loading ? (
        <ActivityIndicator accessibilityLabel="Checking ownership" />
      ) : error ? (
        <>
          <FormMessage error>{error}</FormMessage>
          <SubmitButton
            label="Try again"
            pendingLabel="Checking…"
            busy={false}
            onPress={() => setAttempt((value) => value + 1)}
          />
        </>
      ) : (
        <FormMessage error>
          {entry
            ? "You can only edit categories and tags you created."
            : "This entry no longer exists. Go back and refresh the list."}
        </FormMessage>
      )}
    </FormScreen>
  );
}

function TopicForm({
  kind,
  id,
  name: initialName = "",
  categoryId,
  categoryName,
}: TopicFormProps) {
  const singular = kind === "categories" ? "category" : "tag";
  const { getAccessToken } = useAuth();
  const cache = useContext(BlogContext);
  const [name, setName] = useState(initialName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [uncertain, setUncertain] = useState(false);
  const pending = useRef(false);
  const saved = useRef(false);
  usePreventRemove(busy, ({ repeat }) => {
    if (saved.current) repeat();
  });

  async function save() {
    if (pending.current || saved.current || uncertain) return;
    let normalized: string;
    try {
      normalized = taxonomyName(name);
    } catch (failure) {
      setError((failure as Error).message);
      return;
    }
    pending.current = true;
    setBusy(true);
    setError("");
    let submitted = false;
    try {
      const token = await getAccessToken();
      submitted = true;
      await taxonomyApi.save(kind, { id, name: normalized, categoryId }, token);
      cache?.invalidate();
      saved.current = true;
      if (router.canGoBack()) router.back();
      else
        router.replace({
          pathname: "/topics",
          params: { categoryId, categoryName },
        });
    } catch (failure) {
      if (
        submitted &&
        !id &&
        (!(failure instanceof ApiError) || failure.status >= 500)
      ) {
        setUncertain(true);
        cache?.invalidate();
        setError(
          "We couldn't confirm creation. Go back and refresh the list before adding it again.",
        );
      } else {
        setError(
          failure instanceof ApiError && failure.status === 404
            ? "This entry or its category no longer exists. Go back and refresh the list."
            : failure instanceof Error
              ? failure.message
              : "Couldn't save this item.",
        );
      }
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return (
    <FormScreen
      title={`${id ? "Rename" : "Add"} ${singular}`}
      description={
        id
          ? "This changes the name on every post using it. Old filter links will stop working."
          : kind === "tags"
            ? `Add a shared label within ${categoryName || "the selected category"}.`
            : "Add a shared main topic that everyone can use for posts."
      }
    >
      <FormField
        label={`${kind === "tags" ? "Tag" : "Category"} name`}
        value={name}
        onChangeText={setName}
        autoCapitalize="words"
        editable={!busy && !uncertain}
        returnKeyType="done"
        onSubmitEditing={() => {
          void save();
        }}
      />
      <Text className="form-description mb-5">
        1–100 characters. Include a letter or number.
      </Text>
      {!!error && <FormMessage error>{error}</FormMessage>}
      <SubmitButton
        label={id ? "Save name" : `Add ${singular}`}
        pendingLabel="Saving…"
        busy={busy}
        disabled={uncertain}
        onPress={() => {
          void save();
        }}
      />
    </FormScreen>
  );
}
