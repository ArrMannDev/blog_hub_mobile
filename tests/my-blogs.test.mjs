import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
const tick = () => new Promise(setImmediate);
function load(path, mocks) {
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
    AbortController,
    Error,
    FormData,
    Blob,
    require: (name) => {
      if (name in mocks) return mocks[name];
      if (name === "@/contexts/PostSyncContext")
        return { usePostSync: () => ({ revision: 0 }) };
      if (name === "@/contexts/AuthContext")
        return { useAuth: () => ({ user: null }) };
      if (name === "@/lib/post-taxonomy")
        return {
          postTaxonomy: {
            categories: (_user, ...args) =>
              mocks["@/lib/api"].api.categories(...args),
            tags: (_user, ...args) => mocks["@/lib/api"].api.tags(...args),
          },
        };
      if (name === "@/lib/post-crud")
        return load("lib/post-crud.ts", {
          "react-native": { Platform: { OS: "web" } },
          "./api": mocks["@/lib/api"] ?? { ApiError },
          "./my-blogs-api": mocks["@/lib/my-blogs-api"],
          "./connectivity": { hasInternet: async () => true },
          "./offline/cache": {},
          "./offline/posts": {},
          "./offline/database": {},
          "./post-events": { notifyPostChange() {} },
          "./post-sync": { isPostSyncRunning: () => false },
        });
      if (name === "@/lib/connectivity")
        return { hasInternet: async () => true };
      if (name === "./post-body") return load("lib/post-body.ts", mocks);
      if (name === "expo-file-system") return { File: class {} };
      if (name === "@/components/PostComposer")
        return load("components/PostComposer.tsx", mocks);
      if (name === "./CoverPicker")
        return { __esModule: true, default: "CoverPicker" };
      return require(name);
    },
  });
  return module.exports;
}
function hooks() {
  const states = [],
    refs = [];
  let stateIndex, refIndex;
  return {
    reset() {
      stateIndex = refIndex = 0;
    },
    react: {
      ...require("react"),
      useState(initial) {
        const i = stateIndex++;
        if (!(i in states)) states[i] = initial;
        return [
          states[i],
          (value) => {
            states[i] = typeof value === "function" ? value(states[i]) : value;
          },
        ];
      },
      useRef(initial) {
        return (refs[refIndex++] ??= { current: initial });
      },
      useCallback: (callback) => callback,
    },
  };
}
const blog = {
  id: "a",
  title: "A story",
  content: "Original content",
  excerpt: "Original",
  slug: "a-story",
  author: { id: "owner", displayName: "Writer" },
  status: "draft",
  publicationBlocked: false,
  categoryName: "Life",
  coverImageUrl: null,
  tags: [],
  category: null,
  categoryId: null,
  createdAt: "2026-01-01",
  updatedAt: "2026-01-02",
  publishedAt: null,
};
const page = (ids, number = 1, totalPages = 2) => ({
  items: ids.map((id) => ({ ...blog, id })),
  page: number,
  totalPages,
});
function feed(fetchPage, signedIn = true) {
  const h = hooks();
  let effect,
    cleanup,
    mounted = false;
  const module = load("hooks/use-my-blogs.ts", {
    react: h.react,
    "expo-router": {
      useFocusEffect: (callback) => {
        effect = callback;
      },
    },
    "@/contexts/AuthContext": {
      useAuth: () => ({
        user: signedIn ? { id: "owner" } : null,
        getAccessToken: async () => "token",
      }),
    },
    "@/lib/my-blogs-api": { myBlogsApi: { list: fetchPage } },
    "@/lib/reading": require("../src/lib/reading.ts"),
  });
  return {
    render() {
      h.reset();
      const value = module.useMyBlogs("draft");
      if (!mounted) {
        mounted = true;
        cleanup = effect();
      }
      return value;
    },
    blur() {
      cleanup();
    },
    focus() {
      cleanup = effect();
    },
  };
}
function elements(node) {
  if (!node || typeof node !== "object") return [];
  if (Array.isArray(node)) return node.flatMap(elements);
  return [node, ...elements(node.props?.children)];
}
class ApiError extends Error {
  constructor(status) {
    super("Publishing is restricted");
    this.status = status;
  }
}
function editor(onSave, initialBlog = blog, extraDirty = false) {
  const h = hooks();
  let prevention, alert;
  const module = load("components/BlogEditor.tsx", {
    react: h.react,
    "expo-router": {
      usePreventRemove: (enabled, callback) => {
        prevention = { enabled, callback };
      },
    },
    "react-native": {
      Alert: {
        alert: (...args) => {
          alert = args;
        },
      },
      Keyboard: { dismiss() {} },
      Platform: { OS: "ios" },
      Pressable: "Pressable",
      Text: "Text",
      TextInput: "TextInput",
      View: "View",
    },
    "@/hooks/use-theme": { useTheme: () => ({ colors: {} }) },
    "@/lib/api": { ApiError },
    "@/lib/blog-validation": load("lib/blog-validation.ts", {}),
    "./ArticleImage": { __esModule: true, default: "ArticleImage" },
    "./FormScreen": { __esModule: true, default: "FormScreen" },
    "./MarkdownBody": { __esModule: true, default: "MarkdownBody" },
    "./AuthFields": {
      FormField: "FormField",
      FormMessage: "FormMessage",
      SubmitButton: "SubmitButton",
    },
  });
  return {
    render() {
      h.reset();
      return module.default({ blog: initialBlog, onSave, extraDirty });
    },
    find(type) {
      return elements(this.render()).find((node) => node.type === type);
    },
    get prevention() {
      return prevention;
    },
    get alert() {
      return alert;
    },
  };
}

