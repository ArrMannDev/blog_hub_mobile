import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/hooks/use-theme";
import { initials } from "@/lib/reading";
import type { AuthUser } from "@/types/auth";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Link } from "expo-router";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { FormMessage, SubmitButton } from "./AuthFields";

export default function ProfileHeader({ user }: { user: AuthUser }) {
  const { busy, message, logout } = useAuth();
  const { colors } = useTheme();
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState("");
  const [signingOut, setSigningOut] = useState(false);

  async function signOut() {
    if (busy) return;
    setError("");
    setSigningOut(true);
    try {
      await logout();
    } catch {
      setError(
        "We couldn't confirm sign-out. Check your connection and try again.",
      );
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <View className="px-5 pt-4 pb-6">
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
      <View className="mt-5 flex-row flex-wrap items-center gap-3">
        <Link
          href={{ pathname: "/account/[action]", params: { action: "edit" } }}
          asChild
        >
          <Pressable
            accessibilityRole="link"
            disabled={busy}
            className="secondary-button max-w-full grow flex-row gap-2"
          >
            <Ionicons
              name="create-outline"
              size={19}
              color={colors.foreground}
            />
            <Text className="shrink text-[14px] leading-5 font-semibold text-foreground">
              Edit profile
            </Text>
          </Pressable>
        </Link>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Account options"
          accessibilityState={{ expanded }}
          disabled={busy}
          onPress={() => setExpanded((value) => !value)}
          className="secondary-button max-w-full flex-row gap-2"
        >
          <Ionicons
            name="settings-outline"
            size={20}
            color={colors.foreground}
          />
          <Text className="shrink text-[14px] leading-5 text-foreground">
            Account
          </Text>
        </Pressable>
      </View>
      {!!message && (
        <View className="mt-4">
          <FormMessage>{message}</FormMessage>
        </View>
      )}
      {expanded && (
        <View className="mt-4">
          {!!error && <FormMessage error>{error}</FormMessage>}
          <Link href="/topics" asChild>
            <Pressable
              accessibilityRole="link"
              disabled={busy}
              className="account-row mb-4"
            >
              <Ionicons
                name="pricetags-outline"
                size={21}
                color={colors.foreground}
              />
              <Text className="account-row-label">Categories and tags</Text>
              <Ionicons
                name="chevron-forward"
                size={18}
                color={colors.secondary}
              />
            </Pressable>
          </Link>
          <Link
            href={{
              pathname: "/account/[action]",
              params: { action: "password" },
            }}
            asChild
          >
            <Pressable
              accessibilityRole="link"
              disabled={busy}
              className="account-row mb-4"
            >
              <Ionicons
                name="lock-closed-outline"
                size={21}
                color={colors.foreground}
              />
              <Text className="account-row-label">Change password</Text>
              <Ionicons
                name="chevron-forward"
                size={18}
                color={colors.secondary}
              />
            </Pressable>
          </Link>
          <SubmitButton
            label="Sign out"
            pendingLabel="Signing out…"
            busy={signingOut}
            disabled={busy}
            onPress={signOut}
          />
        </View>
      )}
    </View>
  );
}
