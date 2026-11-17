/**
 * Slice 005, security review round 2 (N1) and its validator (N3): the tRPC
 * input transformer must not let a caller's superjson `meta` multiply the
 * Zod work past the byte limit.
 *
 *   N1 — `meta.referentialEqualities` placed one array at nine array fields
 *        of the digest spec, so Zod walked it nine times (2,227 MB from a
 *        393 KB body).
 *   N3 — superjson's setDeep writes `array[index]` unchecked, so a `values`
 *        path naming an index past the end makes a sparse array of that
 *        length (2,254 MB from a 143-byte body; 2,259 MB from a 248-byte GET).
 *
 * The guard drops `referentialEqualities` (the client writes the full value
 * at every path, so nothing is lost), refuses any `values` path that does not
 * name an existing own key or in-range index of the raw `json`, allows only
 * the annotation types the client needs, and caps their number.
 */
import { describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import superjson from "superjson";
import { z } from "zod";
import { publicProcedure, router } from "@/server/trpc/trpc";
import { digestSpecSchema, DIGEST_SPEC_SCHEMA_VERSION } from "@/lib/digest-spec/schema";
import { schedulingRuleV1 } from "@/lib/scheduling/rule";
import {
  ALLOWED_INPUT_ANNOTATIONS,
  guardTrpcInput,
  INPUT_GUARD_MESSAGE,
  MAX_INPUT_ANNOTATIONS,
  MAX_INPUT_PATH_DEPTH,
  MAX_SCALAR_ANNOTATION_CHARS,
  resolveRawPath,
} from "@/server/trpc/input-guard";

const UUID = "00000000-0000-4000-8000-000000000000";
const SPEC_ARRAY_PATHS = [
  "spec.topics",
  "spec.entities.companies",
  "spec.entities.tickers",
  "spec.entities.commodities",
  "spec.keywords_include",
  "spec.keywords_exclude",
  "spec.data_addons.fx_pairs",
  "spec.rss_feeds",
  "spec.cadence.days_of_week",
];

const testRouter = router({
  updateRaw: publicProcedure
    .input(z.object({ id: z.string().uuid(), spec: digestSpecSchema }))
    .mutation(() => "ok"),
  echo: publicProcedure.input(z.unknown()).mutation(({ input }) => superjson.serialize(input)),
  // Mirrors briefs.preview: z.unknown() input, then the rule schema.
  preview: publicProcedure.input(z.object({ rule: z.unknown() })).query(({ input }) => {
    const parsed = schedulingRuleV1.safeParse(input.rule);
    if (!parsed.success) {
      throw new TRPCError({ code: "BAD_REQUEST", message: `Invalid scheduling rule: ${parsed.error.message}` });
    }
    return "ok";
  }),
});

type ErrorJson = { message: string; data: { zodIssueCount?: number; httpStatus: number } };

async function handle(req: Request) {
  const res = await fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: testRouter,
    createContext: () => ({}) as never,
  });
  const text = await res.text();
  return { status: res.status, text, json: JSON.parse(text) as unknown };
}

