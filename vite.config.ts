import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// PWA-Konfiguration: installierbar auf dem iPhone-Homescreen, Vollbild.
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      // Vorerst KEIN aggressives Caching: Der Service Worker entfernt sich
      // selbst und raeumt alte Caches ab, damit iOS immer die frische Version
      // von Netlify laedt. (Spaeter, wenn die App stabil ist, wieder aktivieren.)
      selfDestroying: true,
      includeAssets: ["favicon.svg"],
      manifest: {
        name: "Dropster",
        short_name: "Dropster",
        description: "Musik-Rate-Spiel mit Spotify",
        theme_color: "#0f1115",
        background_color: "#0f1115",
        display: "standalone",
        orientation: "portrait",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
          {
            src: "icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
    }),
  ],
  server: { port: 5173 },
});
