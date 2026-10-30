import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
const source = readFileSync(
  new URL("../src/contexts/BlogContext.tsx", import.meta.url),
  "utf8",
);
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
});
const page = (ids, number = 1, totalPages = 2) => ({
  items: ids.map((id) => ({ id })),
  page: number,
  totalPages,
});

// Run the real provider handlers with controlled state and network boundaries.
function setup(fetchBlogs) {
  let state = {};
  let context = null;
  let cleanup;
  const requests = { current: new Map() };
  const react = {
    ...require("react"),
    useState: () => [
      state,
      (update) => {
        state = typeof update === "function" ? update(state) : update;
      },
    ],
    useRef: () => requests,
    useCallback: (callback) => callback,
    useContext: () => context,
    useEffect: (effect) => {
      const result = effect();
      if (result) cleanup = result;
    },
  };
  const module = { exports: {} };
  runInNewContext(outputText, {
    exports: module.exports,
    AbortController,
    URLSearchParams,
    require: (name) => {
      if (name === "react") return react;
      if (name === "@/lib/api") return { api: { blogs: fetchBlogs } };
      if (name === "@/lib/reading") return require("../src/lib/reading.ts");
      return require(name);
    },
  });
  return {
    render: () => {
      context = module.exports.BlogContextProvider({ children: null }).props
        .value;
      return context;
    },
    useBlogs: module.exports.useBlogs,
    cleanup: () => cleanup(),
  };
}

test("query caches remain independent and cached hook reads do not refetch", async () => {
  let calls = 0;
  const app = setup(async (query) => {
    calls++;
    return page([query.includes("q=") ? "search" : "home"]);
  });
  await app.render().load("", 1);
  await app.render().load("category=tech&q=art", 1);
  const { feeds } = app.render();
  assert.equal(feeds[""].items[0].id, "home");
  assert.equal(feeds["category=tech&q=art"].items[0].id, "search");
  assert.equal(app.useBlogs("q=art&category=tech").items[0].id, "search");
  assert.equal(calls, 2);
});

test("pagination deduplicates pages, errors preserve data, and refresh replaces it", async () => {
  let result = page(["a", "b"]);
  let fail = false;
  const app = setup(async () => {
    if (fail) throw new Error("offline");
    return result;
  });
  await app.render().load("", 1);
  result = page(["b", "c"], 2);
  await app.render().load("", 2);
  assert.equal(
    app
      .render()
      .feeds[""].items.map(({ id }) => id)
      .join(","),
    "a,b,c",
  );
  fail = true;
  await app.render().load("", 3);
  const failed = app.render().feeds[""];
  assert.equal(failed.requestedPage, 3);
  assert.equal(failed.error, true);
  assert.equal(failed.items.length, 3);
  fail = false;
  result = page(["fresh"]);
  await app.render().load("", 1, true);
  assert.equal(app.render().feeds[""].items[0].id, "fresh");
  assert.equal(app.render().feeds[""].items.length, 1);
});

test("duplicate requests are deduplicated and a stale response cannot overwrite refresh", async () => {
  const pending = [];
  const app = setup(
    (_query, signal) =>
      new Promise((resolve) => pending.push({ resolve, signal })),
  );
  const old = app.render().load("", 1);
  await app.render().load("", 1);
  assert.equal(pending.length, 1);
  const fresh = app.render().load("", 1, true);
  assert.equal(pending[0].signal.aborted, true);
  pending[1].resolve(page(["new"]));
  await fresh;
  pending[0].resolve(page(["old"]));
  await old;
  assert.equal(app.render().feeds[""].items[0].id, "new");
});

test("provider cleanup cancels requests and useBlogs guards missing providers", () => {
  let signal;
  const app = setup((_query, requestSignal) => {
    signal = requestSignal;
    return new Promise(() => {});
  });
  assert.throws(() => app.useBlogs(), /within a BlogContextProvider/);
  void app.render().load("", 1);
  app.cleanup();
  assert.equal(signal.aborted, true);
});
