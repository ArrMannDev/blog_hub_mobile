import { router } from "expo-router";
import { useState } from "react";
import { Keyboard, Text } from "react-native";
import { useAuth } from "@/contexts/AuthContext";
import type { AuthUser } from "@/types/auth";
import { emailError, nameError, passwordError } from "@/lib/auth-validation";
import { FormField, FormMessage, SubmitButton } from "./AuthFields";
import FormScreen from "./FormScreen";

export default function AccountForm({
  action,
  user,
}: {
  action: "edit" | "password";
  user: AuthUser;
}) {
  const auth = useAuth();
  const [name, setName] = useState(user.displayName);
  const [email, setEmail] = useState(user.email);
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [failure, setFailure] = useState("");
  const isPassword = action === "password";
  const needsPassword = isPassword || email.trim().toLowerCase() !== user.email;
  const changed =
    name.trim() !== user.displayName ||
    email.trim().toLowerCase() !== user.email;

  async function submit() {
    if (auth.busy) return;
    const next = {
      name: isPassword ? undefined : nameError(name),
      email: isPassword ? undefined : emailError(email),
      currentPassword: needsPassword
        ? passwordError(currentPassword)
        : undefined,
      password: isPassword ? passwordError(password, true) : undefined,
      confirm:
        isPassword && password !== confirm
          ? "The passwords don't match."
          : undefined,
    };
    setErrors(next);
    setFailure("");
    if (Object.values(next).some(Boolean)) return;
    Keyboard.dismiss();
    try {
      if (isPassword) {
        await auth.changePassword(currentPassword, password);
        router.replace({
          pathname: "/auth/[action]",
          params: { action: "sign-in" },
        });
      } else {
        await auth.updateProfile({
          displayName: name,
          email,
          ...(needsPassword ? { currentPassword } : {}),
        });
        router.replace("/(tabs)/profile");
      }
      setCurrentPassword("");
      setPassword("");
      setConfirm("");
    } catch (error) {
      setFailure(
        error instanceof Error
          ? error.message
          : "We couldn't save this change. Please try again.",
      );
    }
  }

  return (
    <FormScreen
      title={isPassword ? "Change password" : "Edit profile"}
      description={
        isPassword
          ? "Choose a new password. Changing it signs out all your sessions."
          : "Your display name appears on your articles. Your email stays private."
      }
    >
      {!!failure && <FormMessage error>{failure}</FormMessage>}
      {!isPassword && (
        <>
          <FormField
            label="Display name"
            value={name}
            onChangeText={setName}
            error={errors.name}
            editable={!auth.busy}
            autoCapitalize="words"
            autoComplete="name"
            textContentType="name"
            maxLength={100}
          />
          <FormField
            label="Email"
            value={email}
            onChangeText={setEmail}
            error={errors.email}
            editable={!auth.busy}
            keyboardType="email-address"
            autoComplete="email"
            textContentType="emailAddress"
            maxLength={254}
          />
        </>
      )}
      {needsPassword && (
        <FormField
          label="Current password"
          value={currentPassword}
          onChangeText={setCurrentPassword}
          error={errors.currentPassword}
          editable={!auth.busy}
          password
          autoComplete="current-password"
          textContentType="password"
        />
      )}
      {!isPassword && needsPassword && (
        <Text className="form-description -mt-3 mb-5">
          Confirm your current password to change your email.
        </Text>
      )}
      {isPassword && (
        <>
          <FormField
            label="New password"
            value={password}
            onChangeText={setPassword}
            error={errors.password}
            editable={!auth.busy}
            password
            autoComplete="new-password"
            textContentType="newPassword"
          />
          <Text className="form-description -mt-3 mb-5">
            At least 8 characters, up to 72 UTF-8 bytes.
          </Text>
          <FormField
            label="Confirm password"
            value={confirm}
            onChangeText={setConfirm}
            error={errors.confirm}
            editable={!auth.busy}
            password
            autoComplete="new-password"
            textContentType="newPassword"
            returnKeyType="go"
            onSubmitEditing={submit}
          />
        </>
      )}
      <SubmitButton
        label={isPassword ? "Change password" : "Save changes"}
        pendingLabel="Saving…"
        busy={auth.busy}
        disabled={!isPassword && !changed}
        onPress={submit}
      />
    </FormScreen>
  );
}
