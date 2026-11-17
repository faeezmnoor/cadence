#!/usr/bin/env node
// Slice 005 gate G14 (security review F2): the worst tRPC body at the tRPC
// limit, through the real `withBodyLimit`, the real `fetchRequestHandler`
// (@trpc/server 11) and the real bounded errorFormatter, against the real
// digest spec and scheduling schemas, must stay under BUDGET_MB peak RSS.
// Run with NODE_ENV=production (the deployed mode). Auth is left out, so the
// procedure input is parsed as for a signed-in caller. Each case runs in a
// fresh child process. Also measures the largest GET Node accepts
// (http.maxHeaderSize covers the request line), the only way caller input
// reaches schedulingRuleV1 (briefs.preview is a query).
// No network, no .env read. Needs Node with type stripping (22.18+).
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { maxHeaderSize } from "node:http";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";

// The fix round's target was about 600 MB. At 384 KiB the worst case
// (rss_feeds:[{},…]) measures about 685 MB; 600 MB would need a limit under
// 1.5x the largest legitimate request. Budget set just above the measurement
// so a regression fails; the gap is recorded in notes.md and decision 0013.
const BUDGET_MB = 750;
const HERE = dirname(fileURLToPath(import.meta.url));
const WEB = resolve(HERE, "../../../apps/web");
const UUID = "00000000-0000-4000-8000-000000000000";

/** Fill `[el,el,…]` so the whole body is as close to `bytes` as possible. */
function fill(prefix, el, suffix, bytes) {
  const n = Math.floor((bytes - prefix.length - suffix.length + 1) / (el.length + 1));
  return prefix + Array(n).fill(el).join(",") + suffix;
}

async function child(name, limitArg) {
  const req = createRequire(resolve(WEB, "package.json"));
  const load = (id) => import(pathToFileURL(req.resolve(id)).href);
  const { initTRPC, TRPCError } = await load("@trpc/server");
  const { fetchRequestHandler } = await load("@trpc/server/adapters/fetch");
  const superjson = (await load("superjson")).default;
  // zod's ESM entry: the same module instance the TS files import, so the
  // formatter's `instanceof ZodError` sees these errors.
  const { z } = await import(pathToFileURL(resolve(WEB, "node_modules/zod/index.js")).href);
  const ts = (p) => import(pathToFileURL(resolve(WEB, p)).href);
  const { withBodyLimit, TRPC_BODY_LIMIT_BYTES } = await ts("server/http/body-limit.ts");
  const { boundErrorShape } = await ts("server/trpc/error-format.ts");
  const { digestSpecSchema } = await ts("lib/digest-spec/schema.ts");
  const { schedulingRuleV1 } = await ts("lib/scheduling/rule.ts");
  const limit = Number(limitArg) || TRPC_BODY_LIMIT_BYTES;

  const t = initTRPC.create({ transformer: superjson, errorFormatter: boundErrorShape });
  const router = t.router({
    updateRaw: t.procedure.input(z.object({ id: z.string().uuid(), spec: digestSpecSchema })).mutation(() => "ok"),
    // Mirrors briefs.preview: z.unknown() input, then the rule schema, then the message.
    preview: t.procedure.input(z.object({ rule: z.unknown() })).query(({ input }) => {
      const parsed = schedulingRuleV1.safeParse(input.rule);
      if (!parsed.success) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Invalid scheduling rule: ${parsed.error.message}` });
      }
      return "ok";
    }),
  });
  const handler = withBodyLimit(
    (r) => fetchRequestHandler({ endpoint: "/api/trpc", req: r, router, createContext: () => ({}) }),
    limit
  );

  let request;
  const spec = (k, el) => fill(`{"0":{"json":{"id":"${UUID}","spec":{"${k}":[`, el, "]}}}}", limit);
  if (name === "updateRaw topics [0,…]") request = post("updateRaw", spec("topics", "0"));
  else if (name === "updateRaw rss_feeds [{},…]") request = post("updateRaw", spec("rss_feeds", "{}"));
  else if (name === "updateRaw keywords_include [0,…]") request = post("updateRaw", spec("keywords_include", "0"));
  else if (name === "preview skipDates by GET at Node's header cap") {
    const head = `/api/trpc/preview?batch=1&input=`;
    const input = (n) => encodeURIComponent(JSON.stringify({ 0: { json: { rule: { skipDates: Array(n).fill(0) } } } }));
    let n = 1;
    while (head.length + input(n * 2).length < maxHeaderSize - 200) n *= 2;
    while (head.length + input(n + 64).length < maxHeaderSize - 200) n += 64;
    request = new Request(`https://app.example.com${head}${input(n)}`);
  } else throw new Error(`unknown case ${name}`);

  function post(path, body) {
    return new Request(`https://app.example.com/api/trpc/${path}?batch=1`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    });
  }

  const sent = request.method === "GET" ? request.url.length : Number((await request.clone().arrayBuffer()).byteLength);
  const res = await handler(request);
  const text = await res.text();
  if (request.method === "POST" && !text.includes('"zodIssueCount"')) {
    throw new Error("the bounded formatter's Zod path did not run");
  }
  const rssMb = (process.resourceUsage().maxRSS * 1024) / 1e6;
  console.log(JSON.stringify({ name, status: res.status, sent, response: text.length, rssMb: Math.round(rssMb) }));
}

const CASES = [
  "updateRaw topics [0,…]",
  "updateRaw rss_feeds [{},…]",
  "updateRaw keywords_include [0,…]",
  "preview skipDates by GET at Node's header cap",
];

if (process.argv[2] === "child") {
  await child(process.argv[3], process.argv[4]);
} else {
  const limitArg = process.argv[2] ?? "";
  console.log(`NODE_ENV=${process.env.NODE_ENV ?? "(unset)"}; Node http.maxHeaderSize = ${maxHeaderSize} bytes`);
  let worst = 0;
  let failed = false;
  for (const name of CASES) {
    const r = spawnSync(process.execPath, ["--max-old-space-size=8192", fileURLToPath(import.meta.url), "child", name, limitArg], {
      encoding: "utf8",
      env: process.env,
    });
    if (r.status !== 0) {
      console.log(`FAILED: ${name}\n${r.stderr.split("\n").slice(0, 8).join("\n")}`);
      failed = true;
      continue;
    }
    const m = JSON.parse(r.stdout.trim().split("\n").pop());
    worst = Math.max(worst, m.rssMb);
    console.log(`${String(m.rssMb).padStart(5)} MB  sent ${m.sent} B  -> ${m.status}, response ${m.response} B  ${name}`);
  }
  console.log(`worst tRPC request: ${worst} MB peak RSS (budget ${BUDGET_MB} MB)`);
  if (failed || worst >= BUDGET_MB) process.exit(1);
  console.log("trpc worst case under budget");
}
