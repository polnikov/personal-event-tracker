import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import path from "node:path";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(path.resolve(__dirname, "package.json"), "utf-8"));

// Cache buster: include the git commit SHA so every deploy actually changes
// the buster string. Without it, package.json hardly ever changes and the
// persisted React Query cache (Dexie) plus the Workbox precache would keep
// serving stale state across deploys.
function buildVersion(): string {
  try {
    const sha = execSync("git rev-parse --short HEAD", {
      cwd: __dirname,
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
    return `${pkg.version}+${sha}`;
  } catch {
    // Tarball builds / detached git: fall back to the wall clock so the
    // value still changes per build.
    return `${pkg.version}+${Date.now()}`;
  }
}
const APP_VERSION = buildVersion();

// Safe-to-cache read endpoints — UI must render from cache instantly while
// offline. Auth + Google must always go to the network (login state, OAuth
// callbacks, calendar list) so we don't serve stale credentials/calendars.
const SAFE_READ_RE = /^\/api\/(events|clients|categories|reports|dashboard|calendar)(\/|$)/;
const MUTABLE_RE = /^\/api\/(events|clients|categories)(\/|$)/;
const NEVER_CACHE_RE = /^\/api\/(auth|google)(\/|$)/;

// Workbox runtimeCaching rules accept a single HTTP method per entry, so each
// mutating method needs its own entry pointing at the same Background Sync
// queue. This is a safety net: the client-side outbox already handles
// "offline at submit-time"; SW Background Sync only matters when a fetch is
// in-flight as the tab closes (we never get to enqueue from JS).
const BG_SYNC_OPTIONS = {
  backgroundSync: {
    name: "et-mutations",
    options: { maxRetentionTime: 24 * 60 }, // minutes
  },
};
const MUTATION_METHODS = ["POST", "PUT", "PATCH", "DELETE"] as const;

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icon.png"],
      manifest: {
        name: "Трекер событий",
        short_name: "Трекер",
        description: "Личный трекер событий",
        theme_color: "#2A9DA8",
        background_color: "#FAFAF7",
        display: "standalone",
        start_url: "/",
        icons: [
          {
            src: "/icon.png",
            sizes: "192x192 512x512",
            type: "image/png",
            purpose: "any maskable",
          },
        ],
      },
      workbox: {
        navigateFallback: "/index.html",
        // Wipe stale precaches from older deploys + activate the new SW
        // immediately so users don't sit on yesterday's bundle.
        cleanupOutdatedCaches: true,
        skipWaiting: true,
        clientsClaim: true,
        runtimeCaching: [
          // Auth/Google: never cached, never queued — always live.
          {
            urlPattern: ({ url }) => NEVER_CACHE_RE.test(url.pathname),
            handler: "NetworkOnly",
          },
          // Read endpoints: serve from cache instantly, refresh in background.
          {
            urlPattern: ({ url, request }) =>
              request.method === "GET" && SAFE_READ_RE.test(url.pathname),
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "api-read-v1",
              expiration: { maxEntries: 200, maxAgeSeconds: 7 * 24 * 60 * 60 },
            },
          },
          // SW-level Background Sync for mutations: catches fetches that fail
          // mid-flight (tab close, network blip) when the JS daemon can't.
          // The server is idempotent, so a SW-replay alongside the JS daemon
          // is safe — both carry the same Idempotency-Key.
          ...MUTATION_METHODS.map((method) => ({
            urlPattern: ({ url }: { url: URL }) => MUTABLE_RE.test(url.pathname),
            handler: "NetworkOnly" as const,
            method,
            options: BG_SYNC_OPTIONS,
          })),
          // Everything else under /api/ — fall back to a short-timeout
          // network-first so things still work when online (e.g. /healthz).
          {
            urlPattern: ({ url }) => url.pathname.startsWith("/api/"),
            handler: "NetworkFirst",
            options: { cacheName: "api-cache", networkTimeoutSeconds: 5 },
          },
        ],
      },
    }),
  ],
  define: {
    // Buster for the persisted React Query cache; changes per commit so a
    // deploy invalidates the stored cache and the new code reads fresh data.
    __APP_VERSION__: JSON.stringify(APP_VERSION),
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
        secure: false,
      },
    },
  },
});
