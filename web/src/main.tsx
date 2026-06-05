import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import App from "./App";
import { queryStorage } from "@/lib/queryPersist";
import { startSyncDaemon } from "@/lib/syncDaemon";
// Self-hosted fonts (was Google Fonts CDN). Bundled by Vite and served from
// our own origin so a strict server CSP (style-src 'self') no longer blocks
// the stylesheet — and the fonts now work offline too. Weights mirror what
// index.css uses: Inter 400/500/600/700, JetBrains Mono 400/500.
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
import "./index.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      // Allow cached pages to render on cold-start offline; React Query will
      // pause fetches until network comes back and revalidate then.
      networkMode: "offlineFirst",
      // Surfaces stale data instantly while fetching fresh in the background.
      staleTime: 30_000,
      gcTime: 7 * 24 * 60 * 60 * 1000,
    },
    mutations: {
      // Default is "online" — React Query refuses to run mutationFn when
      // navigator.onLine is false and parks the mutation in a "paused"
      // state with isPending=true, leaving Submit buttons disabled and the
      // form stuck until the network returns. We own the offline replay
      // (lib/api.ts → enqueue() + OfflineQueuedError), so we always want
      // the mutationFn to run and let request() decide between hitting the
      // network and parking the op in the outbox.
      networkMode: "offlineFirst",
    },
  },
});

const persister = createAsyncStoragePersister({
  storage: queryStorage,
  key: "event-tracker-rq",
});

// Drain the offline outbox on boot and whenever the network comes back.
startSyncDaemon(queryClient);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        // App-version buster — a deploy drops the persisted cache.
        buster: __APP_VERSION__,
        maxAge: 7 * 24 * 60 * 60 * 1000,
      }}
    >
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </PersistQueryClientProvider>
  </React.StrictMode>,
);
