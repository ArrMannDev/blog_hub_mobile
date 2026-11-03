import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { createRequire } from 'node:module';
import ts from "typescript";
const require=createRequire(import.meta.url);

export function load(path, dependencies = {}, globals = {}) {
  const source = readFileSync(
    new URL(`../../src/${path}`, import.meta.url),
    "utf8",
  );

  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx:ts.JsxEmit.ReactJSX,
    },
  });

  const module = { exports: {} };

  runInNewContext(outputText, {
    Error,
    AbortController,
    FormData,
    ...globals,
    module,
    exports: module.exports,
    require(name) {
      if (name in dependencies) return dependencies[name];
      if(name==='react/jsx-runtime') return require(name);
      throw new Error(`Unexpected import: ${name}`);
    },
  });

  return module.exports;
}

export function coverFixture(options = {}) {
  const files = new Map();
  const directories = new Map();
  const uriFor = (parts) =>
    parts
      .map((part) => (typeof part === "string" ? part : part.uri))
      .map((part) => part.replace(/\/$/, ""))
      .join("/");

  class Directory {
    constructor(...parts) {
      this.uri = uriFor(parts);
    }
    create(settings) {
      directories.set(this.uri, settings);
    }
  }

  class File {
    constructor(...parts) {
      this.uri = uriFor(parts);
    }
    get exists() {
      return files.has(this.uri);
    }
    get size() {
      return files.get(this.uri)?.byteLength ?? 0;
    }
    async copy(destination) {
      await Promise.resolve();
      const bytes = files.get(this.uri);
      if (!bytes) throw new Error("Source missing");
      files.set(
        destination.uri,
        options.emptyCopy ? new Uint8Array() : bytes.slice(),
      );
      if (options.copyError) throw options.copyError;
    }
    delete() {
      if (options.cleanupError) throw options.cleanupError;
      files.delete(this.uri);
    }
  }

  const fileSystem = {
    Directory,
    File,
    Paths: { document: "file:///documents" },
  };
  const validation = load("lib/post-body.ts", {
    "expo-file-system": fileSystem,
  });
  const { persistCover } = load("lib/offline/cover.ts", {
    "expo-crypto": { randomUUID },
    "expo-file-system": fileSystem,
    "@/lib/post-body": validation,
  });

  const image = {
    uri: "file:///cache/picked.jpg",
    name: "picked.jpg",
    mimeType: "image/jpeg",
    size: 4,
  };
  files.set(image.uri, Uint8Array.from([1, 2, 3, 4]));
  return { persistCover, files, directories, image, fileSystem };
}
