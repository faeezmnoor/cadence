import { router } from "./trpc";
import { accountRouter } from "./routers/account";
import { adminRouter } from "./routers/admin";
import { authRouter } from "./routers/auth";
import { billingRouter } from "./routers/billing";
import { briefsRouter } from "./routers/briefs";
import { chatRouter } from "./routers/chat";
import { digestRouter } from "./routers/digest";
import { digestSpecRouter } from "./routers/digestSpec";
import { interestRouter } from "./routers/interest";
import { learningRouter } from "./routers/learning";
import { telegramRouter } from "./routers/telegram";

export const appRouter = router({
  account: accountRouter,
  admin: adminRouter,
  auth: authRouter,
  billing: billingRouter,
  briefs: briefsRouter,
  chat: chatRouter,
  digest: digestRouter,
  digestSpec: digestSpecRouter,
  interest: interestRouter,
  learning: learningRouter,
  telegram: telegramRouter,
});

export type AppRouter = typeof appRouter;