test("own-blog API uses authenticated /me routes and whitelists edits including explicit status", async () => {
  const calls = [];
  const { myBlogsApi } = load("lib/my-blogs-api.ts", {
    "./api": {
      request: async (path, options) => {
        calls.push({ path, options });
        return blog;
      },
    },
  });
  await myBlogsApi.list("draft", 2, "secret");
  await myBlogsApi.detail("a/b", "secret");
  await myBlogsApi.update(
    "a",
    {
      title: "New",
      content: "Body",
      status: "published",
      authorId: "other",
      coverImageUrl: null,
    },
    "secret",
  );
  assert.equal(calls[0].path, "/me/blogs?status=draft&page=2&limit=10");
  assert.equal(calls[0].options.headers.Authorization, "Bearer secret");
  assert.equal(calls[1].path, "/me/blogs/a%2Fb");
  assert.equal(calls[2].options.method, "PATCH");
  assert.deepEqual(JSON.parse(calls[2].options.body), {
    title: "New",
    content: "Body",
    status: "published",
    coverImageUrl: null,
  });
  await myBlogsApi.update("a", { title: "New", content: "Body" }, "secret");
  assert.equal("status" in JSON.parse(calls[3].options.body), false);
});

test("private pagination deduplicates, retains posts on failure, retries the failed page, and refreshes on return", async () => {
  let result = page(["a", "b"]),
    fail = false;
  const calls = [];
  const app = feed(async (status, number, token) => {
    calls.push({ status, number, token });
    if (fail) throw new Error("offline");
    return result;
  });
  app.render();
  await tick();
  result = page(["b", "c"], 2, 3);
  app.render().loadMore();
  await tick();
  assert.equal(
    app
      .render()
      .items.map(({ id }) => id)
      .join(),
    "a,b,c",
  );
  fail = true;
  app.render().loadMore();
  await tick();
  assert.equal(app.render().items.length, 3);
  assert.equal(app.render().requestedPage, 3);
  fail = false;
  result = page(["d"], 3, 3);
  app.render().retry();
  await tick();
  assert.equal(calls.at(-1).number, 3);
  assert.equal(calls.at(-1).status, "draft");
  assert.equal(calls.at(-1).token, "token");
  result = page(["fresh"]);
  app.blur();
  app.focus();
  await tick();
  assert.equal(
    app
      .render()
      .items.map(({ id }) => id)
      .join(),
    "fresh",
  );
});

test("leaving the private feed cancels late results; guests never request drafts", async () => {
  let resolve, signal;
  const app = feed((_status, _page, _token, abortSignal) => {
    signal = abortSignal;
    return new Promise((done) => {
      resolve = done;
    });
  });
  app.render();
  await tick();
  app.blur();
  assert.equal(signal.aborted, true);
  resolve(page(["private"]));
  await tick();
  assert.equal(app.render().items.length, 0);
  let calls = 0;
  const guest = feed(async () => {
    calls++;
  }, false);
  guest.render();
  await tick();
  assert.equal(calls, 0);
});

test("refresh supersedes an older private response and repeated pagination does not duplicate requests", async () => {
  const pending = [];
  const app = feed(
    (_status, _page, _token, signal) =>
      new Promise((resolve) => pending.push({ resolve, signal })),
  );
  app.render();
  await tick();
  app.render().refresh();
  await tick();
  assert.equal(pending[0].signal.aborted, true);
  pending[1].resolve(page(["new"]));
  await tick();
  pending[0].resolve(page(["old"]));
  await tick();
  assert.equal(app.render().items[0].id, "new");
  assert.equal(app.render().refreshing, false);
  app.blur();
  app.focus();
  await tick();
  assert.equal(app.render().loading, true);
  assert.equal(app.render().refreshing, false);
  assert.equal(app.render().items[0].id, "new");
  app.render().refresh();
  await tick();
  assert.equal(app.render().refreshing, true);
  pending[3].resolve(page(["new"]));
  await tick();
  assert.equal(app.render().refreshing, false);
  const value = app.render();
  value.loadMore();
  value.loadMore();
  await tick();
  assert.equal(pending.length, 5);
  app.blur();
  pending[4].resolve(page([]));
  await tick();
});

