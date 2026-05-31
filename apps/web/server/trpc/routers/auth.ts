import { router, publicProcedure } from "../trpc";

export const authRouter = router({
  /**
   * Returns the current signed-in user, or null. Used by client-side gating
   * and as the canonical "am I logged in" probe.
   */
  me: publicProcedure.query(({ ctx }) => {
    if (!ctx.user) return null;
    return {
      id: ctx.user.id,
      email: ctx.user.email ?? null,
    };
  }),
});
