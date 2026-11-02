import { useTheme } from "@/hooks/use-theme";
import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import type { PropsWithChildren } from "react";
import {
    KeyboardAvoidingView,
    Platform,
    Pressable,
    ScrollView,
    Text,
    View,
} from "react-native";
import Screen from "./Screen";

export default function FormScreen({
  title,
  description,
  children,
}: PropsWithChildren<{ title: string; description: string }>) {
  const { colors } = useTheme();
  return (
    <Screen edges={["top", "bottom", "left", "right"]}>
      <View className="screen-header">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go back"
          className="icon-button -ml-3"
          onPress={() =>
            router.canGoBack()
              ? router.back()
              : router.replace("/(tabs)/profile")
          }
        >
          <Ionicons
            name="arrow-back-outline"
            size={24}
            color={colors.foreground}
          />
        </Pressable>
        <Text className="font-brand text-[16px] text-foreground">BlogHub</Text>
      </View>
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerClassName="px-5 pt-5 pb-8"
        >
          <View className="w-full max-w-120 self-center">
            <Text className="screen-title" accessibilityRole="header">
              {title}
            </Text>
            <Text className="form-description mt-2 mb-7">{description}</Text>
            {children}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
