import assert from "node:assert/strict";
import test from "node:test";
import { load } from "./helpers/offline.mjs";

const tick = () => new Promise(setImmediate);
const summary = { likeCount: 3, dislikeCount: 1, myReaction: null };
const comment = {
  id: "comment",
  blogId: "blog",
  parentId: null,
  author: { id: "owner", displayName: "Writer" },
  content: "Hello",
  replyCount: 2,
  likeCount: 0,
  dislikeCount: 0,
  createdAt: "2026-11-03T01:00:00Z",
  updatedAt: "2026-11-03T01:00:00Z",
};

function hooks() {
  const states = [],
    refs = [];
  let index = 0,
    refIndex = 0,
    focus;
  return {
    reset() {
      index = refIndex = 0;
    },
    start() {
      return focus();
    },
    react: {
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
      useCallback: (fn) => fn,
      useEffect() {},
    },
    router: {
      useFocusEffect(fn) {
        focus = fn;
      },
    },
  };
}

function elements(node) {
  if (!node || typeof node !== "object") return [];
  if (Array.isArray(node)) return node.flatMap(elements);
  return [node, ...elements(node.props?.children)];
}

test("discussion API matches Swagger, encodes IDs, trims plaintext, and authenticates only writes/personalized reads", async () => {
  const calls = [];
  const api = load("lib/discussion-api.ts", {
    "./api": {
      request: async (path, options) => {
        calls.push({ path, options });
      },
    },
  });
  assert.throws(() => api.commentContent(" \n "));
  assert.throws(() => api.commentContent("a".repeat(2001)));
  assert.equal(api.commentContent(" 😀 "), "😀");
  assert.doesNotThrow(() => api.commentContent("😀".repeat(2000)));
  await api.discussionApi.comments("a/b", 2);
  await api.discussionApi.comments("blog", 1, "c/d");
  await api.discussionApi.save("a/b", " <b>plain</b> ", "token");
  await api.discussionApi.save("blog", "reply", "token", { parentId: "c/d" });
  await api.discussionApi.save("blog", "edit", "token", { editId: "c/d" });
  await api.discussionApi.remove("c/d", "token");
  await api.discussionApi.reactions("blogs", "a/b");
  await api.discussionApi.reactions("comments", "c/d", "token");
  await api.discussionApi.react("comments", "c/d", "dislike", "token");
  assert.equal(calls[0].path, "/blogs/a%2Fb/comments?page=2&limit=10");
  assert.equal(calls[1].path, "/comments/c%2Fd/replies?page=1&limit=10");
  assert.equal(calls[2].options.method, "POST");
  assert.deepEqual(JSON.parse(calls[2].options.body), {
    content: "<b>plain</b>",
  });
  assert.equal(calls[3].path, "/comments/c%2Fd/replies");
  assert.equal(calls[4].options.method, "PATCH");
  assert.equal(calls[5].options.method, "DELETE");
  assert.equal(calls[5].options.body, undefined);
  assert.equal(calls[6].options.headers, undefined);
  assert.equal(calls[7].options.headers.Authorization, "Bearer token");
  assert.deepEqual(JSON.parse(calls[8].options.body), { type: "dislike" });
});

