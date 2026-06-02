import { router } from "./trpc";
import { adminRouter } from "./routers/admin";
import { authRouter } from "./routers/auth";
import { billingRouter } from "./routers/billing";
import { chatRouter } from "./routers/chat";
import { digestRouter } from "./routers/digest";
import { digestSpecRouter } from "./routers/digestSpec";
import { telegramRouter } from "./routers/telegram";

export const appRouter = router({
  admin: adminRouter,
  auth: authRouter,
  billing: billingRouter,
  chat: chatRouter,
  digest: digestRouter,
  digestSpec: digestSpecRouter,
  telegram: telegramRouter,
});

export type AppRouter = typeof appRouter;
