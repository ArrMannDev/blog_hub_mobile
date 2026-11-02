import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
const tick = () => new Promise(setImmediate);
function load(path, mocks = {}, globals = {}) {
  const source = readFileSync(
    new URL(`../src/${path}`, import.meta.url),
    "utf8",
  );
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
    },
  });
  const module = { exports: {} };
  runInNewContext(outputText, {
    exports: module.exports,
    require: (name) => (name in mocks ? mocks[name] : require(name)),
    URL,
    TextEncoder,
    AbortController,
    setTimeout,
    clearTimeout,
    process,
    ...globals,
  });
  return module.exports;
}
class ApiError extends Error {
  constructor(status, message = "Unauthorized") {
    super(message);
    this.status = status;
  }
}
const user = {
  id: "user-a",
  displayName: "Reader",
  email: "reader@example.com",
  role: "author",
  status: "active",
};
const token = { accessToken: "access-a", expiresIn: 3600 };

// Execute the real provider; replace only React, native storage/lifecycle, time, and HTTP boundaries.
function setup({
  marker = null,
  api: overrides = {},
  storageFailure = false,
} = {}) {
  const calls = [];
  const writes = [];
  const states = [],
    refs = [];
  let stateIndex,
    refIndex,
    context,
    effect,
    cleanup,
    listener,
    now = 1000,
    mounted = false;
  const api = Object.fromEntries(
    [
      "login",
      "refresh",
      "logout",
      "me",
      "register",
      "forgotPassword",
      "resetPassword",
      "updateProfile",
      "changePassword",
    ].map((name) => [
      name,
      async (...args) => {
        calls.push({ name, args, marker });
        if (overrides[name]) return overrides[name](...args);
        if (name === "me") return { ...user };
        if (name === "updateProfile") return { ...user, ...args[1] };
        if (name === "login" || name === "refresh") return { ...token };
        return { message: "OK" };
      },
    ]),
  );
  const react = {
    ...require("react"),
    useState: (initial) => {
      const index = stateIndex++;
      if (!(index in states)) states[index] = initial;
      return [
        states[index],
        (update) => {
          states[index] =
            typeof update === "function" ? update(states[index]) : update;
        },
      ];
    },
    useRef: (initial) => {
      const index = refIndex++;
      return (refs[index] ??= { current: initial });
    },
    useCallback: (callback) => callback,
    useContext: () => context,
    useEffect: (callback) => {
      effect = callback;
    },
  };
  const module = load(
    "contexts/AuthContext.tsx",
    {
      react,
      "react-native": {
        AppState: {
          addEventListener: (_event, callback) => {
            listener = callback;
            return {
              remove() {
                listener = null;
              },
            };
          },
        },
      },
      "@/lib/api": { ApiError },
      "@/lib/auth-api": { authApi: api },
      "@/lib/auth-storage": {
        authStorage: {
          read: async () => marker,
          write: async (value) => {
            if (storageFailure) throw new Error("Storage unavailable");
            writes.push(value);
            marker = value;
          },
        },
      },
    },
    { Date: { now: () => now } },
  );
  const app = {
    render() {
      stateIndex = refIndex = 0;
      context = module.AuthContextProvider({ children: null }).props.value;
      if (!mounted) {
        mounted = true;
        cleanup = effect();
      }
      return context;
    },
    strictRemount() {
      cleanup();
      cleanup = effect();
    },
    resume() {
      listener?.("active");
    },
    advance() {
      now += 3_600_000;
    },
    useAuth: module.useAuth,
    calls,
    writes,
  };
  return app;
}

test("guest startup never refreshes; hook requires its provider", async () => {
  const app = setup();
  assert.throws(() => app.useAuth(), /AuthContextProvider/);
  app.render();
  await tick();
  assert.equal(app.render().isRestoring, false);
  assert.equal(app.render().isAuthenticated, false);
  assert.equal(app.calls.length, 0);
  await app.render().register(" Reader ", " READER@example.com ", " password ");
  assert.deepEqual(app.calls[0].args, [
    "Reader",
    "reader@example.com",
    " password ",
  ]);
  assert.equal(app.render().user, null);
});

test("login confirms /me, blocks duplicate actions, and preserves password whitespace", async () => {
  let resolve;
  const app = setup({
    api: {
      login: () =>
        new Promise((done) => {
          resolve = done;
        }),
    },
  });
  app.render();
  await tick();
  const pending = app.render().login(" READER@example.com ", " password ");
  await tick();
  assert.equal(app.render().busy, true);
  assert.equal(app.render().user, null);
  await assert.rejects(
    app.render().login("other@example.com", "password"),
    /wait/,
  );
  resolve(token);
  await pending;
  assert.deepEqual(app.calls[0].args, ["reader@example.com", " password "]);
  assert.equal(app.render().user.id, user.id);
  assert.equal(app.writes.at(-1), "active");
});