test("post validation counts Unicode characters and rejects blank or oversized edits", () => {
  const { validateBlogEdits } = load("lib/blog-validation.ts", {});
  assert.equal(
    validateBlogEdits({ title: "😀".repeat(200), content: "Body" }).title,
    undefined,
  );
  assert.ok(
    validateBlogEdits({ title: "😀".repeat(201), content: "Body" }).title,
  );
  assert.ok(validateBlogEdits({ title: "   ", content: "\n\t" }).content);
  assert.equal(
    validateBlogEdits({ title: "Title", content: "x".repeat(100000) }).content,
    undefined,
  );
  assert.ok(
    validateBlogEdits({ title: "Title", content: "x".repeat(100001) }).content,
  );
});

test("saving trims only the title, blocks duplicate writes, and clears unsaved state on success", async () => {
  let resolve;
  const calls = [];
  const app = editor((edits) => {
    calls.push(edits);
    return new Promise((done) => {
      resolve = done;
    });
  });
  app.find("FormField").props.onChangeText(" New title ");
  app.find("TextInput").props.onChangeText("\nBody with whitespace\n");
  const button = app.find("SubmitButton");
  const pending = button.props.onPress();
  await button.props.onPress();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].title, "New title");
  assert.equal(calls[0].content, "\nBody with whitespace\n");
  assert.equal(app.find("SubmitButton").props.busy, true);
  resolve({ ...blog, ...calls[0] });
  await pending;
  assert.equal(app.find("SubmitButton").props.disabled, true);
  assert.equal(app.prevention.enabled, false);
});

test("failed saves preserve editor text and remain protected from accidental back navigation", async () => {
  const app = editor(async () => {
    throw new Error("offline");
  });
  app.find("FormField").props.onChangeText("Changed title");
  await app.find("SubmitButton").props.onPress();
  assert.equal(app.find("FormField").props.value, "Changed title");
  assert.equal(app.find("TextInput").props.value, blog.content);
  assert.equal(app.prevention.enabled, true);
  let repeated = 0;
  app.prevention.callback({ repeat: () => repeated++ });
  assert.equal(app.alert[0], "Discard changes?");
  assert.equal(repeated, 0);
  app.alert[2].find(({ text }) => text === "Discard").onPress();
  app.render();
  assert.equal(app.prevention.enabled, false);
  assert.equal(repeated, 1);
});

test("own cards open the correct destination and manage uses a separate ellipsis button", () => {
  const h = hooks();
  let managed = 0;
  const { default: ArticleCard } = load("components/ArticleCard.tsx", {
    react: h.react,
    "./AuthorProfileSheet": { __esModule: true, default: "AuthorProfileSheet" },
    "./FeedReactions": { __esModule: true, default: "FeedReactions" },
    "@expo/vector-icons/Ionicons": { __esModule: true, default: "Ionicons" },
    "@/hooks/use-theme": { useTheme: () => ({ colors: {} }) },
    "expo-router": { Link: "Link" },
    "react-native": { Pressable: "Pressable", Text: "Text", View: "View" },
    "react-native-markdown-display": {
      MarkdownIt: () => ({ parse: () => [] }),
    },
    "@/lib/reading": require("../src/lib/reading.ts"),
    "./ArticleImage": { __esModule: true, default: "ArticleImage" },
  });
  const render = (props) => {
    h.reset();
    return ArticleCard(props);
  };
  const tree = render({ blog, editable: true, onManage: () => managed++ });
  const links = elements(tree).filter(({ type }) => type === "Link");
  assert.equal(links.length, 1);
  assert.equal(links[0].props.href.pathname, "/posts/[id]/edit");
  const menu = elements(tree).find(
    (node) => node.props?.accessibilityLabel === `Manage ${blog.title}`,
  );
  menu.props.onPress();
  assert.equal(managed, 1);
  assert.equal(elements(links[0]).includes(menu), false);
  const authorButtons = elements(tree).filter(
    (node) =>
      node.props?.accessibilityLabel ===
      `View ${blog.author.displayName}'s profile`,
  );
  assert.equal(authorButtons.length, 2);
  assert.ok(
    authorButtons.every((button) => !elements(links[0]).includes(button)),
  );
  authorButtons[0].props.onPress();
  const sheet = elements(render({ blog })).find(
    (node) => node.type === "AuthorProfileSheet",
  );
  assert.equal(sheet.props.author.id, blog.author.id);
  sheet.props.onClose();
  assert.equal(
    elements(render({ blog })).some(
      (node) => node.type === "AuthorProfileSheet",
    ),
    false,
  );
  const publicTree = render({ blog: { ...blog, status: "published" } });
  const reactions = elements(publicTree).find(
    (node) => node.type === "FeedReactions",
  );
  assert.equal(reactions.props.id, blog.id);
  assert.equal(
    elements(
      elements(publicTree).find((node) => node.type === "Link"),
    ).includes(reactions),
    false,
  );
  assert.equal(
    elements(tree).some((node) => node.type === "FeedReactions"),
    false,
  );
  assert.equal(
    elements(publicTree).some(
      (node) => node.props?.accessibilityLabel === `Manage ${blog.title}`,
    ),
    false,
  );
  assert.equal(
    elements(publicTree).find(({ type }) => type === "Link").props.href
      .pathname,
    "/blogs/[slug]",
  );
});
test("the editor requires sign-in and never renders another account's post", async () => {
  const h = hooks();
  let user = null,
    effect,
    started = false;
  const calls = [];
  class ApiError extends Error {
    constructor(status) {
      super("Unavailable");
      this.status = status;
    }
  }
  const id = "11111111-1111-4111-8111-111111111111";
  const route = load("app/posts/[id]/edit.tsx", {
    react: {
      ...h.react,
      useContext: () => ({ invalidate() {} }),
      useEffect: (callback) => {
        effect = callback;
      },
    },
    "expo-router": {
      Redirect: "Redirect",
      router: { replace() {} },
      useLocalSearchParams: () => ({ id }),
    },
    "react-native": { ActivityIndicator: "ActivityIndicator" },
    "@/components/PostComposer": { __esModule: true, default: "PostComposer" },
    "@/components/FormScreen": { __esModule: true, default: "FormScreen" },
    "@/components/StateMessage": { __esModule: true, default: "StateMessage" },
    "@/contexts/AuthContext": {
      useAuth: () => ({
        user,
        isRestoring: false,
        getAccessToken: async () => "token",
      }),
    },
    "@/contexts/BlogContext": { BlogContext: {} },
    "@/hooks/use-theme": { useTheme: () => ({ colors: {} }) },
    "@/lib/api": { ApiError },
    "@/lib/my-blogs-api": {
      myBlogsApi: {
        detail: async (...args) => {
          calls.push(args);
          return { ...blog, author: { id: "someone-else" } };
        },
      },
    },
  });
  assert.equal(route.default().type, "Redirect");
  assert.equal(calls.length, 0);
  user = { id: "owner" };
  const inner = route.default();
  function render() {
    h.reset();
    const tree = inner.type(inner.props);
    if (!started) {
      started = true;
      effect();
    }
    return tree;
  }
  render();
  await tick();
  const tree = elements(render());
  assert.equal(calls[0][0], id);
  assert.equal(
    tree.some(({ type }) => type === "PostComposer"),
    false,
  );
  assert.equal(
    tree.find(({ type }) => type === "StateMessage").props.title,
    "This post isn't available",
  );
});

