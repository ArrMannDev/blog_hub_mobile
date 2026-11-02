import { Redirect, useLocalSearchParams } from "expo-router";
import { ActivityIndicator, View } from "react-native";
import AccountForm from "@/components/AccountForm";
import Screen from "@/components/Screen";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/hooks/use-theme";

export default function AccountScreen() {
  const { action } = useLocalSearchParams<{ action: string }>();
  const { user, isRestoring } = useAuth();
  const { colors } = useTheme();
  if (isRestoring)
    return (
      <Screen>
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator
            color={colors.foreground}
            accessibilityLabel="Restoring your account"
          />
        </View>
      </Screen>
    );
  if (!user || (action !== "edit" && action !== "password"))
    return <Redirect href="/(tabs)/profile" />;
  return (
    <AccountForm key={`${user.id}:${action}`} user={user} action={action} />
  );
}