test("a failed logout keeps the profile for retry; successful revocation clears it", async () => {
  let fail = true;
  const app = setup({
    api: {
      logout: () => {
        if (fail) throw new Error("offline");
      },
    },
  });
  app.render();
  await tick();
  await app.render().login(user.email, "password");
  await assert.rejects(app.render().logout(), /offline/);
  assert.equal(app.render().isAuthenticated, true);
  fail = false;
  await app.render().logout();
  assert.equal(app.render().user, null);
  assert.equal(app.writes.at(-1), "signed-out");
  await assert.rejects(app.render().getAccessToken(), /session ended/);
});

test("Strict Mode restoration rotates once and still supplies the restored profile", async () => {
  const app = setup({ marker: "active" });
  app.render();
  app.strictRemount();
  await tick();
  assert.equal(app.calls.filter(({ name }) => name === "refresh").length, 1);
  assert.equal(app.calls[0].marker, "refreshing");
  assert.equal(app.render().isRestoring, false);
  assert.equal(app.render().user.id, user.id);
});

test("concurrent expired-token consumers share one refresh; logout waits for rotation", async () => {
  let resolve;
  const app = setup({
    api: {
      refresh: () =>
        new Promise((done) => {
          resolve = done;
        }),
    },
  });
  app.render();
  await tick();
  await app.render().login(user.email, "password");
  app.advance();
  const first = app.render().getAccessToken(),
    second = app.render().getAccessToken();
  await tick();
  const logout = app.render().logout();
  await tick();
  assert.equal(app.calls.filter(({ name }) => name === "refresh").length, 1);
  assert.equal(app.calls.filter(({ name }) => name === "logout").length, 0);
  resolve({ accessToken: "access-b", expiresIn: 3600 });
  assert.deepEqual(await Promise.all([first, second]), [
    "access-b",
    "access-b",
  ]);
  await logout;
  assert.equal(app.render().user, null);
});

test("interrupted and failed rotations require sign-in without replaying the cookie", async () => {
  const interrupted = setup({ marker: "refreshing" });
  interrupted.render();
  await tick();
  assert.equal(interrupted.calls.length, 0);
  assert.equal(interrupted.writes.at(-1), "signed-out");
  const failed = setup({
    marker: "active",
    api: {
      refresh: () => {
        throw new Error("lost response");
      },
    },
  });
  failed.render();
  await tick();
  assert.equal(failed.render().user, null);
  assert.equal(failed.writes.at(-1), "signed-out");
  failed.resume();
  await tick();
  assert.equal(failed.calls.length, 1);
  assert.match(failed.render().message, /sign in again/);
});

test("unavailable secure storage prevents refresh requests", async () => {
  const app = setup({ marker: "active", storageFailure: true });
  app.render();
  await tick();
  assert.equal(app.calls.length, 0);
  assert.equal(app.render().user, null);
});

test("profile/password writes are never replayed; password changes clear local auth", async () => {
  let fail = true;
  const app = setup({
    api: {
      updateProfile: (_token, input) => {
        if (fail) throw new ApiError(401, "Current password is incorrect");
        return { ...user, ...input };
      },
    },
  });
  app.render();
  await tick();
  await app.render().login(user.email, "password");
  await assert.rejects(
    app.render().updateProfile({
      displayName: "New",
      email: "new@example.com",
      currentPassword: "wrong",
    }),
    /incorrect/,
  );
  assert.equal(app.calls.filter(({ name }) => name === "refresh").length, 0);
  assert.equal(
    app.calls.filter(({ name }) => name === "updateProfile").length,
    1,
  );
  assert.equal(app.render().isAuthenticated, true);
  fail = false;
  await app
    .render()
    .updateProfile({ displayName: " New ", email: " NEW@example.com " });
  assert.equal(app.render().user.displayName, "New");
  assert.equal(app.render().user.email, "new@example.com");
  await app.render().changePassword(" old ", " new password ");
  assert.equal(app.render().user, null);
  assert.deepEqual(app.calls.at(-1).args.slice(1), [" old ", " new password "]);
});

test("password reset preserves leading zeroes and clears the session", async () => {
  const app = setup();
  app.render();
  await tick();
  await app
    .render()
    .resetPassword(" READER@example.com ", "001234", " new password ");
  assert.deepEqual(app.calls[0].args, [user.email, "001234", " new password "]);
  assert.equal(app.writes.at(-1), "signed-out");
});

test("native auth uses the allowed Origin and cookie credentials only where needed", async () => {
  const calls = [];
  const { authApi } = load("lib/auth-api.ts", {
    "react-native": { Platform: { OS: "ios" } },
    "./api": {
      request: async (path, options) => {
        calls.push({ path, options });
        return path === "/auth/me" ? user : token;
      },
    },
  });
  await authApi.login(user.email, " password ");
  assert.equal(calls[0].options.credentials, "include");
  assert.equal(
    calls[0].options.headers.Origin,
    "https://blog-hub-frontend-one.vercel.app",
  );
  assert.equal(JSON.parse(calls[0].options.body).password, " password ");
  await authApi.me("access-a");
  assert.equal(calls[1].options.headers.Authorization, "Bearer access-a");
  assert.equal(calls[1].options.credentials, undefined);
  await authApi.register("Reader", user.email, "password");
  assert.equal(calls[2].options.credentials, undefined);
});