test("comment pagination deduplicates, retries failed pages without dropping text, and ignores cancelled reads", async () => {
  const h = hooks(),
    requests = [];
  const { useComments } = load("hooks/use-comments.ts", {
    react: h.react,
    "expo-router": h.router,
    "@/lib/discussion-api": {
      discussionApi: {
        comments: (...args) =>
          new Promise((resolve, reject) =>
            requests.push({ args, resolve, reject }),
          ),
      },
    },
    "@/lib/reading": {
      mergeBlogs: (a, b) => [
        ...new Map([...a, ...b].map((item) => [item.id, item])).values(),
      ],
    },
  });
  const render = () => {
    h.reset();
    return useComments("blog");
  };
  render();
  const stop = h.start();
  requests[0].resolve({ items: [comment], total: 3, page: 1, totalPages: 3 });
  await tick();
  render().loadMore();
  requests[1].reject(new Error("Offline"));
  await tick();
  assert.equal(render().items.length, 1);
  assert.equal(render().error, "Offline");
  render().retry();
  assert.equal(requests[2].args[1], 2);
  requests[2].resolve({
    items: [comment, { ...comment, id: "second" }],
    total: 3,
    page: 2,
    totalPages: 3,
  });
  await tick();
  assert.equal(render().items.length, 2);
  render().loadMore();
  stop();
  requests[3].resolve({
    items: [{ ...comment, id: "late" }],
    total: 3,
    page: 3,
    totalPages: 3,
  });
  await tick();
  assert.equal(render().items.length, 2);
  assert.equal(requests[3].args[3].aborted, true);
});

test("reaction toggles block duplicates and reconcile uncertain outcomes with a read, never a second POST", async () => {
  const h = hooks();
  let current = { ...summary },
    sends = 0,
    reads = 0,
    rejectRead = false,
    finish;
  const { useReactions } = load("hooks/use-reactions.ts", {
    react: h.react,
    "expo-router": h.router,
    "@/contexts/AuthContext": {
      useAuth: () => ({
        user: { id: "owner" },
        getAccessToken: async () => "token",
      }),
    },
    "@/lib/discussion-api": {
      discussionApi: {
        reactions: async () => {
          reads++;
          if (rejectRead) throw new Error("offline");
          return current;
        },
        react: async () => {
          sends++;
          await new Promise((resolve) => {
            finish = resolve;
          });
          current = { ...summary, likeCount: 4, myReaction: "like" };
          throw new Error("Lost response after commit");
        },
      },
    },
  });
  const render = () => {
    h.reset();
    return useReactions("blogs", "blog");
  };
  render();
  const stop = h.start();
  await tick();
  assert.equal(render().ready, true);
  const first = render().react("like");
  await tick();
  await render().react("like");
  assert.equal(sends, 1);
  finish();
  await first;
  assert.equal(reads, 2);
  assert.equal(render().myReaction, "like");
  assert.equal(render().likeCount, 4);
  assert.equal(render().busy, false);
  rejectRead = true;
  await render().refresh();
  assert.equal(render().ready, false);
  await render().react("like");
  assert.equal(sends, 1);
  stop();
});

function discussionFixture() {
  const h = hooks(),
    writes = [],
    routes = [],
    alerts = [];
  let user = { id: "owner", role: "author" },
    outcome,
    finish,
    failure;
  const api = load("lib/discussion-api.ts", { "./api": { request() {} } });
  const component = load("components/ArticleDiscussion.tsx", {
    react: h.react,
    "@expo/vector-icons/Ionicons": { __esModule: true, default: "Icon" },
    "expo-router": { router: { push: (route) => routes.push(route) } },
    "react-native": {
      Alert: { alert: (...args) => alerts.push(args) },
      Platform: { OS: "ios" },
      KeyboardAvoidingView: "KeyboardAvoidingView",
      FlatList: "FlatList",
      Pressable: "Pressable",
      Text: "Text",
      TextInput: "TextInput",
      View: "View",
    },
    "react-native-safe-area-context": {
      useSafeAreaInsets: () => ({ top: 20 }),
    },
    "@/contexts/AuthContext": {
      useAuth: () => ({
        user,
        getAccessToken: async () => "token",
        isRestoring: false,
      }),
    },
    "@/hooks/use-comments": {
      useComments: () => ({
        items: [comment],
        total: 1,
        refresh() {},
        retry() {},
      }),
    },
    "@/hooks/use-theme": { useTheme: () => ({ colors: {} }) },
    "@/lib/api": { ApiError: class extends Error {} },
    "@/lib/discussion-api": {
      commentContent: api.commentContent,
      discussionApi: {
        async save(...args) {
          writes.push(args);
          await new Promise((resolve) => {
            finish = resolve;
          });
          if (failure) throw failure;
          return outcome;
        },
        async remove(id) {
          writes.push(["delete", id]);
        },
      },
    },
    "./CommentItem": { __esModule: true, default: "CommentItem" },
    "./ReactionBar": { __esModule: true, default: "ReactionBar" },
  });
  const outer = () =>
    component.default({
      blogId: "blog",
      children: "Article",
      openComments: true,
    });
  const render = () => {
    h.reset();
    const root = outer();
    return root.type(root.props);
  };
  const nodes = () => elements(render());
  return {
    outer,
    render,
    nodes,
    writes,
    routes,
    alerts,
    input: () => nodes().find((node) => node.type === "TextInput"),
    button: () =>
      nodes().find((node) =>
        ["Send comment", "Save comment"].includes(
          node.props?.accessibilityLabel,
        ),
      ),
    actions: () =>
      nodes()
        .find((node) => node.type === "FlatList")
        .props.renderItem({ item: comment }).props.children.props,
    finish() {
      finish();
    },
    set user(value) {
      user = value;
    },
    set failure(value) {
      failure = value;
    },
  };
}

