"use client";

/**
 * TRPCProvider — wraps the React tree with React Query + tRPC HTTP transport.
 *
 * Mounted once near the root of the client tree (see `app/layout.tsx` /
 * `app/providers.tsx`). Uses a single `httpBatchLink` to `/api/trpc` with
 * superjson so Date/BigInt round-trip correctly between server and client.
 *
 * Extend the `links` array if/when we add logging, retries, or split links
 * (e.g. an SSE link for streaming). Keep the QueryClient inside useState so
 * it's stable across renders but not shared across requests in SSR.
 */
import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import { trpc } from "./client";

export function TRPCProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  const [trpcClient] = useState(() =>
    trpc.createClient({
      links: [
        httpBatchLink({
          url: "/api/trpc",
          transformer: superjson,
        }),
      ],
    })
  );

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </trpc.Provider>
  );
}
