import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
const tick = () => new Promise(setImmediate);
function load(path, mocks) {
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
    require: (name) => (name in mocks ? mocks[name] : require(name)),
  });
  return module.exports;
}
class ApiError extends Error {
  constructor(status) {
    super(`HTTP ${status}`);
    this.status = status;
  }
}
const apiModule = load("lib/taxonomy-api.ts", {
  "./api": { request: async () => {} },
});

test("taxonomy names normalize whitespace and reject invalid names", () => {
  const { taxonomyName } = apiModule;
  assert.equal(taxonomyName("  Web \n Development "), "Web Development");
  assert.equal(taxonomyName("မြန်မာ"), "မြန်မာ");
  for (const name of ["", "  ", "---", "🌿", "x".repeat(101)])
    assert.throws(() => taxonomyName(name));
  assert.equal(taxonomyName("x".repeat(100)).length, 100);
  assert.equal([...taxonomyName("𐐀".repeat(100))].length, 100);
});

test("taxonomy CRUD uses correct paths, credentials and whitelisted bodies", async () => {
  const calls = [];
  const { taxonomyApi } = load("lib/taxonomy-api.ts", {
    "./api": {
      request: async (path, options) => {
        calls.push({ path, options });
      },
    },
  });
  await taxonomyApi.list("tags", "a/b");
  await taxonomyApi.save(
    "categories",
    { name: " Life ", createdById: "fake" },
    "token",
  );
  await taxonomyApi.save(
    "tags",
    { name: " Dance ", categoryId: "parent" },
    "token",
  );
  await taxonomyApi.save(
    "tags",
    { id: "a/b", name: "Ballet", categoryId: "must-not-move" },
    "token",
  );
  await taxonomyApi.remove("categories", "a/b", "token");
  assert.equal(calls[0].path, "/tags?categoryId=a%2Fb");
  assert.deepEqual(JSON.parse(calls[1].options.body), { name: "Life" });
  assert.equal(calls[1].options.method, "POST");
  assert.deepEqual(JSON.parse(calls[2].options.body), {
    name: "Dance",
    categoryId: "parent",
  });
  assert.equal(calls[3].path, "/tags/a%2Fb");
  assert.equal(calls[3].options.method, "PATCH");
  assert.deepEqual(JSON.parse(calls[3].options.body), { name: "Ballet" });
  assert.equal(calls[4].path, "/categories/a%2Fb");
  assert.equal(calls[4].options.method, "DELETE");
  assert.equal(calls[4].options.body, undefined);
  assert.equal(calls[4].options.headers.Authorization, "Bearer token");
  assert.throws(() =>
    taxonomyApi.save("tags", { name: "Missing parent" }, "token"),
  );
  assert.equal(calls.length, 5);
});

function elements(node) {
  if (!node || typeof node !== "object") return [];
  return [node, ...[].concat(node.props?.children ?? []).flatMap(elements)];
}
const entry = { id: "item", name: "Life", slug: "life", createdById: "owner" };
function screen(
  file,
  {
    role = "author",
    userId = "owner",
    params = {},
    failure,
    readFailure,
    wait,
    signedIn = true,
  } = {},
) {
  const states = [],
    refs = [],
    calls = [],
    destinations = [];
  let index,
    refIndex,
    effect,
    cleanup,
    alert,
    invalidated = 0;
  const user = signedIn ? { id: userId, role } : null;
  const react = {
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
    useRef: (initial) => (refs[refIndex++] ??= { current: initial }),
    useContext: () => ({ invalidate: () => invalidated++ }),
    useCallback: (callback) => callback,
  };
  const mutation = async (...args) => {
    calls.push(args);
    await wait;
    if (failure) throw failure;
    return entry;
  };
  const { default: Page } = load(`app/topics/${file}.tsx`, {
    react,
    "expo-router": {
      Link: "Link",
      Redirect: "Redirect",
      useLocalSearchParams: () => params,
      useFocusEffect: (callback) => {
        effect = callback;
      },
      usePreventRemove: () => {},
      router: {
        back: () => destinations.push("back"),
        canGoBack: () => true,
        replace: (value) => destinations.push(value),
      },
    },
    "react-native": {
      View: "View",
      Text: "Text",
      Pressable: "Pressable",
      FlatList: "FlatList",
      ActivityIndicator: "ActivityIndicator",
      Platform: { OS: "ios" },
      Alert: {
        alert: (...args) => {
          alert = args;
        },
      },
    },
    "@expo/vector-icons/Ionicons": { __esModule: true, default: "Icon" },
    "@/components/Screen": { __esModule: true, default: "Screen" },
    "@/components/FormScreen": { __esModule: true, default: "FormScreen" },
    "@/components/AuthFields": {
      FormMessage: "FormMessage",
      FormField: "FormField",
      SubmitButton: "SubmitButton",
    },
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
    "@/lib/taxonomy-api": {
      ...apiModule,
      taxonomyApi: {
        list: async () => {
          if (readFailure) throw readFailure;
          return [entry];
        },
        remove: mutation,
        save: mutation,
      },
    },
  });
  function render() {
    index = refIndex = 0;
    let root = Page();
    while (typeof root.type === "function") root = root.type(root.props);
    return root;
  }
  const list = () =>
    elements(render()).find((node) => node.type === "FlatList");
  const row = () => list().props.renderItem({ item: entry });
  return {
    render,
    list,
    row,
    calls,
    destinations,
    button: (label) =>
      elements(row()).find((node) => node.props?.accessibilityLabel === label),
    submit: () =>
      elements(render()).find((node) => node.type === "SubmitButton"),
    field: () => elements(render()).find((node) => node.type === "FormField"),
    async focus() {
      render();
      cleanup = effect();
      await tick();
    },
    blur() {
      cleanup?.();
    },
    get alert() {
      return alert;
    },
    get invalidated() {
      return invalidated;
    },
  };
}