test("switching profile accounts remounts the private timeline and guests have no timeline", () => {
  let user = null;
  const { default: Profile } = load("app/(tabs)/profile.tsx", {
    "@expo/vector-icons/Ionicons": { __esModule: true, default: "Ionicons" },
    "expo-router": { Link: "Link" },
    "expo-router/js-tabs": { useBottomTabBarHeight: () => 72 },
    "react-native": {
      ActivityIndicator: "ActivityIndicator",
      Pressable: "Pressable",
      ScrollView: "ScrollView",
      Text: "Text",
      View: "View",
    },
    "react-native-safe-area-context": {
      useSafeAreaInsets: () => ({ bottom: 0 }),
    },
    "@/components/AuthFields": { FormMessage: "FormMessage" },
    "@/components/ProfileHeader": { ProfileMenu: "ProfileMenu" },
    "@/components/ProfilePosts": { __esModule: true, default: "ProfilePosts" },
    "@/components/Screen": { __esModule: true, default: "Screen" },
    "@/constants/theme": { tabBar: { inset: 20 } },
    "@/contexts/AuthContext": {
      useAuth: () => ({ user, isRestoring: false, message: null }),
    },
    "@/hooks/use-theme": { useTheme: () => ({ colors: {} }) },
  });
  assert.equal(
    elements(Profile()).some(({ type }) => type === "ProfilePosts"),
    false,
  );
  user = { id: "account-a" };
  assert.equal(
    elements(Profile()).find(({ type }) => type === "ProfilePosts").key,
    "account-a",
  );
  user = { id: "account-b" };
  assert.equal(
    elements(Profile()).find(({ type }) => type === "ProfilePosts").key,
    "account-b",
  );
});

test("published posts move to drafts and drafts publish without requiring content edits", async () => {
  const calls = [];
  const initial = { ...blog, status: "published" };
  const app = editor(async (edits) => {
    calls.push(edits);
    return { ...initial, ...edits };
  }, initial);
  const statusAction = () =>
    elements(app.render()).find(
      (node) =>
        node.type === "Pressable" &&
        node.props.className.includes("secondary-button"),
    );
  await statusAction().props.onPress();
  assert.equal(calls[0].status, "draft");
  assert.equal(app.prevention.enabled, false);
  assert.equal(
    elements(statusAction()).find(({ type }) => type === "Text").props.children,
    "Publish post",
  );
  await statusAction().props.onPress();
  assert.equal(calls[1].status, "published");
  assert.equal(
    elements(statusAction()).find(({ type }) => type === "Text").props.children,
    "Move to draft",
  );
});

