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
    // Immer frisch laden – sonst liefert iOS Safari (bes. als Homescreen-App)
    // eine gecachte Antwort, und neue/entfernte Playlists würden nicht auftauchen.
    cache: "no-store",
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

// ---------- Kontext-Wiedergabe (umgeht das gesperrte Titel-Auslesen) ----------

export async function setShuffle(
  state: boolean,
  deviceId: string
): Promise<void> {
  await api(`/me/player/shuffle?state=${state}&device_id=${deviceId}`, {
    method: "PUT",
  });
}

export async function skipNext(deviceId: string): Promise<void> {
  await api(`/me/player/next?device_id=${deviceId}`, { method: "POST" });
}

// Playlist als Kontext mit Zufall starten – liefert das genutzte Geraet zurueck.
export async function startPlaylist(playlistId: string): Promise<string> {
  const devices = await getDevices();
  const target =
    devices.find((d) => d.type.toLowerCase() === "smartphone") ??
    devices.find((d) => d.is_active) ??
    devices[0];
  if (!target?.id) {
    throw new Error(
      "Spotify ist eingeschlafen 😴 Öffne kurz die Spotify-App, starte dort einen Song und lass ihn laufen – und komm dann sofort wieder hierher zurück, bleib nicht in Spotify. Danach hier erneut „Song abspielen“."
    );
  }
  try {
    await setShuffle(true, target.id);
  } catch {
    /* Shuffle ist optional */
  }
  await api(`/me/player/play?device_id=${target.id}`, {
    method: "PUT",
    body: JSON.stringify({ context_uri: `spotify:playlist:${playlistId}` }),
  });
  return target.id;
}

export interface NowPlaying {
  id: string | null;
  name: string;
  artists: string[];
  year: string | null;
  isrc: string | null;
  contextUri: string | null;
}

// "Was laeuft gerade?" – so bekommen wir Titel/Interpret/Jahr, ohne die
// Playlist auszulesen. contextUri sagt uns, AUS WELCHER Playlist/Quelle der
// Song stammt – damit erkennen wir, ob wirklich unsere Playlist laeuft.
export async function getCurrentlyPlaying(): Promise<NowPlaying | null> {
  const data = await api<
    | {
        item?: {
          id: string;
          name: string;
          artists: { name: string }[];
          album?: { release_date?: string };
          external_ids?: { isrc?: string };
        } | null;
        context?: { uri?: string } | null;
      }
    | undefined
  >("/me/player/currently-playing");
  const it = data?.item;
  if (!it) return null;
  return {
    id: it.id ?? null,
    name: it.name,
    artists: it.artists.map((a) => a.name),
    year: it.album?.release_date ? it.album.release_date.slice(0, 4) : null,
    isrc: it.external_ids?.isrc ?? null,
    contextUri: data?.context?.uri ?? null,
  };
}

// Spotify-User-ID des eingeloggten Kontos. Dient dazu, Spielgruppen pro Person
// zuzuordnen (jede/r sieht nur die eigenen Gruppen), auch bei einer gemeinsamen
// Datenbank. Im Speicher gecacht; nach einem Login-Redirect (Reload) wird sie
// automatisch neu geholt und ist damit immer die des aktuellen Kontos.
let cachedUserId: string | null = null;
export async function getCurrentUserId(): Promise<string | null> {
  if (cachedUserId) return cachedUserId;
  try {
    const data = await api<{ id?: string } | undefined>("/me");
    cachedUserId = data?.id ?? null;
    return cachedUserId;
  } catch {
    return null;
  }
}

// Wer ist gerade in Dropster mit Spotify eingeloggt? (Zur Kontrolle, dass es
// wirklich das Konto ist, in dem die Playlists liegen.)
export async function getMyProfile(): Promise<{
  id: string | null;
  name: string | null;
}> {
  try {
    const data = await api<
      { id?: string; display_name?: string } | undefined
    >("/me");
    return {
      id: data?.id ?? null,
      name: data?.display_name ?? data?.id ?? null,
    };
  } catch {
    return { id: null, name: null };
  }
}

// ISRC eines einzelnen Titels holen. Der Einzeltitel-Endpoint /tracks/{id}
// liefert external_ids.isrc zuverlaessig und ist – anders als die
// Playlist-Endpoints – im Dev-Mode nicht gesperrt. Wird genutzt, um die ISRC
// nachzuladen, wenn Warteschlange/Datenbank sie nicht mitgeliefert haben.
export async function getTrackIsrc(id: string): Promise<string | null> {
  try {
    const data = await api<{ external_ids?: { isrc?: string } } | undefined>(
      `/tracks/${id}`
    );
    return data?.external_ids?.isrc ?? null;
  } catch {
    return null;
  }
}

// Lautstaerke setzen – wir nutzen "auf 0" als sanftes "Stopp", das die
// Spotify-App aktiv (und damit verbunden) haelt.
export async function setVolume(
  percent: number,
  deviceId: string
): Promise<void> {
  await api(
    `/me/player/volume?volume_percent=${Math.round(
      percent
    )}&device_id=${deviceId}`,
    { method: "PUT" }
  );
}

// Den laufenden Titel an den Anfang setzen (Position 0), damit der gerätselte
// Song immer bei 0:00 startet – auch wenn davor stumm durchgeschaltet wurde.
export async function seekToStart(deviceId: string): Promise<void> {
  await api(`/me/player/seek?position_ms=0&device_id=${deviceId}`, {
    method: "PUT",
  });
}

export async function getPlaybackVolume(): Promise<number | null> {
  const data = await api<{ device?: { volume_percent?: number } } | undefined>(
    "/me/player"
  );
  return data?.device?.volume_percent ?? null;
}

