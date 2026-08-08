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
