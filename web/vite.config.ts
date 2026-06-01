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

// Live-only endpoints — never cached. Auth + Google flows (login state,
// OAuth callbacks, Google calendar list) must always hit the network.
const NEVER_CACHE_RE = /^\/api\/(auth|google)(\/|$)/;

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
          // Auth/Google: always live. NetworkOnly avoids stale login state
          // and OAuth artefacts; also doesn't queue, so SW never rejects
          // these with a "no-response".
          {
            urlPattern: ({ url }) => NEVER_CACHE_RE.test(url.pathname),
            handler: "NetworkOnly",
          },
          // All other GET /api/* — NetworkFirst with a short timeout. Fresh
          // data on every reload; falls back to the last cached payload only
          // when the network actually fails (true offline). Cache name is
          // versioned so the previous SWR-era cache (api-read-v1) is
          // abandoned after deploy.
          {
            urlPattern: ({ url, request }) =>
              request.method === "GET" && url.pathname.startsWith("/api/"),
            handler: "NetworkFirst",
            options: {
              cacheName: "api-read-v2",
              networkTimeoutSeconds: 3,
              expiration: { maxEntries: 200, maxAgeSeconds: 7 * 24 * 60 * 60 },
            },
          },
          // Non-GET (POST/PUT/PATCH/DELETE) requests are intentionally not
          // listed here: Workbox only intercepts methods it has a rule for,
          // so mutations pass straight through to the browser fetch. The
          // JS-side outbox in lib/api.ts owns offline replay end-to-end —
          // doubling that up with a SW BackgroundSync queue was producing
          // the "respondWith: no-response" rejections this commit fixes.
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
