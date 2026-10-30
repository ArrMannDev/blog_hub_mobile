import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
const module = { exports: {} };
const source = readFileSync(
  new URL("../src/contexts/BlogContext.tsx", import.meta.url),
  "utf8",
);
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
});
runInNewContext(outputText, {
  exports: module.exports,
  require: (name) => {
    if (name === "@/lib/api") return { api: {} };
    if (name === "@/lib/reading") return require("../src/lib/reading.ts");
    return require(name);
  },
});
const { blogReducer } = module.exports;
const page = (ids, number = 1, totalPages = 2) => ({
  items: ids.map((id) => ({ id })),
  page: number,
  totalPages,
});

test("Home and filtered Explore results remain independent", () => {
  let feeds = blogReducer(
    {},
    { type: "success", query: "", result: page(["home"]) },
  );
  const home = feeds[""];
  feeds = blogReducer(feeds, {
    type: "success",
    query: "q=art",
    result: page(["search"]),
  });
  assert.equal(feeds[""], home);
  assert.equal(feeds["q=art"].items[0].id, "search");
  assert.equal(home.initialized, true);
});

test("pagination deduplicates overlapping pages and refresh replaces old items", () => {
  let feeds = blogReducer(
    {},
    { type: "success", query: "", result: page(["a", "b"]) },
  );
  feeds = blogReducer(feeds, {
    type: "success",
    query: "",
    result: page(["b", "c"], 2),
  });
  assert.equal(feeds[""].items.map(({ id }) => id).join(","), "a,b,c");
  assert.equal(feeds[""].hasMore, false);
  feeds = blogReducer(feeds, {
    type: "success",
    query: "",
    result: page(["fresh"]),
  });
  assert.equal(feeds[""].items.map(({ id }) => id).join(","), "fresh");
});

test("failed requests preserve loaded items and the exact page to retry", () => {
  let feeds = blogReducer(
    {},
    { type: "success", query: "", result: page(["a"]) },
  );
  feeds = blogReducer(feeds, {
    type: "request",
    query: "",
    page: 2,
    refresh: false,
  });
  feeds = blogReducer(feeds, { type: "failure", query: "" });
  assert.equal(feeds[""].items[0].id, "a");
  assert.equal(feeds[""].requestedPage, 2);
  assert.equal(feeds[""].loading, false);
  assert.equal(feeds[""].error, true);
  feeds = blogReducer(feeds, {
    type: "request",
    query: "",
    page: 1,
    refresh: true,
  });
  assert.equal(feeds[""].refreshing, true);
  assert.equal(feeds[""].error, false);
});