test("comment composer blocks duplicate sends, clears confirmed text, and scopes private drafts to the account", async () => {
  const f = discussionFixture();
  f.input().props.onChangeText(" Hello ");
  f.button().props.onPress();
  await tick();
  f.button().props.onPress();
  await tick();
  assert.equal(f.writes.length, 1);
  assert.equal(f.writes[0][1], "Hello");
  f.finish();
  await tick();
  assert.equal(f.input().props.value, "");
  const ownKey = f.outer().key;
  f.user = { id: "other" };
  assert.notEqual(f.outer().key, ownKey);
  f.user = null;
  const signIn = f
    .nodes()
    .find(
      (node) =>
        node.props?.onPress &&
        elements(node).some(
          (child) => child.props?.children === "Sign in to write a comment",
        ),
    );
  signIn.props.onPress();
  assert.equal(f.routes[0].params.action, "sign-in");
});

test("uncertain comment creation preserves text and disables replay; replies target the top-level comment", async () => {
  const f = discussionFixture();
  f.actions().onReply({ ...comment, id: "reply", parentId: "parent" });
  f.input().props.onChangeText("Reply text");
  f.failure = new Error("timeout");
  f.button().props.onPress();
  await tick();
  f.finish();
  await tick();
  assert.equal(f.writes[0][3].parentId, "parent");
  assert.equal(f.input().props.value, "Reply text");
  assert.equal(f.button().props.disabled, true);
  f.button().props.onPress();
  await tick();
  assert.equal(f.writes.length, 1);
});

test("edit/delete enforce ownership and deleting a top-level comment asks about cascading replies", async () => {
  const f = discussionFixture();
  f.actions().onEdit({
    ...comment,
    author: { id: "other", displayName: "Other" },
  });
  assert.equal(f.input().props.value, "");
  f.actions().onEdit(comment);
  assert.equal(f.input().props.value, comment.content);
  f.input().props.onChangeText("Changed");
  f.actions().onEdit(comment);
  assert.equal(
    f.input().props.value,
    "Changed",
    "Repeated Edit must preserve unsaved text",
  );
  f.button().props.onPress();
  await tick();
  f.finish();
  await tick();
  assert.equal(f.writes[0][3].editId, comment.id);
  f.actions().onDelete({
    ...comment,
    author: { id: "other", displayName: "Other" },
  });
  assert.equal(f.alerts.length, 0);
  f.actions().onDelete(comment);
  assert.match(f.alerts[0][1], /all its replies/);
  assert.equal(f.writes.length, 1);
  f.alerts[0][2][1].onPress();
  await tick();
  assert.equal(f.writes[1][0], "delete");
});