test("guest management redirects to sign-in; authors can rename only their own entries", () => {
  assert.equal(screen("index", { signedIn: false }).render().type, "Redirect");
  assert.ok(screen("index").button("Rename Life"));
  assert.equal(
    screen("index", { userId: "other" }).button("Rename Life"),
    undefined,
  );
  assert.ok(screen("index").button("Delete Life"));
  assert.equal(
    screen("index", { userId: "other" }).button("Delete Life"),
    undefined,
  );
  assert.equal(
    screen("index", { userId: "other", role: "admin" }).button("Rename Life"),
    undefined,
  );
});

for (const kind of ["categories", "tags"]) {
  test(`${kind}: another author has no management actions, while an admin can delete the same entry`, async () => {
    const params = kind === "tags" ? { categoryId: "parent" } : {};
    const otherAuthor = screen("index", { params, userId: "other" });
    await otherAuthor.focus();
    assert.equal(otherAuthor.button("Rename Life"), undefined);
    assert.equal(otherAuthor.button("Delete Life"), undefined);
    assert.equal(otherAuthor.calls.length, 0);
    otherAuthor.blur();

    const admin = screen("index", { params, userId: "other", role: "admin" });
    await admin.focus();
    assert.equal(admin.button("Rename Life"), undefined);
    admin.button("Delete Life").props.onPress();
    admin.alert[2][1].onPress();
    await tick();
    assert.deepEqual(admin.calls[0], [kind, "item", "token"]);
    assert.equal(admin.invalidated, 1);
    admin.blur();
  });

  test(`${kind}: a direct rename link checks server ownership and uses the server name`, async () => {
    const params = {
      kind,
      id: "item",
      name: "Forged name",
      categoryId: kind === "tags" ? "parent" : "",
    };
    for (const role of ["author", "admin"]) {
      const denied = screen("edit", { params, userId: "other", role });
      await denied.focus();
      assert.equal(denied.field(), undefined);
      assert.equal(denied.submit(), undefined);
      assert.equal(denied.calls.length, 0);
      denied.blur();
    }
    for (const account of [
      { userId: "owner" },
      { userId: "owner", role: "admin" },
    ]) {
      const allowed = screen("edit", { params, ...account });
      await allowed.focus();
      assert.equal(allowed.field().props.value, "Life");
      allowed.field().props.onChangeText("New name");
      allowed.submit().props.onPress();
      await tick();
      assert.equal(allowed.calls.length, 1);
      assert.equal(allowed.calls[0][1].id, "item");
      allowed.blur();
    }
  });

  test(`${kind}: the author can delete their own entry after confirmation`, async () => {
    const app = screen("index", {
      params: kind === "tags" ? { categoryId: "parent" } : {},
    });
    await app.focus();
    app.button("Delete Life").props.onPress();
    assert.equal(app.calls.length, 0);
    app.alert[2][1].onPress();
    await tick();
    assert.equal(app.calls[0][0], kind);
    assert.equal(app.calls[0][1], "item");
    assert.equal(app.invalidated, 1);
    app.blur();
  });
}

test("failed ownership lookup never exposes the rename form", async () => {
  const app = screen("edit", {
    params: { kind: "categories", id: "item" },
    readFailure: new Error("offline"),
  });
  await app.focus();
  assert.equal(app.field(), undefined);
  assert.equal(app.submit().props.label, "Try again");
  assert.equal(app.calls.length, 0);
  app.blur();
});

