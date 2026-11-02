import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
const tick = () => new Promise(setImmediate);
class NativeFile {
  constructor(uri) {
    this.uri = uri;
    this.name = uri.split("/").at(-1);
    this.type = "image/jpeg";
  }
  async bytes() {
    return new Uint8Array([255, 216, 255, 224]);
  }
}
function load(path, mocks = {}, globals = {}) {
  const { outputText } = ts.transpileModule(
    readFileSync(new URL(`../src/${path}`, import.meta.url), "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.ReactJSX,
      },
    },
  );
  const module = { exports: {} };
  runInNewContext(outputText, {
    exports: module.exports,
    Error,
    AbortController,
    FormData,
    Blob,
    ...globals,
    require: (name) => {
      if (name in mocks) return mocks[name];
      if (name === "expo-file-system") return { File: NativeFile };
      return require(name);
    },
  });
  return module.exports;
}
function hooks() {
  const states = [],
    refs = [];
  let index, refIndex;
  return {
    reset() {
      index = refIndex = 0;
    },
    react: {
      ...require("react"),
      useState(initial) {
        const i = index++;
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
function elements(node) {
  if (!node || typeof node !== "object") return [];
  return [node, ...[].concat(node.props?.children ?? []).flatMap(elements)];
}
const native = Object.fromEntries(
  ["ActivityIndicator", "Pressable", "Text", "View", "Image"].map((name) => [
    name,
    name,
  ]),
);

test("multipart posts whitelist metadata, JSON-encode empty tags and omit Content-Type", () => {
  class NativeFormData {
    parts = [];
    append(...args) {
      this.parts.push(args);
    }
  }
  const { postBody } = load(
    "lib/post-body.ts",
    {},
    { FormData: NativeFormData },
  );
  const image = {
    uri: "file:///cover.jpg",
    name: "cover.jpg",
    size: 100,
    mimeType: "image/jpeg",
  };
  const result = postBody({
    title: "Title",
    content: "Body",
    status: "draft",
    categoryId: "parent",
    tagIds: [],
    image,
    coverImageUrl: "https://must-not-send.example/image.jpg",
    authorId: "forged",
  });
  assert.equal(result.headers["Content-Type"], undefined);
  const parts = Object.fromEntries(result.body.parts);
  assert.equal(parts.tagIds, "[]");
  assert.equal(parts.categoryId, "parent");
  assert.equal(parts.status, "draft");
  assert.equal(parts.image.uri, image.uri);
  assert.equal(parts.image.type, "image/jpeg");
  assert.equal(typeof parts.image.bytes, "function");
  assert.equal("authorId" in parts, false);
  assert.equal("coverImageUrl" in parts, false);
  const cleared = postBody({
    title: "Title",
    content: "Body",
    coverImageUrl: null,
  });
  assert.equal(JSON.parse(cleared.body).coverImageUrl, null);
});

test("native cover files pass Expo SDK's real multipart serializer instead of unsupported URI parts", async () => {
  class NativeFormData {
    parts = [];
    append(...part) {
      this.parts.push(part);
    }
    entries() {
      return this.parts;
    }
  }
  const { convertFormDataAsync } = load(
    "../node_modules/expo/src/winter/fetch/convertFormData.ts",
    {
      "../../utils/blobUtils": {
        blobToArrayBufferAsync: (blob) => blob.arrayBuffer(),
      },
    },
    { TextEncoder },
  );
  const { postBody } = load(
    "lib/post-body.ts",
    {},
    { FormData: NativeFormData },
  );
  const image = {
    uri: "file:///cover.jpg",
    name: "cover.jpg",
    mimeType: "image/jpeg",
    size: 4,
  };
  const unsupported = new NativeFormData();
  unsupported.append("image", {
    uri: image.uri,
    name: image.name,
    type: image.mimeType,
  });
  await assert.rejects(
    convertFormDataAsync(unsupported),
    /Unsupported FormDataPart implementation/,
  );
  const prepared = postBody({
    title: "A story",
    content: "Body",
    categoryId: "category",
    tagIds: [],
    status: "draft",
    image,
  });
  const { body } = await convertFormDataAsync(prepared.body, "test-boundary");
  const bytes = Buffer.from(body);
  const text = bytes.toString("latin1");
  assert.match(text, /name="image"; filename="cover.jpg"/);
  assert.match(text, /content-type: image\/jpeg/);
  assert.match(text, /name="tagIds"\r\n\r\n\[\]/);
  assert.match(text, /A story/);
  assert.ok(bytes.includes(Buffer.from([255, 216, 255, 224])));
  assert.equal(prepared.headers["Content-Type"], undefined);
});

test("cover validation rejects unsupported formats, missing files and files over 5 MiB", () => {
  const { validateCover } = load("lib/post-body.ts");
  const image = {
    uri: "file:///cover.jpg",
    name: "cover.jpg",
    size: 5 * 1024 * 1024,
    mimeType: "image/jpeg",
  };
  assert.doesNotThrow(() => validateCover(image));
  for (const patch of [
    { size: image.size + 1 },
    { size: 0 },
    { size: NaN },
    { mimeType: "image/heic" },
    { mimeType: "image/svg+xml" },
    { uri: "" },
  ])
    assert.throws(() => validateCover({ ...image, ...patch }));
});

test("web image uploads use the selected File without encoding it as a native URI", () => {
  const { postBody } = load("lib/post-body.ts");
  const file = new File(["image"], "cover.png", { type: "image/png" });
  const result = postBody({
    title: "Title",
    content: "Body",
    image: {
      uri: "blob:chosen",
      name: "cover.png",
      size: file.size,
      mimeType: file.type,
      file,
    },
  });
  assert.equal(result.body.get("image").name, "cover.png");
  assert.equal(result.body.get("image").type, "image/png");
});

function picker(result, failure) {
  const h = hooks();
  const changes = [],
    picking = [];
  let calls = 0;
  const { default: Picker } = load("components/CoverPicker.tsx", {
    react: h.react,
    "react-native": native,
    "expo-image-picker": {
      UIImagePickerPreferredAssetRepresentationMode: {
        Compatible: "compatible",
      },
      launchImageLibraryAsync: async () => {
        calls++;
        if (failure) throw failure;
        return result;
      },
    },
    "@/lib/reading": { imageUrl: (url) => url },
    "@/lib/post-body": load("lib/post-body.ts"),
    "./AuthFields": { FormMessage: "FormMessage" },
  });
  return {
    render() {
      h.reset();
      return Picker({
        value: undefined,
        existingUrl: "https://example.com/old.jpg",
        disabled: false,
        onChange: (value) => changes.push(value),
        onPicking: (value) => picking.push(value),
      });
    },
    changes,
    picking,
    get calls() {
      return calls;
    },
  };
}

test("cancelled or invalid image picks preserve the current cover; successful picks are validated", async () => {
  const cancel = picker({ canceled: true });
  await elements(cancel.render())
    .find((node) => node.props?.onPress)
    .props.onPress();
  await tick();
  assert.equal(cancel.changes.length, 0);
  const invalid = picker({
    canceled: false,
    assets: [{ uri: "file:///large.png", fileSize: 6 * 1024 * 1024 }],
  });
  elements(invalid.render())
    .find((node) => node.props?.onPress)
    .props.onPress();
  await tick();
  assert.equal(invalid.changes.length, 0);
  assert.ok(
    elements(invalid.render()).some((node) => node.type === "FormMessage"),
  );
  const valid = picker({
    canceled: false,
    assets: [
      { uri: "file:///chosen.jpg", fileSize: 100, fileName: "original.heic" },
    ],
  });
  const button = elements(valid.render()).find((node) => node.props?.onPress);
  button.props.onPress();
  button.props.onPress();
  await tick();
  assert.equal(valid.calls, 1);
  assert.equal(valid.changes[0].mimeType, "image/jpeg");
  assert.equal(valid.picking.at(-1), false);
  const denied = picker(undefined, new Error("Photo access denied"));
  elements(denied.render())
    .find((node) => node.props?.onPress)
    .props.onPress();
  await tick();
  assert.equal(denied.changes.length, 0);
  assert.ok(
    elements(denied.render()).some(
      (node) =>
        node.type === "FormMessage" &&
        node.props.children === "Photo access denied",
    ),
  );
});

test("notifications and history use only authenticated /me endpoints and bodyless read mutations", async () => {
  const calls = [];
  const { activityApi } = load("lib/activity-api.ts", {
    "./api": {
      request: async (path, options) => {
        calls.push({ path, options });
      },
    },
  });
  await activityApi.notifications(2, "token");
  await activityApi.markRead("a/b", "token");
  await activityApi.markAllRead("token");
  await activityApi.history(3, "token");
  await activityApi.action("a/b", "token");
  assert.deepEqual(
    calls.map((call) => call.path),
    [
      "/me/notifications?page=2&limit=10",
      "/me/notifications/a%2Fb/read",
      "/me/notifications/read-all",
      "/me/blog-audit-logs?page=3&limit=10",
      "/me/blog-audit-logs/a%2Fb",
    ],
  );
  for (const { options } of calls)
    assert.equal(options.headers.Authorization, "Bearer token");
  for (const { options } of calls.slice(1, 3)) {
    assert.equal(options.method, "PATCH");
    assert.equal(options.body, undefined);
  }
});

test("private activity pagination deduplicates, retries the failed page, cancels on leave and refreshes on return", async () => {
  const h = hooks();
  let effect,
    fail = false,
    result = { items: [{ id: "a" }], page: 1, totalPages: 2, unreadCount: 4 };
  const calls = [];
  const token = async () => "token";
  const { usePrivatePage } = load("hooks/use-private-page.ts", {
    react: h.react,
    "expo-router": {
      useFocusEffect: (callback) => {
        effect = callback;
      },
    },
    "@/contexts/AuthContext": {
      useAuth: () => ({ user: { id: "owner" }, getAccessToken: token }),
    },
    "@/lib/reading": {
      mergeBlogs: (left, right) => [
        ...new Map([...left, ...right].map((item) => [item.id, item])).values(),
      ],
    },
  });
  const fetchPage = async (...args) => {
    calls.push(args);
    if (fail) throw new Error("offline");
    return result;
  };
  const render = () => {
    h.reset();
    return usePrivatePage(fetchPage);
  };
  render();
  let leave = effect();
  await tick();
  assert.equal(render().unreadCount, 4);
  fail = true;
  render().loadMore();
  await tick();
  assert.equal(render().items.length, 1);
  assert.equal(render().error, "offline");
  fail = false;
  result = {
    items: [{ id: "a", changed: true }, { id: "b" }],
    page: 2,
    totalPages: 2,
    unreadCount: 3,
  };
  render().retry();
  await tick();
  assert.equal(calls.at(-1)[0], 2);
  assert.equal(render().items.length, 2);
  assert.equal(render().items[0].changed, true);
  leave();
  result = { items: [], page: 1, totalPages: 0, unreadCount: 0 };
  leave = effect();
  await tick();
  assert.equal(render().items.length, 0);
  assert.equal(render().unreadCount, 0);
  let resolve;
  result = new Promise((done) => {
    resolve = done;
  });
  render().refresh();
  await tick();
  leave();
  assert.equal(calls.at(-1)[2].aborted, true);
  resolve({ items: [{ id: "late" }], page: 1, totalPages: 1 });
  await tick();
  assert.equal(render().items.length, 0);
});

const notice = {
  id: "notice",
  userId: "owner",
  blogId: "blog",
  blogTitle: "Story",
  message: "An admin removed your post",
  type: "post_deleted",
  readAt: null,
  createdAt: "2026-11-02",
};
function activityScreen(kind, { signedIn = true, failure, wait } = {}) {
  const h = hooks();
  let marks = 0,
    refreshes = 0;
  const mark = async () => {
    marks++;
    await wait;
    if (failure) throw failure;
  };
  const feed = {
    items: [notice],
    unreadCount: 1,
    loading: false,
    error: "",
    refresh: () => refreshes++,
    retry() {},
    loadMore() {},
  };
  const { default: Activity } = load("components/AccountActivity.tsx", {
    react: h.react,
    "react-native": native,
    "expo-router": { Redirect: "Redirect", Link: "Link" },
    "@/contexts/AuthContext": {
      useAuth: () => ({
        user: signedIn ? { id: "owner" } : null,
        getAccessToken: async () => "token",
      }),
    },
    "@/hooks/use-private-page": { usePrivatePage: () => feed },
    "@/lib/activity-api": {
      activityApi: {
        notifications() {},
        history() {},
        markRead: mark,
        markAllRead: mark,
      },
    },
    "@/lib/reading": { formatDate: (value) => value },
    "@/lib/history": load("lib/history.ts"),
    "./PrivateActivityList": {
      __esModule: true,
      default: "PrivateActivityList",
    },
    "./AuthFields": { FormMessage: "FormMessage" },
    "./Screen": { __esModule: true, default: "Screen" },
  });
  return {
    render() {
      h.reset();
      let root = Activity({ kind });
      while (typeof root.type === "function") root = root.type(root.props);
      return root;
    },
    get marks() {
      return marks;
    },
    get refreshes() {
      return refreshes;
    },
  };
}

test("deleted-post notices do not link to posts and read failures remain visible without updating counts", async () => {
  const guest = activityScreen("notifications", { signedIn: false });
  assert.equal(guest.render().type, "Redirect");
  const app = activityScreen("notifications", {
    failure: new Error("offline"),
  });
  const row = app.render().props.renderItem({ item: notice });
  assert.equal(
    elements(row).some((node) => node.type === "Link"),
    false,
  );
  elements(row)
    .find((node) => node.props?.accessibilityLabel === "Mark Story as read")
    .props.onPress();
  await tick();
  assert.equal(app.refreshes, 0);
  assert.ok(
    elements(app.render()).some(
      (node) =>
        node.type === "FormMessage" && node.props.children === "offline",
    ),
  );
  const live = app
    .render()
    .props.renderItem({ item: { ...notice, type: "post_unpublished" } });
  assert.equal(
    elements(live).find((node) => node.type === "Link").props.href.params.id,
    "blog",
  );
});

test("mark all as read prevents duplicate writes and refetches authoritative unread counts", async () => {
  let resolve;
  const app = activityScreen("notifications", {
    wait: new Promise((done) => {
      resolve = done;
    }),
  });
  const button = elements(app.render()).find(
    (node) =>
      node.type === "Pressable" &&
      elements(node).some(
        (child) =>
          child.type === "Text" && child.props.children === "Mark all as read",
      ),
  );
  button.props.onPress();
  button.props.onPress();
  await tick();
  assert.equal(app.marks, 1);
  resolve();
  await tick();
  assert.equal(app.refreshes, 1);
});

test("history formats taxonomy, booleans and removed values without exposing object dumps", () => {
  const { historyValue } = load("lib/history.ts");
  assert.equal(
    historyValue([
      { id: "a", name: "Ballet" },
      { id: "b", name: "Dance" },
    ]),
    "Ballet, Dance",
  );
  assert.equal(historyValue(null), "None");
  assert.equal(historyValue(false), "No");
  assert.equal(historyValue([]), "None");
});

function historyDetail(record) {
  const h = hooks();
  let effect,
    cleanup,
    started = false;
  const { default: Detail } = load("app/history/[id].tsx", {
    react: {
      ...h.react,
      useEffect: (callback) => {
        effect = callback;
      },
    },
    "react-native": native,
    "expo-router": {
      Link: "Link",
      Redirect: "Redirect",
      useLocalSearchParams: () => ({
        id: "11111111-1111-4111-8111-111111111111",
      }),
    },
    "@/contexts/AuthContext": {
      useAuth: () => ({
        user: { id: "owner" },
        getAccessToken: async () => "token",
      }),
    },
    "@/hooks/use-theme": { useTheme: () => ({ colors: {} }) },
    "@/lib/activity-api": { activityApi: { action: async () => record } },
    "@/lib/history": load("lib/history.ts"),
    "@/lib/reading": { formatDate: (value) => value },
    "@/components/FormScreen": { __esModule: true, default: "FormScreen" },
    "@/components/StateMessage": { __esModule: true, default: "StateMessage" },
    "@/components/MarkdownBody": { __esModule: true, default: "MarkdownBody" },
    "@/components/ArticleImage": { __esModule: true, default: "ArticleImage" },
  });
  return {
    render() {
      h.reset();
      const outer = Detail();
      const root = outer.type(outer.props);
      if (!started) {
        started = true;
        cleanup = effect();
      }
      return root;
    },
    leave() {
      cleanup?.();
    },
  };
}

test("history detail rejects another actor's record and preserves a deletion snapshot without a restore action", async () => {
  const snapshot = {
    title: "Deleted title",
    content: "Old content",
    categoryName: "Life",
    tags: [],
    coverImageUrl: null,
    status: "draft",
  };
  const record = {
    id: "action",
    actorId: "other",
    postAuthorId: "owner",
    blogId: "blog",
    blogTitle: "Story",
    action: "deleted",
    createdAt: "2026-11-02",
    changes: {},
    snapshot,
  };
  const denied = historyDetail(record);
  denied.render();
  await tick();
  assert.ok(
    elements(denied.render()).some((node) => node.type === "StateMessage"),
  );
  assert.equal(
    elements(denied.render()).some((node) => node.type === "MarkdownBody"),
    false,
  );
  denied.leave();
  const own = historyDetail({ ...record, actorId: "owner" });
  own.render();
  await tick();
  assert.equal(
    elements(own.render()).find((node) => node.type === "MarkdownBody").props
      .content,
    "Old content",
  );
  assert.equal(
    elements(own.render()).some((node) => node.type === "Link"),
    false,
  );
  own.leave();
});

test("late private history responses are ignored after the screen is left", async () => {
  let resolve;
  const app = historyDetail(
    new Promise((done) => {
      resolve = done;
    }),
  );
  app.render();
  await tick();
  app.leave();
  resolve({
    actorId: "owner",
    changes: {},
    action: "updated",
    snapshot: null,
    createdAt: "2026-11-02",
  });
  await tick();
  assert.equal(
    elements(app.render()).some((node) => node.type === "ActivityIndicator"),
    true,
  );
});