test("comment rows show edit only for the author and allow admin deletion without admin editing", () => {
  const h = hooks();
  let user = null;
  const { default: CommentItem } = load("components/CommentItem.tsx", {
    react: h.react,
    "react-native": { Pressable: "Pressable", Text: "Text", View: "View" },
    "@/contexts/AuthContext": { useAuth: () => ({ user }) },
    "@/hooks/use-comments": { useComments: () => ({ items: [] }) },
    "@/lib/reading": { formatDate: () => "Nov 3", initials: () => "W" },
    "./ReactionBar": { __esModule: true, default: "ReactionBar" },
  });
  const labels = () => {
    h.reset();
    return elements(
      CommentItem({
        comment,
        busy: false,
        revision: 0,
        onReply() {},
        onEdit() {},
        onDelete() {},
      }),
    )
      .map((node) => node.props?.accessibilityLabel)
      .filter(Boolean);
  };
  assert.equal(labels().length, 0);
  user = { id: "other", role: "author" };
  assert.equal(labels().length, 0);
  user = { id: "admin", role: "admin" };
  assert.equal(labels().length, 0);
  user.permissions = ["comments.delete"];
  assert.deepEqual(labels(), ["Delete comment by Writer"]);
  user = { id: "owner", role: "author" };
  assert.deepEqual(labels(), [
    "Edit comment by Writer",
    "Delete comment by Writer",
  ]);
});

test("feed reactions refresh counts, open comments, isolate account reactions, and ignore late reads", async () => {
  const h = hooks(),
    requests = [],
    routes = [];
  let user = null;
  const { default: FeedReactions } = load("components/FeedReactions.tsx", {
    react: h.react,
    "expo-router": {
      ...h.router,
      router: { push: (route) => routes.push(route) },
    },
    "@/contexts/AuthContext": { useAuth: () => ({ user }) },
    "@/lib/discussion-api": {
      discussionApi: {
        commentCount: (id, signal) =>
          new Promise((resolve) => requests.push({ id, signal, resolve })),
      },
    },
    "./ReactionBar": { __esModule: true, default: "ReactionBar" },
  });
  const render = () => {
    h.reset();
    return FeedReactions({ id: "blog", slug: "story" });
  };
  const guestKey = render().key;
  const stop = h.start();
  assert.equal(render().props.commentCount, undefined);
  requests[0].resolve(12);
  await tick();
  assert.equal(render().props.commentCount, 12);
  render().props.onComment();
  assert.equal(routes[0].params.comments, "1");
  assert.equal(routes[0].params.slug, "story");
  user = { id: "owner" };
  assert.notEqual(render().key, guestKey);
  stop();
  const stopAgain = h.start();
  stopAgain();
  requests[1].resolve(99);
  await tick();
  assert.equal(render().props.commentCount, 12);
  assert.equal(requests[1].signal.aborted, true);
});

test("feed counts request one comment rather than downloading a full page", async () => {
  let path;
  const { discussionApi } = load("lib/discussion-api.ts", {
    "./api": {
      request: async (value) => {
        path = value;
        return { total: 12 };
      },
    },
  });
  assert.equal(await discussionApi.commentCount("a/b"), 12);
  assert.equal(path, "/blogs/a%2Fb/comments?page=1&limit=1");
});

test("opening from a feed comment button scrolls to the discussion once", () => {
  const f = discussionFixture();
  const list = f.nodes().find((node) => node.type === "FlatList");
  const offsets = [];
  list.props.ref.current = {
    scrollToOffset: (options) => offsets.push(options.offset),
  };
  const heading = elements(list.props.ListHeaderComponent).find(
    (node) => node.props?.onLayout,
  );
  heading.props.onLayout({ nativeEvent: { layout: { y: 720 } } });
  list.props.onContentSizeChange();
  list.props.onContentSizeChange();
  assert.deepEqual(offsets, [720]);
});
