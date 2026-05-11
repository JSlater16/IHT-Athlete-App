import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["iht-logo.png", "pwa-192.png", "pwa-512.png"],
      manifest: {
        name: "IHT Coach",
        short_name: "IHT Coach",
        description: "IHT Performance coach dashboard",
        theme_color: "#071018",
        background_color: "#071018",
        display: "standalone",
        start_url: "/",
        scope: "/",
        icons: [
          { src: "pwa-192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-512.png", sizes: "512x512", type: "image/png" },
          { src: "pwa-512.png", sizes: "512x512", type: "image/png", purpose: "maskable any" }
        ]
      },
      workbox: {
        navigateFallbackDenylist: [/^\/api\//]
      }
    })
  ],
  build: {
    sourcemap: true
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:4000",
        changeOrigin: true
      }
    }
  }
});