// Einen abspielbaren Naturklang-Track suchen (Suche mit Nutzer-Token liefert
// automatisch im Land verfuegbare Treffer).
export async function searchAmbientUri(): Promise<string | null> {
  const data = await api<{
    tracks?: { items?: { uri?: string; is_playable?: boolean }[] };
  }>(
    `/search?q=${encodeURIComponent(
      "beruhigende Naturgeräusche"
    )}&type=track&limit=10`
  );
  const items = data.tracks?.items ?? [];
  const ok = items.find((t) => t.uri && t.is_playable !== false) ?? items[0];
  return ok?.uri ?? null;
}

// ---------- Warteschlange: Titel vorab lernen, ohne sie abzuspielen ----------

export interface TrackInfo {
  id: string;
  uri: string;
  title: string;
  artist: string;
  year: string | null;
  isrc: string | null;
}

interface RawQueueTrack {
  id?: string;
  uri?: string;
  name?: string;
  type?: string;
  artists?: { name: string }[];
  album?: { release_date?: string };
  external_ids?: { isrc?: string };
}

function toTrackInfo(t: RawQueueTrack | null | undefined): TrackInfo | null {
  if (!t || !t.id || !t.uri || !t.uri.startsWith("spotify:track:")) return null;
  return {
    id: t.id,
    uri: t.uri,
    title: t.name ?? "",
    artist: (t.artists ?? []).map((a) => a.name).join(", "),
    year: t.album?.release_date
      ? String(t.album.release_date).slice(0, 4)
      : null,
    isrc: t.external_ids?.isrc ?? null,
  };
}

// Die naechsten Titel der laufenden Playlist lesen (ohne sie abzuspielen).
export async function getQueue(): Promise<{
  current: TrackInfo | null;
  upcoming: TrackInfo[];
}> {
  const data = await api<
    { currently_playing?: RawQueueTrack; queue?: RawQueueTrack[] } | undefined
  >("/me/player/queue");
  const current = toTrackInfo(data?.currently_playing);
  const upcoming = (data?.queue ?? [])
    .map(toTrackInfo)
    .filter((t): t is TrackInfo => t !== null);
  return { current, upcoming };
}

// Einen BESTIMMTEN Titel INNERHALB der Playlist starten – kein Ueberspringen,
// und die Warteschlange bleibt weiter mit Playlist-Titeln gefuellt.
export async function playTrackInContext(
  playlistId: string,
  trackUri: string,
  deviceId: string
): Promise<void> {
  await api(`/me/player/play?device_id=${deviceId}`, {
    method: "PUT",
    body: JSON.stringify({
      context_uri: `spotify:playlist:${playlistId}`,
      offset: { uri: trackUri },
    }),
  });
}

// ---------- Playlists ----------
// Eine EINZELNE Playlist per ID abfragen (Name + Titelzahl). Dieser Endpunkt
// ist – anders als /me/playlists – NICHT vom Cache-Problem betroffen und liefert
// den aktuellen Stand. So kann man eine Playlist per Link zuverlässig hinzufügen.
export async function getPlaylistBrief(
  id: string
): Promise<{ id: string; name: string; total: number } | null> {
  try {
    const data = await api<{
      id?: string;
      name?: string;
      tracks?: { total?: number };
    }>(`/playlists/${id}?fields=id,name,tracks(total)&ts=${Date.now()}`);
    if (!data?.name) return null;
    return {
      id: data.id ?? id,
      name: data.name,
      total: data.tracks?.total ?? 0,
    };
  } catch {
    return null;
  }
}

export async function getMyPlaylists(): Promise<SpotifyPlaylist[]> {
  const out: SpotifyPlaylist[] = [];
  // Zeitstempel als Cache-Buster, damit auch keine Zwischenstation eine alte
  // Liste liefert.
  let url = `/me/playlists?limit=50&ts=${Date.now()}`;
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

// Die ECHTEN Titel der Playlist lesen – inkl. Abspiel-Adresse (uri) – aus dem
// Playlist-Objekt (GET /playlists/{id}), das im Dev-Mode erlaubt ist. Damit
// spielen wir gezielt einen Playlist-Song ab, statt Spotify raten zu lassen,
// was gerade laeuft (das konnte sonst ein fremder Weck-Song sein!). `total` ist
// die von Spotify gemeldete Gesamtzahl; ist members.length < total, war die
// Liste zu lang fuer eine Seite (>100) und wir kennen nicht alle.
export async function getPlaylistMembers(
  playlistId: string
): Promise<{ members: TrackInfo[]; total: number }> {
  const data = await api<{
    tracks?: {
      total?: number;
      items?: {
        track: {
          id?: string;
          uri?: string;
          name?: string;
          is_local?: boolean;
          is_playable?: boolean;
          artists?: { name: string }[];
          album?: { release_date?: string };
          external_ids?: { isrc?: string };
        } | null;
      }[];
    };
  }>(`/playlists/${playlistId}`);
  const items = data.tracks?.items ?? [];
  const members: TrackInfo[] = [];
  for (const it of items) {
    const t = it.track;
    if (!t || t.is_local) continue;
    if (!t.uri || !t.uri.startsWith("spotify:track:")) continue;
    if (t.is_playable === false) continue; // im Land nicht abspielbar -> raus
    const id = t.id ?? (t.uri.split(":").pop() as string);
    members.push({
      id,
      uri: t.uri,
      title: t.name ?? "",
      artist: (t.artists ?? []).map((a) => a.name).join(", "),
      year: t.album?.release_date
        ? String(t.album.release_date).slice(0, 4)
        : null,
      isrc: t.external_ids?.isrc ?? null,
    });
  }
  return { members, total: data.tracks?.total ?? members.length };
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
