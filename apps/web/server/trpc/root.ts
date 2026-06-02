import { router } from "./trpc";
import { adminRouter } from "./routers/admin";
import { authRouter } from "./routers/auth";
import { chatRouter } from "./routers/chat";
import { digestRouter } from "./routers/digest";
import { digestSpecRouter } from "./routers/digestSpec";
import { telegramRouter } from "./routers/telegram";

export const appRouter = router({
  admin: adminRouter,
  auth: authRouter,
  chat: chatRouter,
  digest: digestRouter,
  digestSpec: digestSpecRouter,
  telegram: telegramRouter,
});

export type AppRouter = typeof appRouter;
