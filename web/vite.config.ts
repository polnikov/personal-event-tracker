import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import path from "node:path";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(path.resolve(__dirname, "package.json"), "utf-8"));

// Safe-to-cache read endpoints — UI must render from cache instantly while
// offline. Auth + Google must always go to the network (login state, OAuth
// callbacks, calendar list) so we don't serve stale credentials/calendars.
const SAFE_READ_RE = /^\/api\/(events|clients|categories|reports|dashboard|calendar)(\/|$)/;
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
    // Buster for the persisted React Query cache; bumps with each release.
    __APP_VERSION__: JSON.stringify(pkg.version),
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
