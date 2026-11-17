/**
 * The tRPC transformer, with a guard on the input side (slice 005, security
 * review round 2: N1, and its validator: N3). Output and the client are
 * plain superjson; only what a caller sends is checked.
 *
 * superjson applies a caller's `meta` before any Zod parse, and two parts of
 * it can make the value Zod sees far larger than the bytes sent:
 *   - `meta.referentialEqualities` puts one value at many paths, so Zod walks
 *     it once per path (N1: 2,227 MB from a 393 KB body).
 *   - `meta.values` paths are written with `array[index] = …` unchecked, so
 *     an index past the end makes a sparse array of that length (N3:
 *     2,254 MB from a 143-byte body).
 *
 * So, before superjson sees the payload:
 *   1. `referentialEqualities` is dropped;
 *   2. every `values` path must name an own key, or an index below the
 *      length, that already exists in the raw `json`, and no annotation may
 *      act on a node an earlier annotation already transformed;
 *   3. only the annotation types the client needs are allowed, each on the
 *      raw shape superjson's own serializer writes;
 *   4. at most MAX_INPUT_ANNOTATIONS annotations, paths at most
 *      MAX_INPUT_PATH_DEPTH segments deep.
 * Anything else is a BAD_REQUEST with one fixed message, before Zod runs.
 *
 * The guard runs on every input tRPC deserialises: batch and non-batch, GET
 * and POST (the JSON content-type parser calls `transformer.input.deserialize`
 * once per call). Grammar read from superjson 2.2.6 (dist/plainer.js
 * `traverse`, dist/pathstringifier.js `parsePath`, dist/accessDeep.js).
 */
import { TRPCError } from "@trpc/server";
import superjson from "superjson";

/**
 * Keys in the `values` tree (so at most this many annotations plus a root
 * one). Real inputs carry a handful (`undefined` fields); see the slice notes.
 */
export const MAX_INPUT_ANNOTATIONS = 1000;
/** The deepest real input path is about five segments (spec.rss_feeds.N.label). */
export const MAX_INPUT_PATH_DEPTH = 64;
/** Longest raw string accepted for a `Date` or `bigint` annotation. */
export const MAX_SCALAR_ANNOTATION_CHARS = 64;
/**
 * Only types the client can need. No procedure input today takes a Date,
 * bigint, Map or Set (every `.input()` is plain JSON), so in practice only
 * `undefined` is sent; the other four are what superjson's simple rules
 * produce for values a client could plausibly pass. Refused: `class`,
 * `custom`, `symbol` (nothing is registered), `typed-array` (allocates the
 * declared length), `Error`, `regexp`, `URL`, `number` (NaN, ±Infinity, -0).
 */
export const ALLOWED_INPUT_ANNOTATIONS: ReadonlySet<string> = new Set(["undefined", "Date", "bigint", "map", "set"]);
export const INPUT_GUARD_MESSAGE = "Invalid input encoding";

const FORBIDDEN_SEGMENTS = new Set(["__proto__", "prototype", "constructor"]);
const CANONICAL_INDEX = /^(0|[1-9]\d*)$/;
const BIGINT_TEXT = /^-?\d+$/;

class Refused extends Error {}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** superjson's `parsePath` for `v: 1`: `\.` is a dot inside a key, `\\` a backslash; any other escape is invalid. */
function parsePath(key: string): string[] {
  const out: string[] = [];
  let seg = "";
  for (let i = 0; i < key.length; i++) {
    const c = key[i];
    if (c === "\\") {
      const next = key[i + 1];
      if (next !== "\\" && next !== ".") throw new Refused();
      seg += next;
      i++;
    } else if (c === ".") {
      out.push(seg);
      seg = "";
    } else {
      seg += c;
    }
  }
  out.push(seg);
  return out;
}

/**
 * The raw `json` node a path names; refused unless every step is an own key
 * or an in-range canonical index. Exported for its test: today the raw-shape
 * check would also refuse what this misses (no allowed type accepts a
 * missing value), so this is the rule stated once, not left to that overlap.
 */
