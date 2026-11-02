import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { useRef, useState } from "react";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/hooks/use-theme";
import { chatApi } from "@/lib/chat-api";
import { initials } from "@/lib/reading";
import { FormMessage } from "./AuthFields";

export default function AuthorProfileSheet({
  author,
  onClose,
}: {
  author: { id: string; displayName: string };
  onClose(): void;
}) {
  const { user, getAccessToken, isRestoring } = useAuth();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);

  function close() {
    if (!pending.current) onClose();
  }

  async function open() {
    if (pending.current || isRestoring || user?.id === author.id) return;
    if (!user) {
      onClose();
      router.push({
        pathname: "/auth/[action]",
        params: { action: "sign-in" },
      });
      return;
    }
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      const conversation = await chatApi.start(
        author.id,
        await getAccessToken(),
      );
      onClose();
      router.push({
        pathname: "/chats/[id]",
        params: {
          id: conversation.id,
          name: conversation.otherUser.displayName,
        },
      });
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "Couldn't open this chat.",
      );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <Modal visible transparent animationType="slide" onRequestClose={close}>
      <View
        className="flex-1 justify-end"
        style={{ paddingTop: insets.top + 24 }}
      >
        <Pressable
          className="absolute inset-0 bg-black/40"
          accessibilityRole="button"
          accessibilityLabel="Dismiss author profile"
          disabled={busy}
          onPress={close}
        />
        <View
          className="max-h-[90%] rounded-t-3xl bg-background px-5 pt-3"
          style={{ paddingBottom: Math.max(insets.bottom, 16) }}
          accessibilityViewIsModal
        >
          <View className="flex-row items-center justify-between">
            <Text
              className="text-[16px] leading-[24px] font-semibold text-foreground"
              accessibilityRole="header"
            >
              Author
            </Text>
            <Pressable
              className="icon-button"
              accessibilityRole="button"
              accessibilityLabel="Close author profile"
              disabled={busy}
              onPress={close}
            >
              <Ionicons
                name="close-outline"
                size={25}
                color={colors.foreground}
              />
            </Pressable>
          </View>
          <ScrollView
            className="grow-0"
            contentContainerClassName="pt-3 pb-2"
            keyboardShouldPersistTaps="handled"
          >
            <View className="mb-5 flex-row items-center gap-4">
              <View
                className="h-16 w-16 items-center justify-center rounded-full bg-navigation"
                accessible={false}
              >
                <Text className="font-title text-[24px] leading-[32px] text-foreground">
                  {initials(author.displayName)}
                </Text>
              </View>
              <View className="min-w-0 flex-1">
                <Text className="font-title text-[22px] leading-[30px] text-foreground">
                  {author.displayName}
                </Text>
                {user?.id === author.id && (
                  <Text className="form-description mt-1">This is you</Text>
                )}
              </View>
            </View>
            {!!error && <FormMessage error>{error}</FormMessage>}
            {user?.id !== author.id && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Message ${author.displayName}`}
                accessibilityState={{ busy, disabled: busy || isRestoring }}
                disabled={busy || isRestoring}
                className="secondary-button flex-row gap-2"
                onPress={() => {
                  void open();
                }}
              >
                <Ionicons
                  name="chatbubble-outline"
                  size={18}
                  color={colors.foreground}
                />
                <Text className="text-[16px] leading-[24px] font-semibold text-foreground">
                  {busy ? "Opening chat…" : "Send message"}
                </Text>
              </Pressable>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