test("moderation blocks publishing and a server refusal preserves edits and disables republishing", async () => {
  let calls = 0;
  const save = async () => {
    calls++;
    throw new ApiError(403);
  };
  const blocked = editor(save, { ...blog, publicationBlocked: true });
  const action = (app) =>
    elements(app.render()).find(
      (node) =>
        node.type === "Pressable" &&
        node.props.className.includes("secondary-button"),
    );
  assert.equal(action(blocked).props.disabled, true);
  await action(blocked).props.onPress();
  assert.equal(calls, 0);
  const app = editor(save);
  app.find("FormField").props.onChangeText("My updated title");
  await action(app).props.onPress();
  assert.equal(calls, 1);
  assert.equal(action(app).props.disabled, true);
  assert.equal(app.find("FormField").props.value, "My updated title");
  assert.equal(app.prevention.enabled, true);
  assert.equal(app.find("SubmitButton").props.disabled, false);
});

test("the blank editor creates a private draft and becomes an existing-post editor after saving", async () => {
  const calls = [];
  const app = editor(async (edits) => {
    calls.push(edits);
    return { ...blog, ...edits };
  }, null);
  app.find("FormField").props.onChangeText("My first post");
  app.find("TextInput").props.onChangeText("My story");
  assert.equal(app.find("SubmitButton").props.label, "Save draft");
  await app.find("SubmitButton").props.onPress();
  assert.equal(calls[0].status, "draft");
  assert.equal(app.find("SubmitButton").props.label, "Save changes");
  assert.equal(app.prevention.enabled, false);
});

test("create requests whitelist the required post fields and authenticate", async () => {
  let options;
  const { myBlogsApi } = load("lib/my-blogs-api.ts", {
    "./api": {
      request: async (path, init) => {
        assert.equal(path, "/blogs");
        options = init;
        return blog;
      },
    },
  });
  await myBlogsApi.create(
    {
      title: "New",
      content: "Body",
      categoryId: "category",
      status: "published",
      authorId: "forged",
      tagIds: ["tag-a"],
    },
    "token",
  );
  assert.equal(options.method, "POST");
  assert.equal(options.headers.Authorization, "Bearer token");
  assert.deepEqual(JSON.parse(options.body), {
    title: "New",
    content: "Body",
    categoryId: "category",
    status: "published",
    tagIds: ["tag-a"],
  });
});

function composer(
  createFailure,
  availableTags = [],
  initialBlog,
  options = {},
) {
  const h = hooks();
  const inputs = [];
  const edits = [];
  let serverBlog = initialBlog || blog;
  let user = null,
    creates = 0,
    updates = 0;
  const route = load("app/posts/new.tsx", {
    react: { ...h.react, useContext: () => ({ invalidate() {} }) },
    "expo-router": { Link: "Link", Redirect: "Redirect" },
    "react-native": {
      ActivityIndicator: "ActivityIndicator",
      Pressable: "Pressable",
      Text: "Text",
      View: "View",
    },
    "@/components/BlogEditor": { __esModule: true, default: "BlogEditor" },
    "@/components/AuthFields": { FormMessage: "FormMessage" },
    "@/components/FormScreen": { __esModule: true, default: "FormScreen" },
    "@/contexts/AuthContext": {
      useAuth: () => ({
        user,
        isRestoring: false,
        getAccessToken: async () => "token",
      }),
    },
    "@/contexts/BlogContext": { BlogContext: {} },
    "@/hooks/use-tags": {
      useTags: (categoryId) => ({
        tags: availableTags.filter((tag) => tag.categoryId === categoryId),
        loading: false,
        error: false,
        retry() {},
      }),
    },
    "@/hooks/use-categories": {
      useCategories: () => ({
        categories: options.offline
          ? []
          : [
              { id: "category", name: "Life" },
              { id: "other", name: "Travel" },
            ],
        loading: false,
        error: !!options.offline,
      }),
    },
    "@/lib/connectivity": {
      hasInternet: async () => options.reportedOnline ?? !options.offline,
    },
    ...(options.offline
      ? {
          "@/lib/post-crud": {
            UnconfirmedPostError: class extends Error {},
            postCrud: {
              async create(_user, input) {
                creates++;
                inputs.push(input);
                return {
                  ...blog,
                  ...input,
                  categoryId: input.categoryId || null,
                  tags: [],
                  syncStatus: "pending",
                };
              },
            },
          },
        }
      : {}),
    "@/hooks/use-theme": { useTheme: () => ({ colors: {} }) },
    "@/lib/api": { ApiError },
    "@/lib/my-blogs-api": {
      myBlogsApi: {
        create: async (input) => {
          creates++;
          inputs.push(input);
          if (createFailure) throw createFailure;
          serverBlog = {
            ...blog,
            ...input,
            tags: availableTags.filter((tag) => input.tagIds?.includes(tag.id)),
          };
          return serverBlog;
        },
        update: async (_id, input) => {
          updates++;
          edits.push(input);
          if (createFailure) throw createFailure;
          serverBlog = {
            ...serverBlog,
            ...input,
            tags:
              input.tagIds === undefined
                ? serverBlog.tags
                : availableTags.filter((tag) => input.tagIds.includes(tag.id)),
          };
          return serverBlog;
        },
      },
    },
  });
  assert.equal(route.default().type, "Redirect");
  user = { id: "owner" };
  const inner = route.default();
  return {
    render() {
      h.reset();
      return inner.type({
        ...inner.props,
        ...(initialBlog ? { blog: initialBlog } : {}),
      });
    },
    select(id = "category") {
      elements(this.render().props.children(false))
        .find(
          (node) =>
            node.props?.accessibilityRole === "radio" && node.key === id,
        )
        .props.onPress();
    },
    get inputs() {
      return inputs;
    },
    get edits() {
      return edits;
    },
    get creates() {
      return creates;
    },
    get updates() {
      return updates;
    },
  };
}

