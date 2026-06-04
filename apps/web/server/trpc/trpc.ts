/**
 * tRPC primitives: the typed `router`, `publicProcedure`, `protectedProcedure`,
 * and `adminProcedure` builders that every router in `routers/` is constructed
 * from. This file owns the application-level trust boundary in code form —
 * `protectedProcedure` is where signed-out callers get 401'd, and
 * `adminProcedure` is where non-admins get 403'd via `isAdminEmail`.
 *
 * Extend when you need a new auth tier (e.g. service-role-only for an
 * internal cron-triggered mutation). Do NOT duplicate the auth check
 * inside individual routers — keep the gate centralized here.
 */
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { Context } from "./context";
import { isAdminEmail } from "@/server/auth/admin";

const t = initTRPC.context<Context>().create({
  transformer: superjson,
  errorFormatter({ shape }) {
    return shape;
  },
});

export const router = t.router;
export const publicProcedure = t.procedure;

/**
 * Procedure that requires a signed-in Supabase user. Throws UNAUTHORIZED
 * otherwise, so calling code can rely on `ctx.user` being non-null.
 */
export const protectedProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});

/**
 * T-304: requires an authenticated user whose email is in CADENCE_ADMIN_EMAILS.
 * Used by `admin.*` routers (runs viewer today, replay tomorrow).
 *
 * Returns 403 (FORBIDDEN) for signed-in non-admins so the UI can distinguish
 * "log in" from "you can't see this".
 */
export const adminProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  if (!isAdminEmail(ctx.user.email)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Admin only." });
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});