function post(path: string, body: string) {
  return handle(
    new Request(`https://app.example.com/api/trpc/${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    })
  );
}

function errorOf(json: unknown, batch: boolean): ErrorJson {
  const one = (batch ? (json as unknown[])[0] : json) as { error: { json: ErrorJson } };
  return one.error.json;
}

/** The N1 body: one `topics` array, every other array field a number, shared by reference. */
function sharedReferenceBody(n: number, shared: boolean) {
  const json = {
    id: UUID,
    spec: {
      topics: Array(n).fill(""),
      entities: { companies: 0, tickers: 0, commodities: 0 },
      keywords_include: 0,
      keywords_exclude: 0,
      data_addons: { fx_pairs: 0 },
      rss_feeds: 0,
      cadence: { days_of_week: 0 },
    },
  };
  const meta = shared ? { referentialEqualities: { "spec.topics": SPEC_ARRAY_PATHS.slice(1) }, v: 1 } : undefined;
  return JSON.stringify({ 0: meta ? { json, meta } : { json } });
}

describe("N1: referentialEqualities", () => {
  it("cannot multiply the Zod work: the shared body costs what the plain body costs", async () => {
    const plain = await post("updateRaw?batch=1", sharedReferenceBody(2_000, false));
    const shared = await post("updateRaw?batch=1", sharedReferenceBody(2_000, true));
    expect(plain.status).toBe(400);
    expect(shared.status).toBe(400);
    const plainCount = errorOf(plain.json, true).data.zodIssueCount!;
    const sharedCount = errorOf(shared.json, true).data.zodIssueCount!;
    expect(plainCount).toBeGreaterThan(2_000);
    // Before the guard: about nine times the plain count.
    expect(sharedCount).toBe(plainCount);
  });

  it("the validator's full-size N1 body (≈393 KB, nine paths) is answered at the plain cost", async () => {
    const body = sharedReferenceBody(130_900, true);
    expect(body.length).toBeGreaterThan(390_000);
    expect(body.length).toBeLessThan(393_216);
    const out = await post("updateRaw?batch=1", body);
    expect(out.status).toBe(400);
    expect(errorOf(out.json, true).data.zodIssueCount).toBeLessThan(140_000);
  });
});

const GUARD_MESSAGE = INPUT_GUARD_MESSAGE;

function valuesBody(path: string, batch: boolean, type: unknown = ["undefined"]) {
  const call = { json: { id: UUID, spec: { topics: [] } }, meta: { values: { [path]: type }, v: 1 } };
  return JSON.stringify(batch ? { 0: call } : call);
}

describe("N3: values paths must name what is already in the raw json", () => {
  it.each([
    ["batch", true],
    ["non-batch", false],
  ])("refuses an index past the end (%s), before Zod runs", async (_label, batch) => {
    const out = await post(batch ? "updateRaw?batch=1" : "updateRaw", valuesBody("spec.topics.20000", batch));
    expect(out.status).toBe(400);
    const err = errorOf(out.json, batch);
    expect(err.message).toBe(GUARD_MESSAGE);
    expect(err.data.zodIssueCount).toBeUndefined();
  });

  it("refuses the validator's exact 143-byte body (index 2,000,000) quickly", async () => {
    const body = valuesBody("spec.topics.2000000", true);
    expect(body.length).toBe(143);
    const started = performance.now();
    const out = await post("updateRaw?batch=1", body);
    expect(performance.now() - started).toBeLessThan(500);
    expect(out.status).toBe(400);
    expect(errorOf(out.json, true).message).toBe(GUARD_MESSAGE);
  });

  it("refuses the validator's 248-byte GET on preview (skipDates index 2,000,000) quickly", async () => {
    const input = { 0: { json: { rule: { skipDates: [] } }, meta: { values: { "rule.skipDates.2000000": ["undefined"] }, v: 1 } } };
    const url = `https://app.example.com/api/trpc/preview?batch=1&input=${encodeURIComponent(JSON.stringify(input))}`;
    const started = performance.now();
    const out = await handle(new Request(url));
    expect(performance.now() - started).toBeLessThan(500);
    expect(out.status).toBe(400);
    expect(errorOf(out.json, true).message).toBe(GUARD_MESSAGE);
  });
});