test("the composer requires a category and later saves update the created ID", async () => {
  const app = composer();
  await assert.rejects(
    app.render().props.onSave({ title: "New", content: "Body" }),
    /category/,
  );
  assert.equal(app.creates, 0);
  app.select();
  await app
    .render()
    .props.onSave({ title: "New", content: "Body", status: "draft" });
  await app
    .render()
    .props.onSave({ title: "Changed", content: "Body", status: "published" });
  assert.equal(app.creates, 1);
  assert.equal(app.updates, 1);
});

for (const reportedOnline of [false, true]) {
  test(`the offline composer saves without taxonomy when connectivity reports ${reportedOnline}`, async () => {
    const app = composer(undefined, [], undefined, {
      offline: true,
      reportedOnline,
    });
    const result = await app
      .render()
      .props.onSave({ title: "Offline", content: "Body", status: "published" });
    assert.equal(app.creates, 1);
    assert.equal(result.categoryId, null);
    assert.equal(result.status, "published");
    assert.equal(result.syncStatus, "pending");
  });
}

test("uncertain create outcomes prevent another POST; definitive validation failures allow correction", async () => {
  const app = composer(new Error("lost response"));
  app.select();
  await assert.rejects(
    app.render().props.onSave({ title: "New", content: "Body" }),
    /Check your Profile/,
  );
  assert.equal(app.render().props.disabled, true);
  await assert.rejects(
    app.render().props.onSave({ title: "New", content: "Body" }),
    /Check your Profile/,
  );
  assert.equal(app.creates, 1);
  const invalid = composer(new ApiError(400));
  invalid.select();
  await assert.rejects(
    invalid.render().props.onSave({ title: "New", content: "Body" }),
  );
  await assert.rejects(
    invalid.render().props.onSave({ title: "Fixed", content: "Body" }),
  );
  assert.equal(invalid.creates, 2);
  assert.equal(invalid.render().props.disabled, false);
});

test("Home keeps search in the header and leaves creation to the bottom bar", () => {
  const h = hooks();
  let signedIn = false;
  const { default: Home } = load("app/(tabs)/index.tsx", {
    react: h.react,
    "@expo/vector-icons/Ionicons": { __esModule: true, default: "Ionicons" },
    "expo-router": { Link: "Link" },
    "react-native": { Pressable: "Pressable", Text: "Text", View: "View" },
    "@/components/Screen": { __esModule: true, default: "Screen" },
    "@/components/BlogFeed": { __esModule: true, default: "BlogFeed" },
    "@/components/CategoryStrip": {
      __esModule: true,
      default: "CategoryStrip",
    },
    "@/hooks/use-categories": {
      useCategories: () => ({ categories: [], error: false }),
    },
    "@/hooks/use-theme": { useTheme: () => ({ colors: {} }) },
    "@/contexts/AuthContext": {
      useAuth: () => ({ isAuthenticated: signedIn }),
    },
    "@/contexts/ChatContext": { useChat: () => ({ unreadMessageCount: 0 }) },
    "@/lib/reading": require("../src/lib/reading.ts"),
  });
  const links = () => {
    h.reset();
    return elements(Home())
      .filter((node) => node.type === "Link")
      .map((node) => node.props.href);
  };
  assert.ok(links().includes("/explore"));
  assert.equal(links().includes("/posts/new"), false);
  signedIn = true;
  assert.equal(links().includes("/posts/new"), false);
});

test("new posts submit only the selected category's tags and clear tags when category changes", async () => {
  const app = composer(undefined, [
    { id: "tag-a", categoryId: "category", name: "Ideas" },
    { id: "tag-b", categoryId: "other", name: "Places" },
  ]);
  app.select();
  const choices = () =>
    elements(app.render().props.children(false)).filter(
      (node) => node.props?.accessibilityRole === "checkbox",
    );
  choices()[0].props.onPress();
  assert.equal(choices()[0].props.accessibilityState.checked, true);
  app.select();
  assert.equal(choices()[0].props.accessibilityState.checked, true);
  app.select("other");
  assert.equal(choices()[0].key, "tag-b");
  assert.equal(choices()[0].props.accessibilityState.checked, false);
  choices()[0].props.onPress();
  await app
    .render()
    .props.onSave({ title: "New", content: "Body", status: "draft" });
  assert.equal(app.inputs[0].categoryId, "other");
  assert.equal(app.inputs[0].tagIds.join(), "tag-b");
});

