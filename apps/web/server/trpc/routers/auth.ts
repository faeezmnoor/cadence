/**
 * auth.* — minimal signed-in identity probe.
 *
 * Sign-in/sign-out themselves are handled by Supabase Auth on the client
 * (Magic Link → cookie) and by middleware on the server — this router only
 * exposes the resolved identity for UI gating ("Sign in" vs "Account").
 *
 * Keep this surface tiny. New auth-related procedures (link providers,
 * sessions list, MFA) should go in dedicated routers, not here.
 */
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
