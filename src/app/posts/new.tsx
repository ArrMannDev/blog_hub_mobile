import { Redirect } from "expo-router";
import { ActivityIndicator } from "react-native";
import PostComposer from "@/components/PostComposer";
import FormScreen from "@/components/FormScreen";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/hooks/use-theme";

export default function NewPostScreen() {
  const { user, isRestoring } = useAuth();
  const { colors } = useTheme();
  if (isRestoring)
    return (
      <FormScreen title="Create post" description="Checking your session…">
        <ActivityIndicator color={colors.foreground} />
      </FormScreen>
    );
  if (!user)
    return (
      <Redirect
        href={{ pathname: "/auth/[action]", params: { action: "sign-in" } }}
      />
    );
  return <PostComposer key={user.id} />;
}