test("tag selection caps at ten while selected tags can still be removed", () => {
  const app = composer(
    undefined,
    Array.from({ length: 11 }, (_, i) => ({
      id: `tag-${i}`,
      categoryId: "category",
      name: `Tag ${i}`,
    })),
  );
  app.select();
  const choices = () =>
    elements(app.render().props.children(false)).filter(
      (node) => node.props?.accessibilityRole === "checkbox",
    );
  for (let i = 0; i < 10; i++) choices()[i].props.onPress();
  assert.equal(choices()[10].props.disabled, true);
  assert.equal(choices()[0].props.disabled, false);
  choices()[0].props.onPress();
  assert.equal(choices()[10].props.disabled, false);
});

test("existing posts can change category, clear tags and remove a cover without losing other fields", async () => {
  const original = {
    ...blog,
    categoryId: "category",
    tags: [{ id: "tag-a", categoryId: "category" }],
    coverImageUrl: "https://example.com/cover.jpg",
  };
  const app = composer(undefined, original.tags, original);
  assert.equal(app.render().props.extraDirty, false);
  app.select("other");
  const cover = elements(app.render().props.children(false)).find(
    (node) => node.type === "CoverPicker",
  );
  cover.props.onChange(null);
  assert.equal(app.render().props.extraDirty, true);
  await app
    .render()
    .props.onSave({ title: original.title, content: original.content });
  assert.equal(app.edits[0].tagIds.length, 0);
  assert.equal(app.edits[0].categoryId, "other");
  assert.equal(app.edits[0].coverImageUrl, null);
  assert.equal(app.edits[0].status, undefined);
  assert.equal(app.render().props.extraDirty, false);
});

test("metadata-only changes enable saving and participate in the unsaved-change guard", async () => {
  const calls = [];
  const app = editor(
    async (input) => {
      calls.push(input);
      return blog;
    },
    blog,
    true,
  );
  assert.equal(app.find("SubmitButton").props.disabled, false);
  assert.equal(app.prevention.enabled, true);
  await app.find("SubmitButton").props.onPress();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].title, blog.title);
  assert.equal(calls[0].status, undefined);
});

test("tags deleted while editing can be explicitly removed before saving metadata", async () => {
  const original = {
    ...blog,
    categoryId: "category",
    tags: [{ id: "removed", categoryId: "category" }],
  };
  const app = composer(undefined, [], original);
  const clear = elements(app.render().props.children(false)).find(
    (node) =>
      node.type === "Pressable" &&
      elements(node).some(
        (child) => child.props?.children === "Remove unavailable tags",
      ),
  );
  clear.props.onPress();
  assert.equal(app.render().props.extraDirty, true);
  await app
    .render()
    .props.onSave({ title: original.title, content: original.content });
  assert.equal(app.edits[0].tagIds.length, 0);
});

test("failed metadata uploads remain selected; ordinary text edits omit unchanged metadata", async () => {
  const original = { ...blog, categoryId: "category" };
  const image = {
    uri: "file:///cover.jpg",
    mimeType: "image/jpeg",
    size: 100,
    name: "cover.jpg",
  };
  const failed = composer(new Error("offline"), [], original);
  elements(failed.render().props.children(false))
    .find((node) => node.type === "CoverPicker")
    .props.onChange(image);
  await assert.rejects(
    failed.render().props.onSave({ title: "New", content: "Body" }),
    /offline/,
  );
  assert.equal(failed.render().props.extraDirty, true);
  assert.equal(
    elements(failed.render().props.children(false)).find(
      (node) => node.type === "CoverPicker",
    ).props.value,
    image,
  );
  const app = composer(undefined, [], original);
  await app.render().props.onSave({ title: "New", content: "Body" });
  for (const field of [
    "categoryId",
    "tagIds",
    "image",
    "coverImageUrl",
    "status",
  ])
    assert.equal(field in app.edits[0], false);
});

test("tag requests cancel old categories and late results cannot replace current tags", async () => {
  const h = hooks();
  const requests = [];
  let effect, cleanup;
  const { useTags } = load("hooks/use-tags.ts", {
    react: h.react,
    "expo-router": {
      useFocusEffect: (callback) => {
        effect = callback;
      },
    },
    "@/lib/api": {
      api: {
        tags: (categoryId, signal) =>
          new Promise((resolve) =>
            requests.push({ categoryId, signal, resolve }),
          ),
      },
    },
  });
  const render = (id) => {
    h.reset();
    return useTags(id);
  };
  assert.equal(render("a").loading, true);
  cleanup = effect();
  cleanup();
  assert.equal(render("b").tags.length, 0);
  cleanup = effect();
  requests[1].resolve([{ id: "b-tag", categoryId: "b" }]);
  await tick();
  requests[0].resolve([{ id: "a-tag", categoryId: "a" }]);
  await tick();
  assert.equal(requests[0].signal.aborted, true);
  assert.equal(render("b").tags[0].id, "b-tag");
  cleanup();
});

