// Duenner Wrapper um die Spotify Web API. Steuert die Wiedergabe der
// Spotify-App auf demselben Handy (kein eigenes Streaming).
import { getAccessToken, logout } from "./auth";

const BASE = "https://api.spotify.com/v1";

async function api<T>(
  path: string,
  init: RequestInit = {},
  attempt = 0
): Promise<T> {
  const token = await getAccessToken();
  if (!token) throw new Error("Nicht eingeloggt.");
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  if (res.status === 401) {
    logout();
    throw new Error("Session abgelaufen – bitte neu einloggen.");
  }
  // Spotify-Player-Endpoints liefern gelegentlich 5xx, wenn das Geraet
  // gerade erst aktiv geworden ist. Kurz warten und automatisch erneut
  // versuchen (bis zu 3-mal).
  if (res.status >= 500 && attempt < 3) {
    await new Promise((r) => setTimeout(r, 600));
    return api<T>(path, init, attempt + 1);
  }
  // Wichtig fuer iOS Safari: bei leerem Body wirft res.json() den Fehler
  // "The string did not match the expected pattern". Daher Body als Text
  // lesen und nur bei tatsaechlichem Inhalt als JSON parsen.
  const body = await res.text();
  if (!res.ok) {
    // Spotifys konkreten Grund herausziehen, statt nur "Forbidden" zu zeigen.
    let detail = body;
    try {
      const j = JSON.parse(body);
      const m: string | undefined = j?.error?.message;
      const reason: string | undefined = j?.error?.reason;
      detail = reason ? `${m ?? ""} (Grund: ${reason})` : m ?? body;
    } catch {
      /* Body ist kein JSON – Rohtext behalten */
    }
    throw new Error(`Spotify API ${res.status}: ${detail}`);
  }
  // Player-Endpoints (play/pause/transfer) liefern manchmal einen leeren oder
  // nicht-JSON-Body. Nur parsen, wenn es wirklich JSON ist – sonst undefined.
  if (!body.trim()) return undefined as T;
  try {
    return JSON.parse(body) as T;
  } catch {
    return undefined as T;
  }
}

// ---------- Typen ----------
export interface SpotifyDevice {
  id: string | null;
  is_active: boolean;
  name: string;
  type: string;
}

export interface SpotifyPlaylist {
  id: string;
  name: string;
  images: { url: string }[];
  tracks: { total: number };
}

export interface Track {
  uri: string;
  name: string;
  isrc: string | null;
  artists: string[];
  artistIds: string[];
  albumReleaseDate: string | null; // Fallback-Jahr
}

// ---------- Wiedergabe (der Durchstich) ----------
export async function getDevices(): Promise<SpotifyDevice[]> {
  const data = await api<{ devices: SpotifyDevice[] }>("/me/player/devices");
  return data.devices;
}

export async function transferPlayback(deviceId: string): Promise<void> {
  await api("/me/player", {
    method: "PUT",
    body: JSON.stringify({ device_ids: [deviceId], play: false }),
  });
}

export async function playTrack(
  uri: string,
  deviceId?: string
): Promise<void> {
  const query = deviceId ? `?device_id=${deviceId}` : "";
  await api(`/me/player/play${query}`, {
    method: "PUT",
    body: JSON.stringify({ uris: [uri] }),
  });
}

export async function pausePlayback(deviceId?: string): Promise<void> {
  const query = deviceId ? `?device_id=${deviceId}` : "";
  await api(`/me/player/pause${query}`, { method: "PUT" });
}

// Bestes Zielgeraet ermitteln – bevorzugt das Smartphone (das Spiel-Handy).
export async function pickBestDeviceId(): Promise<string | null> {
  const devices = await getDevices();
  const target =
    devices.find((d) => d.type.toLowerCase() === "smartphone") ??
    devices.find((d) => d.is_active) ??
    devices[0];
  return target?.id ?? null;
}

// Einen Song starten – mit Fallback und aussagekraeftiger Diagnose.
export async function startTrack(uri: string): Promise<void> {
  const devices = await getDevices();
  const target =
    devices.find((d) => d.type.toLowerCase() === "smartphone") ??
    devices.find((d) => d.is_active) ??
    devices[0];
  if (!target?.id) {
    throw new Error(
      "Kein Spotify-Gerät gefunden. Starte in der Spotify-App auf dem iPhone kurz einen Song und lass ihn laufen."
    );
  }
  try {
    // 1. Versuch: gezielt das gewaehlte Geraet ansteuern.
    await playTrack(uri, target.id);
  } catch {
    try {
      // 2. Versuch (Fallback): ohne feste Kennung auf dem aktiven Geraet.
      await playTrack(uri);
    } catch (e2) {
      const liste =
        devices
          .map((d) => `${d.name}[${d.type}${d.is_active ? ",aktiv" : ""}]`)
          .join(", ") || "keine";
      throw new Error(
        `${(e2 as Error).message} — Ziel: ${target.name} (${target.type}); gefundene Geräte: ${liste}`
      );
    }
  }
}

// ---------- Playlists ----------
export async function getMyPlaylists(): Promise<SpotifyPlaylist[]> {
  const out: SpotifyPlaylist[] = [];
  let url = "/me/playlists?limit=50";
  // Paginierung
  for (;;) {
    const data = await api<{
      items: SpotifyPlaylist[];
      next: string | null;
    }>(url);
    out.push(...data.items.filter((p): p is SpotifyPlaylist => !!p));
    if (!data.next) break;
    url = data.next.replace(BASE, "");
  }
  return out;
}

// Titel einer Playlist laden.
// WICHTIG: GET /playlists/{id}/tracks ist fuer Development-Mode-Apps von Spotify
// gesperrt (403). Wir lesen die Titel daher aus dem Playlist-OBJEKT
// (GET /playlists/{id}), das die erste Seite (bis ~100 Titel) direkt enthaelt.
export async function getPlaylistTracks(playlistId: string): Promise<Track[]> {
  // Volle Antwort (kein fields-Filter), damit nichts an einer Feld-Projektion
  // scheitert.
  const data = await api<{
    tracks?: { total?: number; items?: { track: RawTrack | null }[] };
  }>(`/playlists/${playlistId}`);

  const items = data.tracks?.items ?? [];
  const out: Track[] = [];
  for (const item of items) {
    const t = item.track;
    if (!t || !t.uri || t.is_local) continue; // entfernte/lokale Tracks weg
    out.push({
      uri: t.uri,
      name: t.name,
      isrc: t.external_ids?.isrc ?? null,
      artists: t.artists.map((a) => a.name),
      artistIds: t.artists.map((a) => a.id),
      albumReleaseDate: t.album?.release_date ?? null,
    });
  }

  // Diagnose im Leerfall: sagt uns, ob Spotify die Titel abstreift.
  if (out.length === 0) {
    const total = data.tracks?.total ?? "?";
    throw new Error(
      `Playlist geladen, aber 0 nutzbare Titel. Spotify meldet total=${total}, gelieferte Einträge=${items.length}. ` +
        `(total>0 aber Einträge=0 → Spotify sperrt die Titel-Daten; sonst Filter-/Parsing-Frage.)`
    );
  }
  return out;
}

interface RawTrack {
  uri: string;
  name: string;
  is_local?: boolean;
  is_playable?: boolean;
  external_ids?: { isrc?: string };
  artists: { name: string; id: string }[];
  album?: { release_date?: string };
}
