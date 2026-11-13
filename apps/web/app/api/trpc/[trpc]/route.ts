/**
 * GET/POST /api/trpc/[trpc] — the single HTTP entry point for every tRPC call.
 *
 * Routes Next.js App Router requests into the typed `appRouter`, with
 * `createTRPCContext` resolving the Supabase user (and cookies) once per
 * request. Both GET (queries) and POST (mutations + batches) hit the same
 * handler — required by `httpBatchLink`.
 *
 * Don't add auth or logging here — put it in `createTRPCContext` or in the
 * `protectedProcedure` middleware so every call path is covered uniformly.
 *
 * The one thing that does sit here is the request-size guard
 * (`withBodyLimit`, slice 005 / decision 0013): it must run before tRPC
 * reads and parses the body, and `createTRPCContext` and procedure
 * middleware both run after that. It is neither auth nor logging.
 */
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "@/server/trpc/root";
import { createTRPCContext } from "@/server/trpc/context";
import { withBodyLimit } from "@/server/http/body-limit";

const handler = withBodyLimit((request: Request) =>
  fetchRequestHandler({
    endpoint: "/api/trpc",
    req: request,
    router: appRouter,
    createContext: (opts) => createTRPCContext(opts),
  })
);

export { handler as GET, handler as POST };
