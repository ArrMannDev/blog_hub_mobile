import { Platform } from "react-native";
import type { AuthTokens, AuthUser, ProfileInput } from "@/types/auth";
import { request } from "./api";

const nativeOrigin =
  process.env.EXPO_PUBLIC_AUTH_ORIGIN ??
  "https://blog-hub-frontend-one.vercel.app";

function cookieOptions(): RequestInit {
  if (Platform.OS === "web") return { credentials: "include" };
  const origin = new URL(nativeOrigin.trim());
  if (
    !["https:", "http:"].includes(origin.protocol) ||
    origin.origin !== nativeOrigin.trim()
  )
    throw new Error(
      "Sign-in isn't configured correctly. Please contact support.",
    );
  return { credentials: "include", headers: { Origin: origin.origin } };
}

function send<T>(
  path: string,
  body?: object,
  accessToken?: string,
  method = "POST",
  cookies = false,
) {
  const options = cookies ? cookieOptions() : {};
  return request<T>(`/auth${path}`, {
    ...options,
    method,
    headers: {
      ...options.headers,
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

async function tokens(result: Promise<AuthTokens>): Promise<AuthTokens> {
  const value = await result;
  if (
    !value ||
    typeof value.accessToken !== "string" ||
    !value.accessToken ||
    typeof value.expiresIn !== "number" ||
    !Number.isFinite(value.expiresIn) ||
    value.expiresIn <= 0
  )
    throw new Error("We couldn't confirm your session. Please sign in again.");
  return value;
}

async function profile(result: Promise<AuthUser>): Promise<AuthUser> {
  const value = await result;
  if (
    !value ||
    typeof value.id !== "string" ||
    !value.id ||
    typeof value.displayName !== "string" ||
    typeof value.email !== "string" ||
    !["author", "admin"].includes(value.role) ||
    value.status !== "active"
  )
    throw new Error("We couldn't confirm your account. Please sign in again.");
  return value;
}

export const authApi = {
  login: (email: string, password: string) =>
    tokens(
      send<AuthTokens>("/login", { email, password }, undefined, "POST", true),
    ),
  refresh: () =>
    tokens(send<AuthTokens>("/refresh", undefined, undefined, "POST", true)),
  logout: () =>
    send<{ message: string }>("/logout", undefined, undefined, "POST", true),
  me: (token: string) =>
    profile(send<AuthUser>("/me", undefined, token, "GET")),
  register: (displayName: string, email: string, password: string) =>
    send<{ message: string }>("/register", { displayName, email, password }),
  forgotPassword: (email: string) =>
    send<{ message: string }>("/forgot-password", { email }),
  resetPassword: (email: string, code: string, newPassword: string) =>
    send<{ message: string }>(
      "/reset-password",
      { email, code, newPassword },
      undefined,
      "POST",
      true,
    ),
  updateProfile: (token: string, input: ProfileInput) =>
    profile(send<AuthUser>("/me", input, token, "PATCH")),
  changePassword: (
    token: string,
    currentPassword: string,
    newPassword: string,
  ) =>
    send<{ message: string }>(
      "/change-password",
      { currentPassword, newPassword },
      token,
      "POST",
      true,
    ),
};