describe("guardTrpcInput: what is refused", () => {
  const refused = (payload: unknown) => {
    try {
      guardTrpcInput(payload);
    } catch (err) {
      return err instanceof TRPCError && err.code === "BAD_REQUEST" && err.message === INPUT_GUARD_MESSAGE;
    }
    return false;
  };
  const json = { a: [1, 2, 3], o: { k: null, d: "2026-01-01T00:00:00.000Z" }, s: ["2026-01-01T00:00:00.000Z"], x: { y: [] } };
  const withValues = (values: unknown, v: unknown = 1) => ({ json, meta: { values, v } });

  it("pins the bounds and the allowed types", () => {
    expect(MAX_INPUT_ANNOTATIONS).toBe(1000);
    expect(MAX_INPUT_PATH_DEPTH).toBe(64);
    expect(MAX_SCALAR_ANNOTATION_CHARS).toBe(64);
    expect([...ALLOWED_INPUT_ANNOTATIONS].sort()).toEqual(["Date", "bigint", "map", "set", "undefined"]);
  });

  it.each([
    ["an index at the length", { "a.3": ["undefined"] }],
    ["an index far past the end", { "a.2000000": ["undefined"] }],
    ["a non-canonical index (superjson reads +'1e6')", { "a.1e6": ["undefined"] }],
    ["a leading-zero index", { "a.01": ["undefined"] }],
    ["a negative index", { "a.-1": ["undefined"] }],
    ["a missing object key", { "o.missing": ["undefined"] }],
    ["an inherited key", { "o.toString": ["undefined"] }],
    ["__proto__", { "o.__proto__": ["undefined"] }],
    ["constructor", { "o.constructor": ["undefined"] }],
    ["a path through a scalar", { "o.k.0": ["undefined"] }],
    ["an invalid escape", { "o\\k": ["undefined"] }],
    ["a missing index in the tree form's children", ["set", { "": ["undefined"] }]],
    ["a sparse index nested in the tree form", { a: ["set", { "5": ["undefined"] }] }],
    ["the tree form's children not an object", { a: ["set", ["undefined"]] }],
    ["a tree node with three entries", { a: ["set", {}, 1] }],
    ["a tree that is a string", "a"],
    ["typed-array", { a: [["typed-array", "Float64Array"]] }],
    ["class", { o: [["class", "X"]] }],
    ["custom", { o: [["custom", "X"]] }],
    ["symbol", { "o.k": [["symbol", "X"]] }],
    ["Error", { o: ["Error"] }],
    ["regexp", { "o.d": ["regexp"] }],
    ["URL", { "o.d": ["URL"] }],
    ["number (NaN)", { "a.0": ["number"] }],
    ["an unknown type", { "o.k": ["nope"] }],
    ["undefined on a non-null value", { "a.0": ["undefined"] }],
    ["Date on a non-string", { "a.0": ["Date"] }],
    ["Date on a long string", { "o.d": ["Date"] }, { o: { d: "9".repeat(65) } }],
    ["bigint on a non-integer string", { "o.d": ["bigint"] }],
    ["bigint on a long integer string", { "o.d": ["bigint"] }, { o: { d: "9".repeat(65) } }],
    ["set on a non-array", { o: ["set"] }],
    ["map with a malformed entry", { a: ["map"] }],
    ["a node annotated twice (flat and nested keys name one path)", { "x.y": ["set"], x: { y: ["set"] } }],
    ["a path through an already-transformed node", { s: ["set"], "s.0": ["Date"] }],
    ["an own __proto__ key (JSON.parse makes it own)", { "o.__proto__": ["undefined"] }, JSON.parse('{"o":{"__proto__":null}}')],
  ])("refuses %s", (_label, values, rawJson?: unknown) => {
    expect(refused(rawJson ? { json: rawJson, meta: { values, v: 1 } } : withValues(values))).toBe(true);
  });

  it("refuses legacy (v0) paths and a meta that is not an object", () => {
    expect(refused(withValues({ "o.k": ["undefined"] }, 0))).toBe(true);
    expect(refused({ json, meta: { values: { "o.k": ["undefined"] } } })).toBe(true);
    expect(refused({ json, meta: "x" })).toBe(true);
  });

  it("refuses more than the annotation cap and paths deeper than the depth cap", () => {
    const many = { json: { a: Array(1001).fill(null) }, meta: { v: 1, values: {} as Record<string, unknown> } };
    for (let i = 0; i < 1001; i++) many.meta.values[`a.${i}`] = ["undefined"];
    expect(refused(many)).toBe(true);
    many.json.a.length = 1000;
    for (let i = 1000; i < 1001; i++) delete many.meta.values[`a.${i}`];
    expect(refused(many)).toBe(false);

    const nested = (n: number) => {
      let deep: unknown = null;
      for (let i = 0; i < n; i++) deep = [deep];
      return { json: deep, meta: { v: 1, values: { [Array(n).fill("0").join(".")]: ["undefined"] } } };
    };
    expect(refused(nested(65))).toBe(true);
    expect(refused(nested(64))).toBe(false);
  });

  it("resolveRawPath: only own keys and in-range canonical indexes of the raw json", () => {
    const raw = { a: [null, null, null], o: { k: null } };
    expect(resolveRawPath(raw, ["a", "2"])).toBeNull();
    expect(resolveRawPath(raw, ["o", "k"])).toBeNull();
    expect(resolveRawPath(raw, [])).toBe(raw);
    for (const path of [["a", "3"], ["a", "2000000"], ["a", "01"], ["a", "1e0"], ["a", "-1"], ["a", " 1"], ["o", "toString"], ["o", "missing"], ["o", "k", "x"]]) {
      expect(() => resolveRawPath(raw, path), path.join(".")).toThrow();
    }
  });

  it("drops referentialEqualities", () => {
    const out = guardTrpcInput({ json: { a: [1], b: [1] }, meta: { referentialEqualities: { a: ["b"] }, v: 1 } });
    expect(out).toEqual({ json: { a: [1], b: [1] } });
  });

  it("passes a payload with no meta through untouched", () => {
    const p = { json: { a: 1 } };
    expect(guardTrpcInput(p)).toBe(p);
    expect(guardTrpcInput(5)).toBe(5);
  });
});

