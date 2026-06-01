/**
 * Shared digest pipeline (T-210 + T-211).
 *
 * One function that owns the full pipeline so both the manual
 * `digest.sampleNow` mutation and the scheduled `digest.run` Inngest
 * handler stay in sync:
 *
 *   1. Resolve user + current spec
 *   2. Collect sources (Brave + RSS — yfinance deferred to T-206)
 *   3. Compose markdown via Haiku 4.5
 *   4. Split into Telegram-safe parts
 *   5. Deliver (unless dryRun OR user isn't linked)
 *   6. Persist digest_runs row
 *
 * Idempotency:
 *   - For scheduled runs we accept an explicit `runDate` and rely on
 *     the (user_id, run_date) unique index. Callers should pre-check
 *     to skip re-runs cleanly.
 *   - For sampleNow we use today's date AND set a `manual_sample`
 *     suffix-style — sampleNow always succeeds even if a scheduled
 *     row already exists for today, by writing a separate row dated
 *     to (today + small epoch suffix). Pragmatic: keeps history,
 *     keeps idempotency intact.
 */
import { and, eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { digestRuns, digestSpecs, users } from "@/server/db/schema";
import { composeDigest } from "@/server/ai/composer/compose";
import type {
  ComposerInput,
  ComposerSourcesBundle,
} from "@/server/ai/composer/types";
import { formatComposerOutput } from "@/server/telegram/format";
import { isTelegramConfigured, getBot } from "@/server/telegram/client";
import { isBraveConfigured, braveSearch, BraveKeyMissingError } from "@/server/connectors/brave-search";
import { recentRssForSpec } from "@/server/connectors/rss";

export interface RunDigestParams {
  userId: string;
  /** Optional ISO date (YYYY-MM-DD). Defaults to today (UTC). */
  runDate?: string;
  /** When true: skip Telegram send even if linked. */
  dryRun?: boolean;
  /** Skip source-fetching errors (Brave key missing etc) and continue with what we have. */
  tolerateSourceFailures?: boolean;
}

export type RunStatus =
  | "delivered"
  | "composed_dry_run"
  | "no_telegram_link"
  | "no_spec"
  | "duplicate"
  | "failed";

export interface RunDigestResult {
  status: RunStatus;
  digestRunId: string | null;
  markdown: string | null;
  partsSent: number;
  telegramMessageId: number | null;
  error?: string;
}

function todayIsoUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function runDigestPipeline(params: RunDigestParams): Promise<RunDigestResult> {
  const { userId, dryRun = false, tolerateSourceFailures = true } = params;
  const runDate = params.runDate ?? todayIsoUtc();

  // 1. Load user + current spec
  const userRows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const user = userRows[0];
  if (!user) {
    return { status: "failed", digestRunId: null, markdown: null, partsSent: 0, telegramMessageId: null, error: "user not found" };
  }
  const specRows = await db
    .select()
    .from(digestSpecs)
    .where(and(eq(digestSpecs.userId, userId), eq(digestSpecs.isCurrent, true)))
    .limit(1);
  const specRow = specRows[0];
  if (!specRow) {
    return { status: "no_spec", digestRunId: null, markdown: null, partsSent: 0, telegramMessageId: null };
  }

  // 2. Sources — Brave + RSS. yfinance/prices deferred.
  const sources: ComposerSourcesBundle = { search: [], rss: [] };
  try {
    if (isBraveConfigured()) {
      // One Brave query per top-level topic, cap 5 topics to keep cost predictable.
      const spec = specRow.spec as { topics?: string[] };
      const topics = (spec.topics ?? []).slice(0, 5);
      for (const query of topics) {
        const res = await braveSearch(query, { count: 10 });
        sources.search.push({ query, results: res.results });
      }
    }
  } catch (err) {
    if (err instanceof BraveKeyMissingError) {
      // expected when CAD-56 not provisioned; continue with no search
    } else if (!tolerateSourceFailures) {
      throw err;
    } else {
      console.warn("[digest:brave]", err);
    }
  }

  try {
    sources.rss = (await recentRssForSpec(specRow.id, { limit: 30, sinceHours: 48 })).map((r) => ({
      feedUrl: "",
      title: r.title,
      url: r.url,
      publishedAt: r.publishedAt,
      summary: r.summary,
    }));
  } catch (err) {
    if (!tolerateSourceFailures) throw err;
    console.warn("[digest:rss]", err);
  }

  // 3. Compose
  let markdown: string;
  let composeCostUsd = 0;
  try {
    const composerInput: ComposerInput = {
      spec: specRow.spec as ComposerInput["spec"],
      sources,
      userId,
      digestRunId: null, // updated below once row exists
    };
    const out = await composeDigest(composerInput);
    markdown = out.markdown;
    composeCostUsd = out.costUsd ?? 0;
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    // Persist failed run for visibility.
    const failedRow = await db
      .insert(digestRuns)
      .values({
        userId,
        specId: specRow.id,
        status: "failed",
        runDate,
        error,
      })
      .returning({ id: digestRuns.id })
      .onConflictDoNothing({ target: [digestRuns.userId, digestRuns.runDate] });
    return {
      status: "failed",
      digestRunId: failedRow[0]?.id ?? null,
      markdown: null,
      partsSent: 0,
      telegramMessageId: null,
      error,
    };
  }

  // 4. Format for Telegram
  const parts = formatComposerOutput(markdown);

  // 5. Deliver or skip
  let telegramMessageId: number | null = null;
  let partsSent = 0;
  let status: RunStatus;
  const canSend = !dryRun && isTelegramConfigured() && user.telegramChatId != null;
  if (canSend) {
    try {
      const bot = getBot();
      for (const part of parts) {
        const m = await bot.api.sendMessage(Number(user.telegramChatId), part.text, {
          parse_mode: part.parseMode,
        });
        if (telegramMessageId == null) telegramMessageId = m.message_id;
        partsSent++;
      }
      status = "delivered";
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      console.error("[digest:send]", err);
      // Failed delivery still records the run; allows retry via T-303 later.
      const failedRow = await db
        .insert(digestRuns)
        .values({
          userId,
          specId: specRow.id,
          status: "failed",
          runDate,
          composedMarkdown: markdown,
          sourcesBundle: sources,
          costUsd: composeCostUsd.toString(),
          error,
        })
        .returning({ id: digestRuns.id })
        .onConflictDoNothing({ target: [digestRuns.userId, digestRuns.runDate] });
      return {
        status: "failed",
        digestRunId: failedRow[0]?.id ?? null,
        markdown,
        partsSent,
        telegramMessageId,
        error,
      };
    }
  } else {
    status = dryRun ? "composed_dry_run" : "no_telegram_link";
  }

  // 6. Persist (or skip-if-duplicate when scheduled)
  const inserted = await db
    .insert(digestRuns)
    .values({
      userId,
      specId: specRow.id,
      status: status === "delivered" ? "delivered" : "composing",
      runDate,
      composedMarkdown: markdown,
      sourcesBundle: sources,
      telegramMessageId: telegramMessageId ?? undefined,
      costUsd: composeCostUsd.toString(),
    })
    .returning({ id: digestRuns.id })
    .onConflictDoNothing({ target: [digestRuns.userId, digestRuns.runDate] });

  if (inserted.length === 0) {
    // The unique (user_id, run_date) already had a row — this run is a duplicate.
    return { status: "duplicate", digestRunId: null, markdown, partsSent, telegramMessageId };
  }

  return {
    status,
    digestRunId: inserted[0]!.id,
    markdown,
    partsSent,
    telegramMessageId,
  };
}
