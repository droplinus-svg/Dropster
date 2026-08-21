// Eindeutige Build-Kennung (von Vite zur Build-Zeit ersetzt). Fuer
// Auto-Update-Erkennung und das erneute Zeigen des Onboardings nach Updates.
declare const __BUILD_ID__: string;
export const BUILD_ID: string =
  typeof __BUILD_ID__ !== "undefined" ? __BUILD_ID__ : "dev";

// Zentrale Konfiguration aus den Vite-Umgebungsvariablen.
export const SPOTIFY_CLIENT_ID = import.meta.env.VITE_SPOTIFY_CLIENT_ID as string;
export const SPOTIFY_REDIRECT_URI = import.meta.env
  .VITE_SPOTIFY_REDIRECT_URI as string;

// Scopes: Playlists lesen + Wiedergabe steuern (Play/Pause auf der Spotify-App).
export const SPOTIFY_SCOPES = [
  "playlist-read-private",
  "playlist-read-collaborative",
  "user-read-playback-state",
  "user-modify-playback-state",
].join(" ");

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
export const SUPABASE_ANON_KEY = import.meta.env
  .VITE_SUPABASE_ANON_KEY as string;

// Kennung dieser Instanz: ein Link / eine Spotify-App = ein Freundeskreis.
// So bleibt EINE zentrale Datenbank moeglich, ohne dass sich die Gruppenlisten
// verschiedener Kreise vermischen. Standard ist die (pro Instanz eindeutige)
// Spotify Client ID; optional mit einem sprechenden VITE_INSTANCE_ID
// ueberschreibbar (z. B. "kreis2").
export const INSTANCE_ID =
  (import.meta.env.VITE_INSTANCE_ID as string) || SPOTIFY_CLIENT_ID;