test("admin delete requires confirmation, explains cascading tags and prevents duplicate writes", async () => {
  let resolve;
  const app = screen("index", {
    role: "admin",
    wait: new Promise((done) => {
      resolve = done;
    }),
  });
  await app.focus();
  app.button("Delete Life").props.onPress();
  assert.equal(app.calls.length, 0);
  assert.equal(app.alert[2][0].style, "cancel");
  assert.match(app.alert[1], /All tags.*deleted/);
  assert.match(app.alert[1], /Post content is kept/);
  app.alert[2][1].onPress();
  app.alert[2][1].onPress();
  await tick();
  assert.equal(app.calls.length, 1);
  assert.deepEqual(app.calls[0], ["categories", "item", "token"]);
  resolve();
  await tick();
  assert.equal(app.invalidated, 1);
  assert.equal(app.list().props.data.length, 0);
  app.blur();
});

test("failed deletion keeps the entry and displays the server error", async () => {
  const app = screen("index", { role: "admin", failure: new ApiError(403) });
  await app.focus();
  app.button("Delete Life").props.onPress();
  app.alert[2][1].onPress();
  await tick();
  assert.equal(app.list().props.data.length, 1);
  assert.equal(app.invalidated, 0);
  assert.ok(
    elements(app.list().props.ListHeaderComponent).some(
      (node) =>
        node.type === "FormMessage" && node.props.children === "HTTP 403",
    ),
  );
  app.blur();
});

test("tag deletion describes removal from posts without deleting the parent category", () => {
  const app = screen("index", {
    role: "admin",
    params: { categoryId: "parent" },
  });
  app.button("Delete Life").props.onPress();
  assert.match(app.alert[1], /removed from every post/);
  assert.doesNotMatch(app.alert[1], /All tags/);
});

test("form validates before requesting and blocks duplicate saves", async () => {
  let resolve;
  const app = screen("edit", {
    params: { kind: "tags", categoryId: "parent" },
    wait: new Promise((done) => {
      resolve = done;
    }),
  });
  app.field().props.onChangeText("---");
  app.submit().props.onPress();
  await tick();
  assert.equal(app.calls.length, 0);
  app.field().props.onChangeText("  Garden  life ");
  app.submit().props.onPress();
  app.submit().props.onPress();
  await tick();
  assert.equal(app.calls.length, 1);
  assert.equal(app.calls[0][1].name, "Garden life");
  assert.equal(app.calls[0][1].categoryId, "parent");
  resolve();
  await tick();
  assert.equal(app.invalidated, 1);
  assert.equal(app.destinations[0], "back");
  app.submit().props.onPress();
  await tick();
  assert.equal(app.calls.length, 1);
});

test("ambiguous creation blocks resubmission and preserves the name for checking the list", async () => {
  const app = screen("edit", {
    params: { kind: "categories" },
    failure: new Error("offline"),
  });
  app.field().props.onChangeText("Garden");
  app.submit().props.onPress();
  await tick();
  assert.equal(app.submit().props.disabled, true);
  assert.equal(app.field().props.value, "Garden");
  app.submit().props.onPress();
  await tick();
  assert.equal(app.calls.length, 1);
  assert.equal(app.destinations.length, 0);
});

test("duplicate name errors allow correction; tags require a parent", async () => {
  const invalid = screen("edit", { params: { kind: "tags" } });
  assert.equal(invalid.render().type, "Redirect");
  const app = screen("edit", {
    params: { kind: "categories" },
    failure: new ApiError(409),
  });
  app.field().props.onChangeText("Garden");
  app.submit().props.onPress();
  await tick();
  assert.equal(app.submit().props.disabled, false);
  assert.equal(app.field().props.editable, true);
  assert.ok(
    elements(app.render()).some(
      (node) =>
        node.type === "FormMessage" && node.props.children === "HTTP 409",
    ),
  );
});

for (const resource of ["categories", "tags"]) {
  test(`${resource} refresh on screen focus and ignore results after leaving`, async () => {
    const states = [];
    const requests = [];
    let index, effect;
    const exported = resource === "tags" ? "useTags" : "useCategories";
    const module = load(`hooks/use-${resource}.ts`, {
      react: {
        useCallback: (callback) => callback,
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
      },
      "expo-router": {
        useFocusEffect: (callback) => {
          effect = callback;
        },
      },
      "@/lib/api": {
        api: {
          [resource]: (...args) =>
            new Promise((resolve) =>
              requests.push({ resolve, signal: args.at(-1) }),
            ),
        },
      },
    });
    function render() {
      index = 0;
      return module[exported]("parent");
    }
    render();
    const leave = effect();
    requests[0].resolve([entry]);
    await tick();
    assert.equal(render()[resource][0].name, "Life");
    leave();
    const leaveAgain = effect();
    assert.equal(render().loading, true);
    requests[1].resolve([{ ...entry, name: "Renamed" }]);
    await tick();
    assert.equal(render()[resource][0].name, "Renamed");
    leaveAgain();
    const lastLeave = effect();
    lastLeave();
    requests[2].resolve([{ ...entry, name: "Stale" }]);
    await tick();
    assert.equal(requests[2].signal.aborted, true);
    assert.notEqual(render()[resource][0]?.name, "Stale");
  });
}
