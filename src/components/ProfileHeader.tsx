import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/hooks/use-theme";
import { initials } from "@/lib/reading";
import type { AuthUser } from "@/types/auth";
import Ionicons from "@expo/vector-icons/Ionicons";
import { router, type Href } from "expo-router";
import { useState, type ComponentProps } from "react";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import Animated, { SlideInLeft } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FormMessage, SubmitButton } from "./AuthFields";

type MenuItem = {
  href: Href;
  label: string;
  icon: ComponentProps<typeof Ionicons>["name"];
  permission?: string;
};

const accountItems: MenuItem[] = [
  {
    href: { pathname: "/account/[action]", params: { action: "edit" } },
    label: "Edit profile",
    icon: "create-outline",
  },
  { href: "/topics", label: "Categories and tags", icon: "pricetags-outline" },
  {
    href: { pathname: "/account/[action]", params: { action: "password" } },
    label: "Change password",
    icon: "lock-closed-outline",
  },
];
const activityItems: MenuItem[] = [
  { href: "/chats/inbox", label: "Inbox", icon: "chatbubble-ellipses-outline" },
  {
    href: "/notifications",
    label: "Notifications",
    icon: "notifications-outline",
  },
  { href: "/history", label: "Post history", icon: "time-outline" },
  { href: "/trash", label: "My Trash", icon: "trash-outline" },
];
const adminItems: MenuItem[] = [
  {
    href: "/admin-tools",
    label: "Moderate posts",
    icon: "shield-checkmark-outline",
    permission: "blogs.moderate",
  },
  {
    href: { pathname: "/trash", params: { scope: "admin" } },
    label: "Admin Trash",
    icon: "trash-bin-outline",
    permission: "blogs.moderate",
  },
  {
    href: { pathname: "/admin-tools", params: { section: "users" } },
    label: "Manage users",
    icon: "people-outline",
    permission: "users.manage",
  },
];

const drawerEnter = SlideInLeft.duration(220);

function MenuGroup({
  title,
  items,
  disabled,
  onSelect,
}: {
  title: string;
  items: MenuItem[];
  disabled: boolean;
  onSelect: (href: Href) => void;
}) {
  const { colors } = useTheme();
  return (
    <View className="pb-4">
      <Text
        className="mb-1 text-sm font-semibold text-secondary"
        accessibilityRole="header"
      >
        {title}
      </Text>
      {items.map(({ href, label, icon }) => (
        <Pressable
          key={label}
          accessibilityRole="link"
          disabled={disabled}
          className="account-row"
          onPress={() => onSelect(href)}
        >
          <Ionicons name={icon} size={20} color={colors.foreground} />
          <Text className="account-row-label">{label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export default function ProfileHeader({ user }: { user: AuthUser }) {
  const { message } = useAuth();
  return (
    <View className="px-5 pt-2 pb-4">
      <View className="flex-row items-center gap-4">
        <View className="profile-avatar" accessible={false}>
          <Text className="font-title text-[24px] leading-8 text-foreground">
            {initials(user.displayName)}
          </Text>
        </View>
        <View className="min-w-0 flex-1">
          <Text
            className="font-title text-[24px] leading-8 text-foreground"
            accessibilityRole="header"
          >
            {user.displayName}
          </Text>
          <Text className="form-description mt-1" selectable>
            {user.email}
          </Text>
        </View>
      </View>
      {!!message && (
        <View className="mt-4">
          <FormMessage>{message}</FormMessage>
        </View>
      )}
    </View>
  );
}

export function ProfileMenu({ user }: { user: AuthUser }) {
  const { busy, logout } = useAuth();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [signingOut, setSigningOut] = useState(false);
  const visibleAdminItems = adminItems.filter(
    ({ permission }) => permission && user.permissions?.includes(permission),
  );
  const close = () => setOpen(false);

  function select(href: Href) {
    close();
    router.push(href);
  }

  async function signOut() {
    if (busy || signingOut) return;
    setError("");
    setSigningOut(true);
    try {
      await logout();
      close();
    } catch {
      setError(
        "We couldn't confirm sign-out. Check your connection and try again.",
      );
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Open profile menu"
        accessibilityState={{ expanded: open }}
        className="icon-button"
        onPress={() => setOpen(true)}
      >
        <Ionicons name="menu-outline" size={25} color={colors.foreground} />
      </Pressable>
      {open && (
        <Modal
          transparent
          visible
          animationType="none"
          statusBarTranslucent
          navigationBarTranslucent
          onRequestClose={close}
        >
          <View className="flex-1 flex-row" style={{ marginTop: insets.top }}>
            <Pressable
              className="absolute inset-0 bg-black/40"
              accessible={false}
              onPress={close}
            />
            <Animated.View
              entering={drawerEnter}
              accessibilityViewIsModal
              className="w-[84%] max-w-88 border-r border-border bg-background"
            >
              <View
                className="border-b border-border bg-surface px-5 pb-4"
                style={{
                  paddingTop: 8,
                  paddingLeft: insets.left + 20,
                }}
              >
                <View className="flex-row items-center gap-3">
                  <View
                    className="size-12 items-center justify-center rounded-full bg-navigation"
                    accessible={false}
                  >
                    <Text className="font-title text-xl text-foreground">
                      {initials(user.displayName)}
                    </Text>
                  </View>
                  <View className="min-w-0 flex-1">
                    <Text
                      className="text-base font-semibold text-foreground"
                      accessibilityRole="header"
                      numberOfLines={2}
                    >
                      {user.displayName}
                    </Text>
                    <Text className="form-description" numberOfLines={2}>
                      {user.email}
                    </Text>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Close profile menu"
                    className="icon-button -mr-2"
                    onPress={close}
                  >
                    <Ionicons
                      name="close-outline"
                      size={24}
                      color={colors.foreground}
                    />
                  </Pressable>
                </View>
              </View>
              <ScrollView
                className="flex-1"
                contentContainerClassName="px-5 pt-4"
                contentContainerStyle={{ paddingLeft: insets.left + 20 }}
              >
                <MenuGroup
                  title="Account"
                  items={accountItems}
                  disabled={busy}
                  onSelect={select}
                />
                <MenuGroup
                  title="Activity"
                  items={activityItems}
                  disabled={busy}
                  onSelect={select}
                />
                {!!visibleAdminItems.length && (
                  <MenuGroup
                    title="Admin"
                    items={visibleAdminItems}
                    disabled={busy}
                    onSelect={select}
                  />
                )}
              </ScrollView>
              <View
                className="border-t border-border bg-surface px-5 pt-3"
                style={{
                  paddingBottom: Math.max(insets.bottom, 12),
                  paddingLeft: insets.left + 20,
                }}
              >
                {!!error && <FormMessage error>{error}</FormMessage>}
                <SubmitButton
                  label="Sign out"
                  pendingLabel="Signing out…"
                  busy={signingOut}
                  disabled={busy}
                  onPress={signOut}
                />
              </View>
            </Animated.View>
          </View>
        </Modal>
      )}
    </>
  );
}
