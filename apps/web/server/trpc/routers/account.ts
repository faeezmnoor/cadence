/**
 * account.* — self-service account operations.
 *
 * PM-audit #11: account.deleteSelf — the user-facing right-to-erasure
 * path. PDPA-required; also a Stripe MY KYC nice-to-have so the reviewer
 * sees that we honor consent withdrawal.
 *
 * Semantics (decision locked 2026-06-02): IMMEDIATE deletion, no 24-hour
 * grace. Reasoning:
 *   - Adds a "scheduled deletions" worker we don't have time to build.
 *   - The free-credits grant on signup means a malicious user can re-create
 *     accounts anyway; the grace window doesn't prevent abuse, just delays
 *     it.
 *   - Users expect "delete" to mean "delete" — a hidden 24-hour window
 *     gets us complaints, not goodwill.
 *
 * Cascade chain:
 *   1. INSERT audit row in account_deletions (independent of users FK)
 *   2. UPDATE public.users SET deleted_at = now()
 *      (FKs from chat/digest/transactions point at users — they cascade
 *      via ON DELETE CASCADE in 0000_init_schema if we ever hard-delete)
 *   3. Best-effort: hit Supabase Admin API to delete the auth.users row
 *      (signs the user out of any other tab/device)
 *   4. Best-effort: send a confirmation email (acknowledgment, not opt-in)
 *
 * The client invokes supabase.auth.signOut() after the mutation returns
 * to clear local cookies and redirect.
 */
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import * as Sentry from "@sentry/nextjs";
import { db } from "@/server/db/client";
import { accountDeletions, digestSpecs, users } from "@/server/db/schema";
import { protectedProcedure, router } from "../trpc";
import { sendEmail } from "@/server/email/send";
import { SUPPORT_EMAIL } from "@/server/support/contact";
import {
  isValidIanaTimezone,
  rederiveScheduleForTimezone,
} from "@/lib/scheduling/retime";

const timezoneInput = z
  .string()
  .min(1)
  .max(64)
  .refine(isValidIanaTimezone, {
    message: "Unknown timezone — pick one from the list.",
  });

type LegacyCadence = {
  frequency?: string;
  delivery_time_local?: string;
  days_of_week?: number[];
};

function cadenceFromSpec(spec: unknown): LegacyCadence | undefined {
  if (!spec || typeof spec !== "object") return undefined;
  const c = (spec as { cadence?: unknown }).cadence;
  return c && typeof c === "object" ? (c as LegacyCadence) : undefined;
}

async function deleteAuthUser(userId: string): Promise<{ deleted: boolean; reason?: string }> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return { deleted: false, reason: "no_service_role_key" };
  }
  try {
    const res = await fetch(`${url}/auth/v1/admin/users/${userId}`, {
      method: "DELETE",
      headers: {
        apikey: serviceKey,
        authorization: `Bearer ${serviceKey}`,
      },
    });
    if (!res.ok && res.status !== 404) {
      const body = await res.text().catch(() => "");
      console.warn("[account.deleteSelf] supabase admin delete failed", res.status, body.slice(0, 200));
      return { deleted: false, reason: `supabase_${res.status}` };
    }
    return { deleted: true };
  } catch (err) {
    console.warn("[account.deleteSelf] supabase admin delete threw", err);
    return { deleted: false, reason: "network" };
  }
}

