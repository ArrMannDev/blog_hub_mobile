import { Link, router } from "expo-router";
import { useState } from "react";
import { Keyboard, Pressable, Text, View } from "react-native";
import { useAuth } from "@/contexts/AuthContext";
import { emailError, nameError, passwordError } from "@/lib/auth-validation";
import { FormField, FormMessage, SubmitButton } from "./AuthFields";
import FormScreen from "./FormScreen";

export type AuthAction =
  | "sign-in"
  | "register"
  | "forgot-password"
  | "reset-password";
const copy = {
  "sign-in": {
    title: "Welcome back",
    description: "Sign in to your BlogHub account.",
    label: "Sign in",
    pending: "Signing in…",
  },
  register: {
    title: "Make yourself at home",
    description: "Create an account to write and publish your stories.",
    label: "Create account",
    pending: "Creating account…",
  },
  "forgot-password": {
    title: "Forgot your password?",
    description: "Enter your email to request a six-digit reset code.",
    label: "Send reset code",
    pending: "Requesting code…",
  },
  "reset-password": {
    title: "Set a new password",
    description: "Enter the code from your email. It expires after 15 minutes.",
    label: "Reset password",
    pending: "Resetting password…",
  },
};

export default function AuthForm({ action }: { action: AuthAction }) {
  const auth = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [code, setCode] = useState("");
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [failure, setFailure] = useState("");
  const [success, setSuccess] = useState(false);
  const isNewPassword = action === "register" || action === "reset-password";
  const hasPassword = action !== "forgot-password";
  const text = copy[action];
  const disabled = auth.busy || auth.isRestoring;

  async function submit() {
    if (disabled) return;
    const next = {
      name: action === "register" ? nameError(name) : undefined,
      email: emailError(email),
      password: hasPassword
        ? passwordError(password, isNewPassword)
        : undefined,
      confirm:
        isNewPassword && password !== confirm
          ? "The passwords don't match."
          : undefined,
      code:
        action === "reset-password" && !/^\d{6}$/.test(code)
          ? "Enter the six-digit code from your email."
          : undefined,
    };
    setErrors(next);
    setFailure("");
    if (Object.values(next).some(Boolean)) return;
    Keyboard.dismiss();
    try {
      if (action === "sign-in") {
        await auth.login(email, password);
        router.replace("/(tabs)/profile");
      } else if (action === "register") {
        await auth.register(name, email, password);
        setSuccess(true);
      } else if (action === "forgot-password") {
        await auth.requestPasswordReset(email);
        setSuccess(true);
      } else {
        await auth.resetPassword(email, code, password);
        setSuccess(true);
      }
      setPassword("");
      setConfirm("");
      setCode("");
    } catch (error) {
      setFailure(
        error instanceof Error
          ? error.message
          : "We couldn't complete this request. Please try again.",
      );
    }
  }

  if (success)
    return (
      <FormScreen
        title={
          action === "register"
            ? "Your account is ready"
            : action === "forgot-password"
              ? "Check your email"
              : "Password updated"
        }
        description={
          action === "register"
            ? "Sign in with your new account to get started."
            : action === "forgot-password"
              ? "If this email is registered, a password reset code has been sent. Check your inbox and spam folder."
              : "Your sessions have been signed out. Sign in with your new password."
        }
      >
        <Link
          href={{
            pathname: "/auth/[action]",
            params: {
              action:
                action === "forgot-password" ? "reset-password" : "sign-in",
            },
          }}
          replace
          asChild
        >
          <Pressable accessibilityRole="link" className="action-button">
            <Text className="action-label">
              {action === "forgot-password"
                ? "Enter reset code"
                : "Go to sign in"}
            </Text>
          </Pressable>
        </Link>
        {action === "forgot-password" && (
          <Pressable
            accessibilityRole="button"
            className="text-action mt-3 items-center"
            onPress={() => setSuccess(false)}
          >
            <Text className="text-action-label">Request another code</Text>
          </Pressable>
        )}
      </FormScreen>
    );

  return (
    <FormScreen title={text.title} description={text.description}>
      {!!auth.message && !failure && <FormMessage>{auth.message}</FormMessage>}
      {!!failure && <FormMessage error>{failure}</FormMessage>}
      {action === "register" && (
        <FormField
          label="Display name"
          value={name}
          onChangeText={setName}
          error={errors.name}
          editable={!disabled}
          autoCapitalize="words"
          autoComplete="name"
          textContentType="name"
          maxLength={100}
        />
      )}
      <FormField
        label="Email"
        value={email}
        onChangeText={setEmail}
        error={errors.email}
        editable={!disabled}
        keyboardType="email-address"
        autoComplete="email"
        textContentType="emailAddress"
        maxLength={254}
      />
      {action === "reset-password" && (
        <FormField
          label="Reset code"
          value={code}
          onChangeText={setCode}
          error={errors.code}
          editable={!disabled}
          keyboardType="number-pad"
          autoComplete="one-time-code"
          textContentType="oneTimeCode"
          maxLength={6}
        />
      )}
      {hasPassword && (
        <FormField
          label={isNewPassword ? "New password" : "Password"}
          value={password}
          onChangeText={setPassword}
          error={errors.password}
          editable={!disabled}
          password
          autoComplete={isNewPassword ? "new-password" : "current-password"}
          textContentType={isNewPassword ? "newPassword" : "password"}
          returnKeyType={isNewPassword ? "next" : "go"}
          onSubmitEditing={isNewPassword ? undefined : submit}
        />
      )}
      {isNewPassword && (
        <>
          <Text className="form-description -mt-3 mb-5">
            At least 8 characters, up to 72 UTF-8 bytes.
          </Text>
          <FormField
            label="Confirm password"
            value={confirm}
            onChangeText={setConfirm}
            error={errors.confirm}
            editable={!disabled}
            password
            autoComplete="new-password"
            textContentType="newPassword"
            returnKeyType="go"
            onSubmitEditing={submit}
          />
        </>
      )}
      {action === "sign-in" && (
        <Link
          href={{
            pathname: "/auth/[action]",
            params: { action: "forgot-password" },
          }}
          asChild
        >
          <Pressable
            accessibilityRole="link"
            disabled={disabled}
            className="text-action self-end mb-3"
          >
            <Text className="text-action-label">Forgot password?</Text>
          </Pressable>
        </Link>
      )}
      <SubmitButton
        label={text.label}
        pendingLabel={text.pending}
        busy={auth.busy}
        disabled={auth.isRestoring}
        onPress={submit}
      />
      <View className="mt-5 items-center">
        <Link
          href={{
            pathname: "/auth/[action]",
            params: { action: action === "sign-in" ? "register" : "sign-in" },
          }}
          replace
          asChild
        >
          <Pressable
            accessibilityRole="link"
            disabled={disabled}
            className="text-action"
          >
            <Text className="text-action-label">
              {action === "sign-in"
                ? "New here? Create an account"
                : "Back to sign in"}
            </Text>
          </Pressable>
        </Link>
      </View>
    </FormScreen>
  );
}
