import { Redirect, useLocalSearchParams } from "expo-router";
import { useCallback, useRef, useState } from "react";
import {
  Alert,
  FlatList,
  Platform,
  Pressable,
  Switch,
  Text,
  View,
} from "react-native";
import ActionButton from "@/components/ActionButton";
import { SubmitButton } from "@/components/AuthFields";
import { useTheme } from "@/hooks/use-theme";
import { initials } from "@/lib/reading";
import FormScreen from "@/components/FormScreen";
import ModerationReader from "@/components/ModerationReader";
import { useAuth } from "@/contexts/AuthContext";
import { usePrivatePage } from "@/hooks/use-private-page";
import { ApiError, request } from "@/lib/api";
import { notifyPostChange } from "@/lib/post-events";
import type { PrivatePage } from "@/types/activity";
import type { AuthUser } from "@/types/auth";
import type { Blog, BlogSummary } from "@/types/blog";

const permissionGroups = [
  {
    label: "Posts",
    options: [
      [
        "blogs.moderate",
        "Moderate posts",
        "Review, publish, or unpublish posts and view Admin Trash.",
      ],
      [
        "blogs.delete",
        "Move posts to Trash",
        "Move other authors’ posts out of their regular lists.",
      ],
      [
        "blogs.restore",
        "Restore trashed posts",
        "Restore posts from Admin Trash as drafts. Requires Moderate posts.",
      ],
      [
        "blogs.purge",
        "Permanently delete posts",
        "Remove posts from Admin Trash for good. Requires Moderate posts.",
      ],
    ],
  },
  {
    label: "Categories, tags, and comments",
    options: [
      [
        "taxonomy.manage",
        "Edit categories and tags",
        "Rename categories and tags created by other authors.",
      ],
      [
        "taxonomy.delete",
        "Delete categories and tags",
        "Delete categories and tags created by other authors. Deleting a category also removes its tags.",
      ],
      [
        "comments.delete",
        "Delete comments and replies",
        "Remove comments and replies written by other users.",
      ],
    ],
  },
  {
    label: "FAQs",
    options: [
      [
        "faqs.manage",
        "Manage FAQs",
        "Create and edit FAQs and FAQ categories.",
      ],
      ["faqs.delete", "Delete FAQs", "Delete FAQs and empty FAQ categories."],
    ],
  },
  {
    label: "Users",
    options: [
      [
        "users.manage",
        "Manage user accounts",
        "View user accounts and enable or disable author accounts.",
      ],
    ],
  },
];
const grants = permissionGroups.flatMap(({ options }) =>
  options.map(([grant]) => grant),
);
const roleLabels: Record<AuthUser["role"], string> = {
  author: "Author",
  admin: "Admin",
  super_admin: "Main admin",
};

function UserIdentity({
  user,
  showEmail = false,
}: {
  user: AuthUser;
  showEmail?: boolean;
}) {
  return (
    <>
      <View
        className="size-10 items-center justify-center rounded-full bg-navigation"
        accessible={false}
      >
        <Text className="font-title text-sm text-foreground">
          {initials(user.displayName)}
        </Text>
      </View>
      <View className="min-w-0 flex-1">
        <Text className="font-semibold text-foreground">
          {user.displayName}
        </Text>
        {showEmail && <Text className="form-description">{user.email}</Text>}
        <Text className="form-description">{roleLabels[user.role]}</Text>
      </View>
      <Text
        className={
          user.status === "active"
            ? "text-sm font-medium text-foreground"
            : "form-error"
        }
      >
        {user.status === "active" ? "Active" : "Disabled"}
      </Text>
    </>
  );
}

export default function AdminTools() {
  const { section } = useLocalSearchParams<{ section?: string }>();
  const { user, isRestoring } = useAuth();
  const users = section === "users";
  if (isRestoring) return null;
  if (!user?.permissions?.includes(users ? "users.manage" : "blogs.moderate"))
    return <Redirect href="/(tabs)/profile" />;
  return <Manage key={user.id + section} users={users} actor={user} />;
}

