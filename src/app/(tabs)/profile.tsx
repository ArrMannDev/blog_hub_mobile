import { ProfileMenu } from "@/components/ProfileHeader";
import { FormMessage } from "@/components/AuthFields";
import ProfilePosts from "@/components/ProfilePosts";
import Screen from "@/components/Screen";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/hooks/use-theme";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Link } from "expo-router";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";

export default function ProfileScreen() {
  const { user, isRestoring, message } = useAuth();
  const { colors } = useTheme();
  return (
    <Screen>
      <View className="screen-header">
        <Text className="brand" accessibilityRole="header">
          Profile
        </Text>
        {user && !isRestoring && <ProfileMenu key={user.id} user={user} />}
      </View>
      {isRestoring ? (
        <View className="items-center py-8">
          <ActivityIndicator
            color={colors.foreground}
            accessibilityLabel="Restoring your account"
          />
        </View>
      ) : user ? (
        <ProfilePosts key={user.id} user={user} />
      ) : (
        <ScrollView
          contentContainerClassName="px-5 pt-5"
          contentContainerStyle={{
            paddingBottom: 24,
          }}
        >
          <View className="w-full max-w-120 self-center">
            <View className="profile-avatar mb-5" accessible={false}>
              <Ionicons
                name="person-outline"
                size={30}
                color={colors.foreground}
              />
            </View>
            {!!message && <FormMessage>{message}</FormMessage>}
            <Text className="screen-title" accessibilityRole="header">
              A place for your stories
            </Text>
            <Text className="form-description mt-3 mb-7">
              Read freely, or sign in to your BlogHub account. New here? Create
              an account when you are ready to write.
            </Text>
            <Link
              href={{
                pathname: "/auth/[action]",
                params: { action: "sign-in" },
              }}
              asChild
            >
              <Pressable accessibilityRole="link" className="action-button">
                <Text className="action-label">Sign in</Text>
              </Pressable>
            </Link>
            <Link
              href={{
                pathname: "/auth/[action]",
                params: { action: "register" },
              }}
              asChild
            >
              <Pressable
                accessibilityRole="link"
                className="secondary-button mt-3"
              >
                <Text className="text-[16px] leading-6 font-semibold text-foreground">
                  Create account
                </Text>
              </Pressable>
            </Link>
            <Text className="form-description mt-6">
              You can always browse and read without an account.
            </Text>
          </View>
        </ScrollView>
      )}
    </Screen>
  );
}