export const accountRouter = router({
  /**
   * Settings-surfacing v1 (gap 1): set the user's timezone and re-derive
   * `next_run_at` for ALL their active briefs in one transaction, so the
   * very next dispatcher tick schedules against the new zone. Paused and
   * archived briefs are untouched (resume re-derives on its own path).
   *
   * Re-derivation reuses the save-spec.ts scheduling path via
   * `rederiveScheduleForTimezone` (pure; unit-tested for passed-today,
   * weekly-boundary, and DST edges in test/timezone-rederive.test.ts).
   */
  updateTimezone: protectedProcedure
    .input(z.object({ timezone: timezoneInput }))
    .mutation(async ({ ctx, input }) => {
      const now = new Date();
      return db.transaction(async (tx) => {
        const updated = await tx
          .update(users)
          .set({ timezone: input.timezone, updatedAt: now })
          .where(eq(users.id, ctx.user.id))
          .returning({ id: users.id });
        if (updated.length === 0) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Account not found." });
        }

        const activeSpecs = await tx
          .select({
            id: digestSpecs.id,
            spec: digestSpecs.spec,
            scheduling: digestSpecs.scheduling,
          })
          .from(digestSpecs)
          .where(
            and(
              eq(digestSpecs.userId, ctx.user.id),
              eq(digestSpecs.status, "active")
            )
          );

        let rescheduled = 0;
        let soonest: Date | null = null;
        for (const s of activeSpecs) {
          const { scheduling, nextRunAt } = rederiveScheduleForTimezone({
            cadence: cadenceFromSpec(s.spec),
            existingScheduling: s.scheduling,
            timezone: input.timezone,
            now,
          });
          await tx
            .update(digestSpecs)
            .set({ scheduling, nextRunAt, updatedAt: now })
            .where(eq(digestSpecs.id, s.id));
          rescheduled++;
          if (nextRunAt && (!soonest || nextRunAt < soonest)) {
            soonest = nextRunAt;
          }
        }

        return {
          ok: true as const,
          timezone: input.timezone,
          rescheduled,
          nextRunAt: soonest,
        };
      });
    }),

  /**
   * Read-only preview for the confirm-before-commit row (design §5):
   * "your next brief moves to {computed}". Computes what the soonest
   * active brief's next delivery WOULD be in the candidate timezone,
   * without writing anything.
   *
   * Review CTO P3-5: also returns `currentNextRunAt` — the soonest
   * ALREADY-SCHEDULED next delivery (old-tz instant). The confirm row
   * compares "moves to {new}" against this, not against the new instant
   * re-rendered in the old zone (those differ whenever re-derivation
   * moves the run).
   */
  timezonePreview: protectedProcedure
    .input(z.object({ timezone: timezoneInput }))
    .query(async ({ ctx, input }) => {
      const now = new Date();
      const activeSpecs = await db
        .select({
          spec: digestSpecs.spec,
          scheduling: digestSpecs.scheduling,
          nextRunAt: digestSpecs.nextRunAt,
        })
        .from(digestSpecs)
        .where(
          and(
            eq(digestSpecs.userId, ctx.user.id),
            eq(digestSpecs.status, "active")
          )
        );

      let soonest: Date | null = null;
      let currentSoonest: Date | null = null;
      for (const s of activeSpecs) {
        const { nextRunAt } = rederiveScheduleForTimezone({
          cadence: cadenceFromSpec(s.spec),
          existingScheduling: s.scheduling,
          timezone: input.timezone,
          now,
        });
        if (nextRunAt && (!soonest || nextRunAt < soonest)) {
          soonest = nextRunAt;
        }
        if (
          s.nextRunAt &&
          (!currentSoonest || s.nextRunAt < currentSoonest)
        ) {
          currentSoonest = s.nextRunAt;
        }
      }
      return {
        activeCount: activeSpecs.length,
        nextRunAt: soonest,
        currentNextRunAt: currentSoonest,
      };
    }),

  /**
   * Soft-delete the signed-in user. See module-level doc for cascade.
   * Returns { ok: true } on success so the client can call signOut() and
   * redirect to the marketing home.
   */
  deleteSelf: protectedProcedure
    .input(
      z
        .object({
          reason: z.string().max(500).optional(),
          /**
           * Required acknowledgment string from the confirm dialog. We
           * don't trust the existence of the mutation call alone — a
           * stray fetch from a misconfigured client should not silently
           * delete an account.
           */
          confirm: z.literal("DELETE"),
        })
    )
    .mutation(async ({ ctx, input }) => {
      const email = ctx.user.email;
      if (!email) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Account has no email on file — contact support.",
        });
      }

      // QA P0 #2 + P2 #4: hard-assert the service-role key is configured
      // before we soft-delete the application row. Without it we cannot
      // kill the Supabase auth.users row in step 3, so the user could still
      // sign back in to a now-broken application row and silently fail
      // every request. Better to refuse the deletion loudly (and page us
      // via Sentry) than to half-delete in silence — PDPA violation if we
      // ship a confirmation email for a half-completed deletion.
      if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.NEXT_PUBLIC_SUPABASE_URL) {
        const missing = [
          !process.env.SUPABASE_SERVICE_ROLE_KEY && "SUPABASE_SERVICE_ROLE_KEY",
          !process.env.NEXT_PUBLIC_SUPABASE_URL && "NEXT_PUBLIC_SUPABASE_URL",
        ].filter(Boolean);
        Sentry.captureException(
          new Error(
            `account.deleteSelf misconfigured: missing ${missing.join(", ")}`
          ),
          {
            level: "error",
            tags: { route: "account.deleteSelf", reason: "missing_env" },
            extra: { userId: ctx.user.id },
          }
        );
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Account deletion temporarily unavailable, contact ${SUPPORT_EMAIL}`,
        });
      }

      // 1. Audit row first. If the soft-delete fails we still want the
      // attempt logged.
      await db.insert(accountDeletions).values({
        userId: ctx.user.id,
        email,
        reason: input.reason ?? null,
      });

      // 2. Soft-delete the application row. We don't hard-delete because
      // FKs from transactions / digest_runs reference users(id) and we
      // want the financial trail intact for tax / refund disputes. The
      // unique index on `email` would block re-signups; clear the email
      // by suffixing the user_id so re-signup with the same address is
      // possible (PDPA spirit: full disassociation).
      await db
        .update(users)
        .set({
          deletedAt: new Date(),
          email: `deleted+${ctx.user.id}@cadence.invalid`,
          telegramChatId: null,
          telegramUsername: null,
          state: "paused",
          updatedAt: new Date(),
        })
        .where(eq(users.id, ctx.user.id));

      // 3. Best-effort: kill the Supabase auth row so any other open
      // sessions immediately stop working.
      const authResult = await deleteAuthUser(ctx.user.id);

      // 4. Best-effort confirmation email.
      try {
        await sendEmail({
          to: email,
          subject: "Your Cadence account has been deleted",
          text: [
            "Hi,",
            "",
            "Your Cadence account has been deleted. We've removed your",
            "messaging link, paused all future briefs, and disassociated",
            "your email from the account row.",
            "",
            "Financial records (credit purchases, refunds) are retained per",
            "Malaysian tax law but contain no profile data.",
            "",
            `If this wasn't you, reply now — ${SUPPORT_EMAIL}.`,
            "",
            "— Cadence",
          ].join("\n"),
        });
      } catch (err) {
        console.warn("[account.deleteSelf] confirmation email failed", err);
      }

      return {
        ok: true as const,
        authDeleted: authResult.deleted,
      };
    }),
});