describe("real client shapes round-trip", () => {
  const roundTrip = (value: unknown) => superjson.deserialize(guardTrpcInput(JSON.parse(JSON.stringify(superjson.serialize(value)))) as never);

  it("a shared array", () => {
    const shared = ["a", "b"];
    expect(roundTrip({ x: shared, y: shared })).toEqual({ x: ["a", "b"], y: ["a", "b"] });
  });

  it("a shared object plus a Date", () => {
    const when = new Date("2026-11-17T00:00:00.000Z");
    const shared = { when };
    const out = roundTrip({ a: shared, b: shared, c: [shared] }) as { a: { when: Date }; c: { when: Date }[] };
    expect(out).toEqual({ a: { when }, b: { when }, c: [{ when }] });
    expect(out.a.when).toBeInstanceOf(Date);
    expect(out.c[0]!.when).toBeInstanceOf(Date);
  });

  it("an undefined field, an undefined array element, and an undefined root", () => {
    expect(roundTrip({ a: undefined, b: [1, undefined] })).toEqual({ a: undefined, b: [1, undefined] });
    expect(Object.hasOwn(roundTrip({ a: undefined }) as object, "a")).toBe(true);
    expect(roundTrip(undefined)).toBeUndefined();
  });

  it("a Map and a Set, with Dates and undefined inside, and a bigint", () => {
    const when = new Date("2026-11-17T00:00:00.000Z");
    const value = {
      m: new Map<unknown, unknown>([["k", when], [when, undefined]]),
      s: new Set<unknown>([when, undefined, "x"]),
      n: 12345678901234567890n,
    };
    expect(roundTrip(value)).toEqual(value);
  });

  it("dots and backslashes in keys", () => {
    const when = new Date("2026-11-17T00:00:00.000Z");
    expect(roundTrip({ "a.b": when, "c\\d": undefined })).toEqual({ "a.b": when, "c\\d": undefined });
  });

  it("a full real updateRaw input (every schema maximum, undefined optional fields, shared empty arrays)", () => {
    const empty: string[] = [];
    const spec = {
      ...digestSpecSchema.parse({
        schema_version: DIGEST_SPEC_SCHEMA_VERSION,
        topics: Array.from({ length: 20 }, (_, i) => `topic ${i}`),
        entities: { companies: empty, tickers: empty, commodities: empty },
        keywords_include: Array.from({ length: 50 }, (_, i) => `kw ${i}`),
        keywords_exclude: [],
        data_addons: { fx_pairs: ["MYR/USD"] },
        rss_feeds: Array.from({ length: 20 }, (_, i) => ({ url: `https://example.com/${i}`, label: `Feed ${i}` })),
        cadence: { frequency: "daily", delivery_time_local: "08:00", days_of_week: [1, 2, 3, 4, 5] },
      }),
      entities: { companies: empty, tickers: empty, commodities: empty },
    };
    // Optional fields the form leaves undefined; the client sends null plus an annotation.
    const input = { id: UUID, spec: { ...spec, rss_feeds: spec.rss_feeds.map((f) => ({ ...f, note: undefined })), extra: undefined } };
    expect(roundTrip(input)).toEqual(superjson.deserialize(superjson.serialize(input)));
  });

  it("through the real handler: a real client batch is accepted", async () => {
    const shared = ["AI chips"];
    const spec = digestSpecSchema.parse({
      schema_version: DIGEST_SPEC_SCHEMA_VERSION,
      topics: shared,
      entities: { companies: [], tickers: [], commodities: [] },
      keywords_include: shared,
      rss_feeds: [],
      cadence: { frequency: "daily", delivery_time_local: "08:00" },
    });
    const call = superjson.serialize({ id: UUID, spec: { ...spec, keywords_exclude: undefined } });
    const out = await post("updateRaw?batch=1", JSON.stringify({ 0: call }));
    expect(out.status).toBe(200);
    const echoed = await post("echo", JSON.stringify(superjson.serialize({ a: undefined, d: new Date(0), m: new Map([[1, 2]]) })));
    expect(echoed.status).toBe(200);
    const result = (echoed.json as { result: { data: { json: unknown } } }).result.data.json;
    expect(superjson.deserialize(result as never)).toEqual({ a: undefined, d: new Date(0), m: new Map([[1, 2]]) });
  });
});
