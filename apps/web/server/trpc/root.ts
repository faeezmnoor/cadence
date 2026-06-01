import { router } from "./trpc";
import { authRouter } from "./routers/auth";
import { digestSpecRouter } from "./routers/digestSpec";

export const appRouter = router({
  auth: authRouter,
  digestSpec: digestSpecRouter,
});

export type AppRouter = typeof appRouter;
