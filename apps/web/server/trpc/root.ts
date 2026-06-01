import { router } from "./trpc";
import { authRouter } from "./routers/auth";
import { chatRouter } from "./routers/chat";
import { digestSpecRouter } from "./routers/digestSpec";

export const appRouter = router({
  auth: authRouter,
  chat: chatRouter,
  digestSpec: digestSpecRouter,
});

export type AppRouter = typeof appRouter;
