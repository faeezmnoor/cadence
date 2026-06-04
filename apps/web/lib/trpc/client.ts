"use client";

/**
 * Client-side tRPC React hooks bound to our `AppRouter` type.
 *
 * Import `trpc` anywhere in a client component to get type-safe
 * `trpc.<router>.<procedure>.useQuery / useMutation` hooks. The actual
 * HTTP transport is configured by `lib/trpc/provider.tsx`, which must
 * wrap the React tree.
 *
 * Do not add runtime logic here — keep it a one-liner so the type plumbing
 * is obvious.
 */
import { createTRPCReact } from "@trpc/react-query";
import type { AppRouter } from "@/server/trpc/root";

export const trpc = createTRPCReact<AppRouter>();
