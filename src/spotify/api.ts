// Duenner Wrapper um die Spotify Web API. Steuert die Wiedergabe der
// Spotify-App auf demselben Handy (kein eigenes Streaming).
import { getAccessToken, logout } from "./auth";

const BASE = "https://api.spotify.com/v1";

async function api<T>(
  path: string,
  init: RequestInit = {}
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
  if (res.status === 204) return undefined as T; // z. B. play/pause
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Spotify API ${res.status}: ${text}`);
  }
  return (await res.json()) as T;
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
    out.push(...data.items);
    if (!data.next) break;
    url = data.next.replace(BASE, "");
  }
  return out;
}

// Alle Tracks einer Playlist (paginiert), auf das Noetige reduziert.
export async function getPlaylistTracks(playlistId: string): Promise<Track[]> {
  const out: Track[] = [];
  const fields =
    "items(track(uri,name,external_ids(isrc),artists(name,id),album(release_date))),next";
  let url = `/playlists/${playlistId}/tracks?limit=100&fields=${encodeURIComponent(
    fields
  )}`;
  for (;;) {
    const data = await api<{
      items: { track: RawTrack | null }[];
      next: string | null;
    }>(url);
    for (const item of data.items) {
      const t = item.track;
      if (!t || !t.uri) continue; // entfernte/lokale Tracks ueberspringen
      out.push({
        uri: t.uri,
        name: t.name,
        isrc: t.external_ids?.isrc ?? null,
        artists: t.artists.map((a) => a.name),
        artistIds: t.artists.map((a) => a.id),
        albumReleaseDate: t.album?.release_date ?? null,
      });
    }
    if (!data.next) break;
    url = data.next.replace(BASE, "");
  }
  return out;
}

interface RawTrack {
  uri: string;
  name: string;
  external_ids?: { isrc?: string };
  artists: { name: string; id: string }[];
  album?: { release_date?: string };
}
