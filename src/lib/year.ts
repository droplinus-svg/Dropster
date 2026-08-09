import { supabase } from "./supabase";
import type { TrackInfo } from "../spotify/api";

export type YearSource =
  | "musicbrainz"
  | "spotify_fallback"
  | "spotify";

export interface YearResult {
  year: number | null;
  source: YearSource;
  confidence: "high" | "medium" | "low";
}

// Erscheinungsjahr nach der Regel "Erstveroeffentlichung durch DIESEN
// Interpreten" aufloesen. Reihenfolge: geteilter Cache -> MusicBrainz-Funktion
// -> Spotify-Jahr als Notnagel.
export async function resolveYear(t: TrackInfo): Promise<YearResult> {
  const fallback = t.year ? parseInt(t.year, 10) : null;

  // 1) Cache direkt lesen (spart die Funktion, sobald ein Song einmal geloest ist).
  if (supabase) {
    try {
      const { data } = await supabase
        .from("year_cache")
        .select("resolved_year,source,confidence")
        .eq("track_id", t.id)
        .maybeSingle();
      if (data && data.resolved_year != null) {
        return {
          year: data.resolved_year as number,
          source: data.source as YearSource,
          confidence: data.confidence as YearResult["confidence"],
        };
      }
    } catch {
      /* weiter zur Funktion */
    }
  }

  // 2) Netlify-Funktion (MusicBrainz + Cache-Schreiben).
  try {
    const res = await fetch("/.netlify/functions/year", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        trackId: t.id,
        isrc: t.isrc,
        title: t.title,
        artist: t.artist,
        fallbackYear: fallback,
      }),
    });
    if (res.ok) {
      const j = (await res.json()) as Partial<YearResult>;
      return {
        year: j.year ?? fallback,
        source: (j.source as YearSource) ?? "spotify",
        confidence: j.confidence ?? "low",
      };
    }
  } catch {
    /* offline oder lokal ohne Functions */
  }

  // 3) Notnagel: vorlaeufiges Spotify-Jahr.
  return { year: fallback, source: "spotify", confidence: "low" };
}