test("malformed auth responses cannot create a session", async () => {
  const { authApi } = load("lib/auth-api.ts", {
    "react-native": { Platform: { OS: "android" } },
    "./api": { request: async () => ({ accessToken: "", expiresIn: 3600 }) },
  });
  await assert.rejects(
    authApi.login(user.email, "password"),
    /confirm your session/,
  );
  await assert.rejects(authApi.me("token"), /confirm your account/);
});

test("auth validation enforces UTF-8 byte limits and keeps password whitespace", () => {
  const { emailError, nameError, passwordError } = load(
    "lib/auth-validation.ts",
  );
  assert.equal(emailError(" READER@example.com "), undefined);
  assert.ok(emailError("broken"));
  assert.ok(nameError("   "));
  assert.equal(passwordError(" password ", true), undefined);
  assert.ok(passwordError("short", true));
  assert.equal(passwordError("a".repeat(72), true), undefined);
  assert.ok(passwordError("a".repeat(73), true));
  assert.equal(passwordError("é".repeat(36), true), undefined);
  assert.ok(passwordError("é".repeat(37), true));
});

test("shared HTTP defaults omit cookies, handles 204, and hides internal server errors", async () => {
  let result = new Response(null, { status: 204 });
  let options;
  const { request, ApiError: HttpError } = load("lib/api.ts", {
    "expo/fetch": {
      fetch: async (_url, init) => {
        options = init;
        return result;
      },
    },
    "./reading": { API_ORIGIN: "https://example.com" },
  });
  assert.equal(await request("/blogs"), undefined);
  assert.equal(options.credentials, "omit");
  assert.equal(options.redirect, "error");
  result = new Response(
    JSON.stringify({ message: ["Email is invalid", "Name is required"] }),
    { status: 400 },
  );
  await assert.rejects(
    request("/auth/register"),
    (error) =>
      error instanceof HttpError &&
      error.message.includes("Email is invalid\nName is required"),
  );
  result = new Response(
    JSON.stringify({ message: "secret internal details" }),
    { status: 500 },
  );
  await assert.rejects(
    request("/auth/login"),
    (error) => !error.message.includes("secret"),
  );
});

test("resuming a revoked account clears the profile after one failed refresh", async () => {
  let revoked = false;
  const app = setup({
    api: {
      me: () => {
        if (revoked) throw new ApiError(401);
        return user;
      },
      refresh: () => {
        throw new ApiError(401);
      },
    },
  });
  app.render();
  await tick();
  await app.render().login(user.email, "password");
  revoked = true;
  app.resume();
  await tick();
  assert.equal(app.render().user, null);
  assert.equal(app.calls.filter(({ name }) => name === "refresh").length, 1);
  assert.equal(app.writes.at(-1), "signed-out");
});

test("the attached bottom bar has labeled tabs and an authenticated center create action", () => {
  function Tabs() {}
  Tabs.Screen = () => null;
  let signedIn = false;
  const destinations = [];
  const { default: TabLayout } = load("app/(tabs)/_layout.tsx", {
    "@/constants/data": {
      tabs: [
        {
          name: "index",
          title: "Home",
          icon: "home-outline",
          activeIcon: "home",
        },
        {
          name: "explore",
          title: "Explore",
          icon: "search-outline",
          activeIcon: "search",
        },
        {
          name: "profile",
          title: "Profile",
          icon: "person-outline",
          activeIcon: "person",
        },
      ],
    },
    "@/constants/theme": { tabBar: { height: 64 } },
    "@/contexts/AuthContext": {
      useAuth: () => ({ isAuthenticated: signedIn }),
    },
    "@/hooks/use-theme": { useTheme: () => ({ colors: {}, isDark: false }) },
    "@expo/vector-icons/Ionicons": { default: () => null },
    "expo-router": {
      Tabs,
      router: { push: (destination) => destinations.push(destination) },
    },
    "react-native": { Pressable: "Pressable", View: "View" },
    "react-native-safe-area-context": {
      useSafeAreaInsets: () => ({ bottom: 20 }),
    },
  });
  const layout = TabLayout();
  assert.equal(layout.props.screenOptions.tabBarShowLabel, true);
  assert.equal(layout.props.screenOptions.tabBarStyle.height, 84);
  assert.equal(layout.props.screenOptions.tabBarStyle.position, undefined);
  const center = () =>
    TabLayout().props.children[1].props.options.tabBarButton();
  assert.equal(center().props.accessibilityRole, "button");
  center().props.onPress();
  assert.equal(destinations[0].params.action, "sign-in");
  signedIn = true;
  center().props.onPress();
  assert.equal(destinations[1], "/posts/new");
  const button = layout.props.screenOptions.tabBarButton({
    "aria-label": "Profile",
    "aria-selected": true,
  });
  assert.equal(button.props.accessibilityLabel, "Profile");
  assert.equal(button.props.accessibilityState.selected, true);
});
