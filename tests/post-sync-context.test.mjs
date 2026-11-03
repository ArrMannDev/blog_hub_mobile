import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { load } from "./helpers/offline.mjs";
class ApiError extends Error {
  constructor(status) {
    super();
    this.status = status;
  }
}

const tick = () => new Promise(setImmediate);

test("post sync mounts only for an account, responds to connectivity/foreground and stops on cleanup", async () => {
  let user = null;
  let effect, network, appChanged, changed;
  let index = 0,
    refIndex = 0;
  const states = [],
    refs = [],
    calls = [];
  let unsubscribed = false,
    removed = false,
    hold = false,
    finish;
  const appState = {
    currentState: "active",
    addEventListener(_event, callback) {
      appChanged = callback;
      return {
        remove() {
          removed = true;
        },
      };
    },
  };
  const module = load(
    "contexts/PostSyncContext.tsx",
    {
      react: {
        createContext: () => ({ Provider: "Provider" }),
        useContext: () => ({}),
        useState(initial) {
          const i = index++;
          if (!(i in states)) states[i] = initial;
          return [
            states[i],
            (value) => {
              states[i] =
                typeof value === "function" ? value(states[i]) : value;
            },
          ];
        },
        useRef(initial) {
          return (refs[refIndex++] ??= { current: initial });
        },
        useEffect(callback) {
          effect = callback;
        },
      },
      "@react-native-community/netinfo": {
        __esModule: true,
        default: {
          addEventListener(callback) {
            network = callback;
            return () => {
              unsubscribed = true;
            };
          },
        },
      },
      "react-native": { AppState: appState, Platform: { OS: "ios" } },
      "./AuthContext": {
        useAuth: () => ({ user, getAccessToken: async () => "token" }),
      },
      "@/lib/post-sync": {
        syncPosts: async (user, _token, signal) => {
          calls.push({ id: user.id, signal });
          if (hold)
            await new Promise((resolve) => {
              finish = resolve;
            });
        },
        retryFailedPosts: async () => {},
        retryDelay: () => 2000,
        PostSyncUnavailableError: class extends Error {},
      },
      "@/lib/post-events": {
        subscribePostChanges(callback) {
          changed = callback;
          return () => {};
        },
      },
      "@/lib/offline/database": {
        getAccountDatabase: async () => ({
          getFirstAsync: async (sql) =>
            sql.includes("COUNT")
              ? { pending: 0, problems: 0 }
              : { next: null },
          getAllAsync: async () => [],
        }),
      },
      "@/lib/post-taxonomy": { postTaxonomy: { categories: async () => [] } },
      "@/lib/api": { ApiError },
    },
    { setTimeout, clearTimeout },
  );
  assert.equal(module.PostSyncProvider({ children: "screen" }), "screen");
  assert.equal(calls.length, 0);
  user = { id: randomUUID(), displayName: "Writer" };
  const session = module.PostSyncProvider({ children: "screen" });
  assert.equal(session.key, user.id);
  session.type(session.props);
  const cleanup = effect();
  await tick();
  assert.equal(calls.length, 1);
  hold = true;
  network({ isConnected: true, isInternetReachable: true });
  await tick();
  assert.equal(calls.length, 2);
  appState.currentState = "background";
  appChanged("background");
  assert.equal(calls[1].signal.aborted, true);
  finish();
  await tick();
  changed(user.id, false);
  await tick();
  assert.equal(calls.length, 2);
  hold = false;
  appState.currentState = "active";
  appChanged("active");
  await tick();
  assert.equal(calls.length, 3);
  changed("another-account", false);
  await tick();
  assert.equal(calls.length, 3);
  cleanup();
  assert.equal(unsubscribed, true);
  assert.equal(removed, true);
  changed(user.id, false);
  await tick();
  assert.equal(calls.length, 3);
  user = { ...user, id: randomUUID() };
  assert.notEqual(
    module.PostSyncProvider({ children: "screen" }).key,
    session.key,
  );
});

test("file previews are allowed only when a caller explicitly marks an image as local", () => {
  const module = load("components/ArticleImage.tsx", {
    react: { useState: (value) => [value, () => {}] },
    "react-native": { Image: "Image" },
    "@/lib/reading": {
      imageUrl: (value) => (value?.startsWith("https://") ? value : undefined),
    },
  });
  assert.equal(module.default({ url: "file:///documents/photo.jpg" }), null);
  assert.equal(
    module.default({ url: "file:///documents/photo.jpg", local: true }).props
      .source.uri,
    "file:///documents/photo.jpg",
  );
  assert.equal(
    module.default({ url: "javascript:alert(1)", local: true }),
    null,
  );
});
