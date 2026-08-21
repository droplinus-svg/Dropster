import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// Eindeutige Kennung pro Build. Wird in die App eingebacken UND als
// dist/version.json ausgeliefert – so erkennt die laufende App, wenn eine
// neuere Version deployt wurde (Auto-Update-Band), und zeigt danach das
// Onboarding erneut.
const BUILD_ID = new Date().toISOString();

// Kleines Plugin: schreibt version.json in den Build-Output.
const versionJson = {
  name: "dropster-version-json",
  apply: "build" as const,
  generateBundle() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (this as any).emitFile({
      type: "asset",
      fileName: "version.json",
      source: JSON.stringify({ build: BUILD_ID }),
    });
  },
};

// PWA-Konfiguration: installierbar auf dem iPhone-Homescreen, Vollbild.
export default defineConfig({
  define: { __BUILD_ID__: JSON.stringify(BUILD_ID) },
  plugins: [
    react(),
    versionJson,
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
