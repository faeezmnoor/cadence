/**
 * AppRouter — the single typed surface every client-side caller binds against.
 *
 * Every tRPC sub-router (account, billing, chat, digest, …) is mounted here
 * under its namespace. The exported `AppRouter` type is what
 * `lib/trpc/client.ts` consumes to give React Query end-to-end type safety;
 * change a procedure signature in a router and TS errors propagate into
 * every call site at build time.
 *
 * Adding a router: import it, mount it on `appRouter`, done — no codegen.
 */
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