export function resolveRawPath(json: unknown, path: string[]): unknown {
  let node = json;
  for (const seg of path) {
    if (FORBIDDEN_SEGMENTS.has(seg)) throw new Refused();
    if (Array.isArray(node)) {
      if (!CANONICAL_INDEX.test(seg) || Number(seg) >= node.length) throw new Refused();
      node = node[Number(seg)];
    } else if (isObject(node)) {
      if (!Object.hasOwn(node, seg)) throw new Refused();
      node = node[seg];
    } else {
      throw new Refused();
    }
  }
  return node;
}

/** The raw shape superjson's serializer writes for each allowed type. */
function rawShapeFits(type: string, raw: unknown): boolean {
  switch (type) {
    case "undefined":
      return raw === null;
    case "Date":
      return typeof raw === "string" && raw.length <= MAX_SCALAR_ANNOTATION_CHARS;
    case "bigint":
      return typeof raw === "string" && raw.length <= MAX_SCALAR_ANNOTATION_CHARS && BIGINT_TEXT.test(raw);
    case "set":
      return Array.isArray(raw);
    case "map":
      return Array.isArray(raw) && raw.every((e) => Array.isArray(e) && e.length === 2);
    default:
      return false;
  }
}

/** Walks `meta.values` in superjson's own order (children before their node) and checks every annotation. */
function checkValues(json: unknown, values: unknown): void {
  // Every annotation but the root's sits under at least one key, so capping
  // the keys caps the annotations (and the walk over empty subtrees).
  let keys = 0;
  const applied = new Set<string>();

  const annotate = (type: unknown, path: string[]) => {
    if (typeof type !== "string" || !ALLOWED_INPUT_ANNOTATIONS.has(type)) throw new Refused();
    // superjson would walk through an already-transformed node (a Set, a
    // Map), not the raw json this check resolved against.
    for (let i = 0; i <= path.length; i++) {
      if (applied.has(JSON.stringify(path.slice(0, i)))) throw new Refused();
    }
    if (!rawShapeFits(type, resolveRawPath(json, path))) throw new Refused();
    applied.add(JSON.stringify(path));
  };

  const children = (tree: Record<string, unknown>, origin: string[]) => {
    for (const [key, sub] of Object.entries(tree)) {
      if (++keys > MAX_INPUT_ANNOTATIONS) throw new Refused();
      const path = [...origin, ...parsePath(key)];
      if (path.length > MAX_INPUT_PATH_DEPTH) throw new Refused();
      walk(sub, path);
    }
  };

  const walk = (tree: unknown, origin: string[]) => {
    if (Array.isArray(tree)) {
      // [type] or [type, children]
      if (tree.length < 1 || tree.length > 2) throw new Refused();
      const [type, sub] = tree;
      if (sub !== undefined) {
        if (!isObject(sub)) throw new Refused();
        children(sub, origin);
      }
      annotate(type, origin);
    } else if (isObject(tree)) {
      children(tree, origin);
    } else {
      throw new Refused();
    }
  };

  walk(values, []);
}

/**
 * Returns the payload superjson may deserialise: `referentialEqualities`
 * dropped (the client's superjson, dedupe off, writes the full value at
 * every path, so nothing is lost; no procedure relies on object identity)
 * and `values` checked. Throws BAD_REQUEST otherwise.
 */
export function guardTrpcInput(payload: unknown): unknown {
  if (!isObject(payload) || payload.meta === undefined) return payload;
  try {
    if (!isObject(payload.meta)) throw new Refused();
    const { values, v } = payload.meta;
    if (values === undefined || values === null) return { json: payload.json };
    if (v !== 1) throw new Refused();
    checkValues(payload.json, values);
    return { json: payload.json, meta: { values, v } };
  } catch (err) {
    if (err instanceof Refused) throw new TRPCError({ code: "BAD_REQUEST", message: INPUT_GUARD_MESSAGE });
    throw err;
  }
}

export const trpcTransformer = {
  input: {
    serialize: (value: unknown) => superjson.serialize(value),
    deserialize: (payload: unknown) => superjson.deserialize(guardTrpcInput(payload) as never),
  },
  output: superjson,
};
