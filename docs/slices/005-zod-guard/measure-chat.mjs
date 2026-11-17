#!/usr/bin/env node
// Slice 005 gate G13 (security review F1): the worst chat payload the shape
// check ACCEPTS, run through the real `streamText` (ai 4.3.19, zod 3.25.76)
// with a mock model, must stay under BUDGET_MB of peak resident memory.
// Each shape runs in a fresh child process so the peaks do not mix.
// No network, no provider call, no .env read. Needs Node with type stripping (22.18+).
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";

const BUDGET_MB = 300;
const HERE = dirname(fileURLToPath(import.meta.url));
const WEB = resolve(HERE, "../../../apps/web");

// Every shape is at the caps (200 messages, 500 elements) and passes the check.
const bad = (n, el) => Array.from({ length: n }, () => ({ ...el }));
const SHAPES = {
  // Content parts of an unknown type: every one fails the content-part union.
  "user, 500 unknown content parts": () => [{ role: "user", content: bad(500, { type: "x" }) }],
  "assistant, 500 unknown content parts": () => [{ role: "assistant", content: bad(500, { type: "x" }) }],
  "user, 500 image parts with no image": () => [{ role: "user", content: bad(500, { type: "image" }) }],
  "assistant, 500 tool-call parts with no id": () => [{ role: "assistant", content: bad(500, { type: "tool-call" }) }],
  "200 messages, 2 unknown content parts each": () =>
    Array.from({ length: 200 }, (_, i) => ({ role: i % 2 ? "assistant" : "user", content: bad(2, { type: "x" }) })),
  "200 messages, no content": () => Array.from({ length: 200 }, (_, i) => ({ role: i % 2 ? "assistant" : "user" })),
  "UI assistant, 500 file parts with a bad mime": () => [
    { role: "assistant", content: "", parts: bad(500, { type: "file", mimeType: "", data: "" }) },
  ],
  "UI assistant, 250 reasoning parts of one redacted detail": () => [
    { role: "assistant", content: "", parts: bad(250, { type: "reasoning", details: [{ type: "redacted", data: "" }] }) },
  ],
  "UI user, 500 attachments": () => [
    { role: "user", content: "x", experimental_attachments: bad(500, { url: "data:text/plain;base64,", contentType: "text/plain" }) },
  ],
};

async function child(name) {
  const req = createRequire(resolve(WEB, "package.json"));
  const { streamText } = await import(pathToFileURL(req.resolve("ai")).href);
  const { MockLanguageModelV1, simulateReadableStream } = await import(pathToFileURL(req.resolve("ai/test")).href);
  const { checkChatMessagesShape } = await import(pathToFileURL(resolve(WEB, "server/chat/message-shape.ts")).href);

  // Through JSON, as the route sees it.
  const body = JSON.stringify({ threadId: "t", messages: SHAPES[name]() });
  const messages = JSON.parse(body).messages;
  const shape = checkChatMessagesShape(messages);
  if (!shape.ok) throw new Error(`shape check refused "${name}" (${shape.reason}); it must be an accepted payload`);

  const model = new MockLanguageModelV1({
    doStream: async () => ({
      stream: simulateReadableStream({
        chunks: [
          { type: "text-delta", textDelta: "ok" },
          { type: "finish", finishReason: "stop", usage: { promptTokens: 1, completionTokens: 1 } },
        ],
      }),
      rawCall: { rawPrompt: null, rawSettings: {} },
    }),
  });
  let outcome = "streamed";
  let errChars = 0;
  try {
    const result = streamText({ model, system: "s", messages, onError: () => {} });
    await result.toDataStreamResponse({ getErrorMessage: (e) => { errChars = String(e?.message ?? e).length; return "x"; } }).text();
  } catch (err) {
    outcome = "refused by the SDK";
    errChars = String(err?.message ?? err).length;
  }
  const rssMb = (process.resourceUsage().maxRSS * 1024) / 1e6;
  console.log(JSON.stringify({ name, bodyBytes: Buffer.byteLength(body), outcome, errChars, rssMb: Math.round(rssMb) }));
}

if (process.argv[2] === "child") {
  await child(process.argv[3]);
} else {
  let worst = 0;
  let failed = false;
  for (const name of Object.keys(SHAPES)) {
    const r = spawnSync(process.execPath, ["--max-old-space-size=4096", fileURLToPath(import.meta.url), "child", name], {
      encoding: "utf8",
    });
    if (r.status !== 0) {
      console.log(`FAILED: ${name}\n${r.stderr.split("\n").slice(0, 5).join("\n")}`);
      failed = true;
      continue;
    }
    const line = r.stdout.trim().split("\n").pop();
    const m = JSON.parse(line);
    worst = Math.max(worst, m.rssMb);
    console.log(`${String(m.rssMb).padStart(5)} MB  ${m.bodyBytes} B  ${m.outcome}, error ${m.errChars} chars  ${name}`);
  }
  console.log(`worst accepted chat payload: ${worst} MB peak RSS (budget ${BUDGET_MB} MB)`);
  if (failed || worst >= BUDGET_MB) process.exit(1);
  console.log("chat worst case under budget");
}
