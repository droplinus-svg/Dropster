import { supabase } from "./supabase";
import { getTrackIsrc, type TrackInfo } from "../spotify/api";

export type YearSource = "musicbrainz" | "spotify_fallback" | "spotify";

// Warum stammt das Jahr aus dieser Quelle? (Fuer Anzeige + Diagnose.)
export type YearReason =
  | "mb_hit" // MusicBrainz-Treffer
  | "no_isrc" // Track ohne ISRC -> MusicBrainz nicht befragbar
  | "mb_notfound" // MusicBrainz kennt den Song nicht
  | "mb_error" // MusicBrainz-Aufruf fehlgeschlagen
  | "function_error" // Netlify-Funktion selbst hat einen Fehler
  | "server_unreachable"; // Netlify-Funktion nicht erreichbar

export interface YearResult {
  year: number | null;
  source: YearSource;
  confidence: "high" | "medium" | "low";
  reason: YearReason;
  debug?: string; // Klartext-Ursache bei Fehlern (zur Diagnose)
}

// Erscheinungsjahr nach der Regel "Erstveroeffentlichung durch DIESEN
// Interpreten" aufloesen. Reihenfolge: geteilter Cache (nur echte
// MusicBrainz-Treffer) -> MusicBrainz-Funktion -> Spotify-Jahr als Notnagel.
export async function resolveYear(t: TrackInfo): Promise<YearResult> {
  const fallback = t.year ? parseInt(t.year, 10) : null;

  // 1) Cache direkt lesen – aber NUR echten MusicBrainz-Treffern vertrauen.
  //    Ein alter Spotify-Fallback im Cache soll MusicBrainz nicht blockieren.
  if (supabase) {
    try {
      const { data } = await supabase
        .from("year_cache")
        .select("resolved_year,source,confidence")
        .eq("track_id", t.id)
        .maybeSingle();
      if (
        data &&
        data.resolved_year != null &&
        data.source === "musicbrainz"
      ) {
        return {
          year: data.resolved_year as number,
          source: "musicbrainz",
          confidence: data.confidence as YearResult["confidence"],
          reason: "mb_hit",
        };
      }
    } catch {
      /* weiter zur Funktion */
    }
  }

  // 2) ISRC sicherstellen: Warteschlange/Datenbank liefern sie oft nicht mit.
  //    Dann gezielt ueber /tracks/{id} nachladen (im Dev-Mode nicht gesperrt).
  let isrc = t.isrc;
  if (!isrc) {
    isrc = await getTrackIsrc(t.id);
  }

  // 3) Netlify-Funktion (MusicBrainz + Cache-Schreiben nur bei Treffer).
  try {
    const res = await fetch("/.netlify/functions/year", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        trackId: t.id,
        isrc,
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
        reason: (j.reason as YearReason) ?? "mb_error",
        debug: j.debug,
      };
    }
    // Funktion antwortet, aber mit Fehlerstatus (z. B. 500).
    const body = await res.text().catch(() => "");
    return {
      year: fallback,
      source: "spotify",
      confidence: "low",
      reason: "function_error",
      debug: `HTTP ${res.status}: ${body.slice(0, 300)}`,
    };
  } catch {
    // Funktion gar nicht erreichbar (lokal/offline/404).
    return {
      year: fallback,
      source: "spotify",
      confidence: "low",
      reason: isrc ? "server_unreachable" : "no_isrc",
    };
  }
}
