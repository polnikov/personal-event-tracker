import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import App from "./App";
import { queryStorage } from "@/lib/queryPersist";
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
  },
});

const persister = createAsyncStoragePersister({
  storage: queryStorage,
  key: "event-tracker-rq",
});

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