function postActions({
  status = "published",
  blocked = false,
  failure,
  wait,
} = {}) {
  const h = hooks();
  const calls = [],
    removed = [],
    destinations = [];
  let closed = 0,
    invalidated = 0,
    alert;
  const { default: PostActions } = load("components/PostActions.tsx", {
    react: {
      ...h.react,
      useContext: () => ({ invalidate: () => invalidated++ }),
    },
    "@expo/vector-icons/Ionicons": { __esModule: true, default: "Ionicons" },
    "expo-router": { router: { push: (value) => destinations.push(value) } },
    "react-native": {
      ActivityIndicator: "ActivityIndicator",
      Alert: {
        alert: (...args) => {
          alert = args;
        },
      },
      Modal: "Modal",
      Platform: { OS: "ios" },
      Pressable: "Pressable",
      ScrollView: "ScrollView",
      Text: "Text",
      View: "View",
    },
    "react-native-safe-area-context": {
      useSafeAreaInsets: () => ({ top: 44, bottom: 34 }),
    },
    "@/contexts/AuthContext": {
      useAuth: () => ({
        user: { id: "owner" },
        getAccessToken: async () => "token",
      }),
    },
    "@/contexts/BlogContext": { BlogContext: {} },
    "@/hooks/use-theme": { useTheme: () => ({ colors: {} }) },
    "@/lib/api": { ApiError },
    "./AuthFields": { FormMessage: "FormMessage" },
    "@/lib/my-blogs-api": {
      myBlogsApi: {
        setStatus: async (...args) => {
          calls.push({ action: "status", args });
          if (wait) await wait;
          if (failure) throw failure;
        },
        remove: async (...args) => {
          calls.push({ action: "delete", args });
          if (failure) throw failure;
        },
      },
    },
  });
  return {
    render() {
      h.reset();
      return PostActions({
        blog: { ...blog, status, publicationBlocked: blocked },
        onClose: () => closed++,
        onChanged: (id) => removed.push(id),
      });
    },
    button(label) {
      return elements(this.render()).find(
        (node) =>
          node.type === "Pressable" &&
          elements(node.props.children).some(
            (child) => child.type === "Text" && child.props.children === label,
          ),
      );
    },
    calls,
    removed,
    destinations,
    get closed() {
      return closed;
    },
    get invalidated() {
      return invalidated;
    },
    get alert() {
      return alert;
    },
  };
}

test("management status updates do not fetch or overwrite content, and block duplicate actions", async () => {
  let resolve;
  const app = postActions({
    wait: new Promise((done) => {
      resolve = done;
    }),
  });
  app.button("Move to draft").props.onPress();
  app.button("Move to draft").props.onPress();
  await tick();
  app.render().props.onRequestClose();
  assert.equal(app.closed, 0);
  assert.equal(app.calls.length, 1);
  assert.deepEqual(app.calls[0].args, [blog.id, "draft", "token"]);
  resolve();
  await tick();
  assert.equal(app.removed.join(), blog.id);
  assert.equal(app.invalidated, 1);
  assert.equal(app.closed, 1);
});

test("delete requires confirmation; failures keep the sheet and list intact", async () => {
  const app = postActions({ failure: new Error("offline") });
  app.button("Move to Trash").props.onPress();
  assert.equal(app.calls.length, 0);
  assert.equal(app.alert[2][0].style, "cancel");
  assert.match(app.alert[1], /Trash/i);
  app.alert[2][1].onPress();
  await tick();
  assert.equal(app.calls[0].action, "delete");
  assert.equal(app.closed, 0);
  assert.equal(app.removed.length, 0);
  assert.ok(
    elements(app.render()).some(
      (node) =>
        node.type === "FormMessage" && node.props.children === "offline",
    ),
  );
  const success = postActions();
  success.button("Move to Trash").props.onPress();
  success.alert[2][1].onPress();
  await tick();
  assert.equal(success.removed.join(), blog.id);
  assert.equal(success.closed, 1);
});

test("the menu respects moderation and routes Edit to the private editor", async () => {
  const blocked = postActions({ status: "draft", blocked: true });
  assert.equal(blocked.button("Publish post").props.disabled, true);
  blocked.button("Publish post").props.onPress();
  await tick();
  assert.equal(blocked.calls.length, 0);
  const app = postActions({ status: "draft", failure: new ApiError(403) });
  app.button("Publish post").props.onPress();
  await tick();
  assert.equal(app.button("Publish post").props.disabled, true);
  app.button("Edit post").props.onPress();
  assert.equal(app.destinations[0].params.id, blog.id);
  assert.equal(app.destinations[0].pathname, "/posts/[id]/edit");
});

test("management API changes only status and handles DELETE without a request body", async () => {
  const calls = [];
  const { myBlogsApi } = load("lib/my-blogs-api.ts", {
    "./api": {
      request: async (path, options) => {
        calls.push({ path, options });
      },
    },
  });
  await myBlogsApi.setStatus("a/b", "draft", "token");
  await myBlogsApi.remove("a/b", "token");
  assert.equal(calls[0].path, "/blogs/a%2Fb");
  assert.deepEqual(JSON.parse(calls[0].options.body), { status: "draft" });
  assert.equal(calls[1].options.method, "DELETE");
  assert.equal(calls[1].options.body, undefined);
  assert.equal(calls[1].options.headers.Authorization, "Bearer token");
});
