import AuthForm, { type AuthAction } from "@/components/AuthForm";
import { useAuth } from "@/contexts/AuthContext";
import { Redirect, useLocalSearchParams } from "expo-router";

const actions: AuthAction[] = [
  "sign-in",
  "register",
  "forgot-password",
  "reset-password",
];

export default function AuthScreen() {
  const { action } = useLocalSearchParams<{ action: string }>();
  const { isAuthenticated } = useAuth();
  if (isAuthenticated) {
    return <Redirect href="/(tabs)/profile" />;
  }
  const selected = actions.find((value) => value === action);
  if (!selected) {
    return <Redirect href="/(tabs)/profile" />;
  }
  return <AuthForm key={selected} action={selected} />;
}