function Manage({ users, actor }: { users: boolean; actor: AuthUser }) {
  const { getAccessToken, checkSession } = useAuth();
  const { colors } = useTheme();
  const base = users ? "/admin/users" : "/admin/blogs";
  const page = usePrivatePage(
    useCallback(
      (page: number, token: string, signal?: AbortSignal) =>
        request<PrivatePage<AuthUser | BlogSummary>>(
          base + "?page=" + page + "&limit=10",
          {
            headers: { Authorization: "Bearer " + token },
            signal,
          },
        ),
      [base],
    ),
  );
  const [detail, setDetail] = useState<AuthUser | Blog | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const canGrant =
    actor.role === "super_admin" &&
    actor.permissions?.includes("users.grant_access");

  async function run(path: string, method = "GET", body?: object) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      const headers = {
        Authorization: "Bearer " + (await getAccessToken()),
        ...(body ? { "Content-Type": "application/json" } : {}),
      };
      const result = await request<AuthUser | Blog | undefined>(path, {
        headers,
        method,
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      setDetail(result ?? null);
      setSelected(
        result && "role" in result && result.role === "admin"
          ? (result.permissions ?? []).filter((grant) => grants.includes(grant))
          : [],
      );
      if (method !== "GET") {
        page.refresh();
        if (!users) {
          notifyPostChange(actor.id, true);
          notifyPostChange(actor.id);
        } else await checkSession().catch(() => {});
      }
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Couldn’t complete this action.",
      );
      if (failure instanceof ApiError && [401, 403].includes(failure.status))
        await checkSession().catch(() => {});
      if (failure instanceof ApiError && [404, 409].includes(failure.status)) {
        setDetail(null);
        page.refresh();
      }
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  if (!detail) {
    return (
      <FormScreen
        title={users ? "Manage users" : "Moderate posts"}
        description={
          users
            ? "Review account status and access."
            : "Inspect posts and manage their publication status."
        }
        renderContent={(heading) => (
          <FlatList
            className="flex-1"
            contentContainerClassName="px-5 pt-5 pb-8"
            contentInsetAdjustmentBehavior="never"
            data={page.items}
            keyExtractor={(item) => item.id}
            onEndReached={() => {
              if (!busy) page.loadMore();
            }}
            onEndReachedThreshold={0.4}
            ListHeaderComponent={
              <View className="w-full max-w-120 self-center">
                {heading}
                {!!error && (
                  <Text accessibilityRole="alert" className="form-error">
                    {error}
                  </Text>
                )}
                {busy && (
                  <Text className="form-description">
                    {users ? "Opening account…" : "Opening post…"}
                  </Text>
                )}
                {users && page.items.length > 0 && (
                  <View className="flex-row justify-between border-b border-border pb-2">
                    <Text className="text-sm font-semibold text-secondary">
                      User
                    </Text>
                    <Text className="text-sm font-semibold text-secondary">
                      Status
                    </Text>
                  </View>
                )}
              </View>
            }
            renderItem={({ item }) => (
              <Pressable
                accessibilityRole="button"
                disabled={busy}
                className={`w-full max-w-120 self-center border-border active:opacity-60 ${
                  "role" in item
                    ? "border-b py-3"
                    : "mb-4 rounded-xl border bg-surface p-4"
                }`}
                onPress={() =>
                  void run(base + "/" + encodeURIComponent(item.id))
                }
              >
                {"role" in item ? (
                  <View className="flex-row items-center gap-3">
                    <UserIdentity user={item} />
                  </View>
                ) : (
                  <>
                    <View className="mb-3 flex-row items-center gap-3">
                      <View
                        className="size-9 items-center justify-center rounded-full bg-navigation"
                        accessible={false}
                      >
                        <Text className="font-title text-sm text-foreground">
                          {initials(item.author.displayName)}
                        </Text>
                      </View>
                      <Text className="min-w-0 flex-1 font-semibold text-foreground">
                        {item.author.displayName}
                      </Text>
                      <Text className="rounded-full bg-navigation px-2 py-1 text-xs text-foreground">
                        {item.status === "published" ? "Published" : "Draft"}
                      </Text>
                    </View>
                    <Text className="font-title text-lg text-foreground">
                      {item.title}
                    </Text>
                    {!!item.excerpt && (
                      <Text className="form-description mt-1" numberOfLines={3}>
                        {item.excerpt}
                      </Text>
                    )}
                    {!!item.categoryName && (
                      <Text className="mt-2 text-sm text-secondary">
                        {item.categoryName}
                      </Text>
                    )}
                  </>
                )}
              </Pressable>
            )}
            ListFooterComponent={
              <View className="w-full max-w-120 self-center pt-3">
                {page.loading && (
                  <Text className="form-description">
                    {users ? "Loading users…" : "Loading posts…"}
                  </Text>
                )}
                {!page.loading && !page.error && !page.items.length && (
                  <Text className="form-description">
                    {users ? "No users found." : "No posts found."}
                  </Text>
                )}
                {!!page.error && (
                  <Text accessibilityRole="alert" className="form-error">
                    {page.error}
                  </Text>
                )}
                {!!page.error && (
                  <ActionButton
                    label="Try again"
                    onPress={page.retry}
                    disabled={busy || page.loading}
                  />
                )}
              </View>
            }
          />
        )}
      />
    );
  }

  const path = base + "/" + encodeURIComponent(detail.id);
  if (!("role" in detail)) {
    return (
      <ModerationReader
        key={detail.id}
        blog={detail}
        busy={busy}
        error={error}
        onBack={() => {
          if (!busy) {
            setError("");
            setDetail(null);
          }
        }}
        onTogglePublication={() => {
          void run(path + "/status", "PATCH", {
            status: detail.status === "published" ? "draft" : "published",
          });
        }}
        onTrash={
          actor.permissions?.includes("blogs.delete")
            ? () => {
                const version = detail.version
                  ? "?version=" + detail.version
                  : "";
                void run(
                  "/blogs/" + encodeURIComponent(detail.id) + version,
                  "DELETE",
                );
              }
            : undefined
        }
      />
    );
  }
  return (
    <FormScreen
      title={users ? "Manage users" : "Moderate posts"}
      description={
        users
          ? "Review account status and access."
          : "Inspect posts and manage their publication status."
      }
    >
      {!!error && (
        <Text accessibilityRole="alert" className="form-error">
          {error}
        </Text>
      )}
      {busy && <Text className="form-description">Working…</Text>}
      <>
        {
          <ActionButton
            label={"Back to list"}
            onPress={() => setDetail(null)}
            disabled={busy}
          />
        }
        <>
          <View className="my-2 flex-row items-center gap-3 rounded-lg border border-border bg-surface p-3">
            <UserIdentity user={detail} showEmail />
          </View>
          {(detail.role === "author" ||
            (detail.role === "admin" && actor.role === "super_admin")) && (
            <View className="flex-row items-center gap-3 border-b border-border py-3">
              <View className="min-w-0 flex-1">
                <Text className="field-label">Account status</Text>
                <Text className="form-description">
                  {detail.status === "active" ? "Active" : "Disabled"}
                </Text>
              </View>
              <Switch
                accessibilityLabel="Account active"
                accessibilityHint="Asks for confirmation before changing account status"
                disabled={busy}
                trackColor={{
                  false: colors.controlBorder,
                  true: colors.navigation,
                }}
                value={detail.status === "active"}
                onValueChange={(active) => {
                  const label = active ? "Enable account" : "Disable account";
                  const message = active
                    ? `Allow ${detail.displayName} to sign in again?`
                    : `Prevent ${detail.displayName} from signing in?`;
                  const confirm = () =>
                    void run(path + "/status", "PATCH", {
                      status: active ? "active" : "disabled",
                    });
                  if (Platform.OS === "web") {
                    if (window.confirm(message)) confirm();
                  } else {
                    Alert.alert(label, message, [
                      { text: "Cancel", style: "cancel" },
                      {
                        text: label,
                        style: active ? "default" : "destructive",
                        onPress: confirm,
                      },
                    ]);
                  }
                }}
              />
            </View>
          )}
          {canGrant && detail.role !== "super_admin" && (
            <>
              <Text className="field-label mt-5" accessibilityRole="header">
                Access rights
              </Text>
              <Text className="form-description mt-1">
                Choose what this admin can do. Changes take effect when you
                save.
              </Text>
              {permissionGroups.map(({ label, options }) => (
                <View key={label} className="mt-5">
                  <Text
                    className="text-sm font-semibold text-secondary"
                    accessibilityRole="header"
                  >
                    {label}
                  </Text>
                  {options.map(([grant, title, description]) => (
                    <View
                      key={grant}
                      className="min-h-14 flex-row items-center gap-3 border-b border-border py-3"
                    >
                      <View className="min-w-0 flex-1">
                        <Text className="font-semibold text-foreground">
                          {title}
                        </Text>
                        <Text className="form-description mt-1">
                          {description}
                        </Text>
                      </View>
                      <Switch
                        accessibilityLabel={title}
                        accessibilityHint={description}
                        disabled={busy}
                        trackColor={{
                          false: colors.controlBorder,
                          true: colors.navigation,
                        }}
                        value={selected.includes(grant)}
                        onValueChange={(enabled) =>
                          setSelected((items) =>
                            enabled
                              ? [...items, grant]
                              : items.filter((item) => item !== grant),
                          )
                        }
                      />
                    </View>
                  ))}
                </View>
              ))}
              <View className="mt-6">
                <SubmitButton
                  label={
                    detail.role === "author"
                      ? "Promote to admin"
                      : "Save permissions"
                  }
                  pendingLabel="Saving…"
                  busy={busy}
                  onPress={() =>
                    detail.role === "author"
                      ? void run(path, "PATCH", {
                          role: "admin",
                          permissions: selected,
                        })
                      : void run(path + "/permissions", "PATCH", {
                          permissions: selected,
                        })
                  }
                />
              </View>
            </>
          )}
        </>
      </>
    </FormScreen>
  );
}
