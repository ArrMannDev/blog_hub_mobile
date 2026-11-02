import { ApiError } from "@/lib/api";
import { authApi } from "@/lib/auth-api";
import { authStorage } from "@/lib/auth-storage";
import type { AuthTokens, AuthUser, ProfileInput } from "@/types/auth";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { AppState } from "react-native";

interface AuthContextType {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isRestoring: boolean;
  busy: boolean;
  message: string | null;
  login(email: string, password: string): Promise<void>;
  register(displayName: string, email: string, password: string): Promise<void>;
  logout(): Promise<void>;
  requestPasswordReset(email: string): Promise<void>;
  resetPassword(email: string, code: string, password: string): Promise<void>;
  updateProfile(input: ProfileInput): Promise<void>;
  changePassword(currentPassword: string, newPassword: string): Promise<void>;
  getAccessToken(): Promise<string>;
  checkSession(): Promise<void>;
}

export const AuthContext = createContext<AuthContextType | null>(null);
const expiredMessage = "Your session ended. Please sign in again.";

export const AuthContextProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isRestoring, setIsRestoring] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const credentials = useRef<{ accessToken: string; expiresAt: number } | null>(
    null,
  );
  const refreshRequest = useRef<Promise<string> | null>(null);
  const restoreRequest = useRef<Promise<AuthUser | null> | null>(null);
  const operation = useRef(false);

  const rememberToken = useCallback((value: AuthTokens) => {
    credentials.current = {
      accessToken: value.accessToken,
      expiresAt: Date.now() + value.expiresIn * 1000,
    };
    return value.accessToken;
  }, []);

  const clearSession = useCallback(async (notice: string | null = null) => {
    credentials.current = null;
    setUser(null);
    setMessage(notice);
    await authStorage.write("signed-out");
  }, []);

  const refreshAccessToken = useCallback((): Promise<string> => {
    if (refreshRequest.current) return refreshRequest.current;
    const pending = (async () => {
      try {
        // Persist before rotating: a crash or lost response must never replay an old cookie.
        await authStorage.write("refreshing");
        const token = rememberToken(await authApi.refresh());
        await authStorage.write("active");
        return token;
      } catch {
        await clearSession(expiredMessage);
        throw new Error(expiredMessage);
      }
    })();
    refreshRequest.current = pending;
    void pending
      .finally(() => {
        if (refreshRequest.current === pending) refreshRequest.current = null;
      })
      .catch(() => {});
    return pending;
  }, [clearSession, rememberToken]);

  const getAccessToken = useCallback(async () => {
    await restoreRequest.current;
    if (refreshRequest.current) return refreshRequest.current;
    if (!credentials.current) throw new Error(expiredMessage);
    return credentials.current.expiresAt > Date.now() + 30_000
      ? credentials.current.accessToken
      : refreshAccessToken();
  }, [refreshAccessToken]);

  const loadProfile = useCallback(async () => {
    try {
      return await authApi.me(await getAccessToken());
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 401) throw error;
      // Only retry this read. Password/profile mutations must not be replayed.
      try {
        return await authApi.me(await refreshAccessToken());
      } catch (failure) {
        if (failure instanceof ApiError && failure.status === 401)
          await clearSession(expiredMessage);
        throw failure;
      }
    }
  }, [clearSession, getAccessToken, refreshAccessToken]);

  const run = useCallback(async (action: () => Promise<void>) => {
    if (operation.current)
      throw new Error("Please wait for the current request to finish.");
    operation.current = true;
    setBusy(true);
    setMessage(null);
    try {
      await restoreRequest.current;
      await refreshRequest.current?.catch(() => {});
      await action();
    } finally {
      operation.current = false;
      setBusy(false);
    }
  }, []);

  const checkSession = useCallback(async () => {
    await run(async () => {
      setUser(await loadProfile());
    });
  }, [loadProfile, run]);

  useEffect(() => {
    let mounted = true;
    if (!restoreRequest.current) {
      restoreRequest.current = (async () => {
        try {
          const marker = await authStorage.read();
          if (marker === "refreshing") {
            await clearSession(expiredMessage);
          } else if (marker === "active") {
            return await authApi.me(await refreshAccessToken());
          }
        } catch {
          await clearSession(expiredMessage).catch(() => {});
        }
        return null;
      })();
    }
    void restoreRequest.current.then((profile) => {
      if (mounted) {
        setUser(profile);
        setIsRestoring(false);
      }
    });
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active" || !credentials.current || operation.current)
        return;
      void run(async () => {
        const profile = await loadProfile();
        if (mounted) setUser(profile);
      }).catch((error: unknown) => {
        if (mounted)
          setMessage(
            error instanceof Error
              ? error.message
              : "Couldn't update your account. Try again.",
          );
      });
    });
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, [clearSession, loadProfile, refreshAccessToken, run]);

  const login = (email: string, password: string) =>
    run(async () => {
      await clearSession();
      try {
        const token = rememberToken(
          await authApi.login(email.trim().toLowerCase(), password),
        );
        const profile = await authApi.me(token);
        await authStorage.write("active");
        setUser(profile);
      } catch (error) {
        await clearSession();
        throw error;
      }
    });

  const register = (displayName: string, email: string, password: string) =>
    run(async () => {
      await authApi.register(
        displayName.trim(),
        email.trim().toLowerCase(),
        password,
      );
    });

  const logout = () =>
    run(async () => {
      // Keep the account visible on failure so the user can retry server revocation.
      await authApi.logout();
      await clearSession();
    });

  const requestPasswordReset = (email: string) =>
    run(async () => {
      await authApi.forgotPassword(email.trim().toLowerCase());
    });

  const resetPassword = (email: string, code: string, password: string) =>
    run(async () => {
      await authApi.resetPassword(email.trim().toLowerCase(), code, password);
      await clearSession();
    });

  const updateProfile = (input: ProfileInput) =>
    run(async () => {
      const profile = await authApi.updateProfile(await getAccessToken(), {
        ...input,
        displayName: input.displayName.trim(),
        email: input.email.trim().toLowerCase(),
      });
      setUser(profile);
    });

  const changePassword = (currentPassword: string, newPassword: string) =>
    run(async () => {
      await authApi.changePassword(
        await getAccessToken(),
        currentPassword,
        newPassword,
      );
      await clearSession("Your password was changed. Please sign in again.");
    });

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isRestoring,
        busy,
        message,
        login,
        register,
        logout,
        requestPasswordReset,
        resetPassword,
        updateProfile,
        changePassword,
        getAccessToken,
        checkSession,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context)
    throw new Error("useAuth must be used within an AuthContextProvider");
  return context;
};
