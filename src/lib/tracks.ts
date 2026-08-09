import { supabase } from "./supabase";
import type { TrackInfo } from "../spotify/api";

// Bereits bekannte Titel einer Playlist laden (ueber die Zeit angelernt).
export async function loadKnownTracks(
  playlistId: string
): Promise<TrackInfo[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("playlist_track")
    .select("track_id,uri,title,artist,year,isrc")
    .eq("playlist_id", playlistId);
  if (error) throw new Error(error.message);
  return (data ?? []).map(
    (r: {
      track_id: string;
      uri: string;
      title: string | null;
      artist: string | null;
      year: string | null;
      isrc: string | null;
    }) => ({
      id: r.track_id,
      uri: r.uri,
      title: r.title ?? "",
      artist: r.artist ?? "",
      year: r.year,
      isrc: r.isrc ?? null,
    })
  );
}

// Neu entdeckte Titel dauerhaft merken.
export async function recordTracks(
  playlistId: string,
  tracks: TrackInfo[]
): Promise<void> {
  if (!supabase || tracks.length === 0) return;
  const rows = tracks.map((t) => ({
    playlist_id: playlistId,
    track_id: t.id,
    uri: t.uri,
    title: t.title,
    artist: t.artist,
    year: t.year,
    isrc: t.isrc,
  }));
  await supabase
    .from("playlist_track")
    .upsert(rows, { onConflict: "playlist_id,track_id" });
}
