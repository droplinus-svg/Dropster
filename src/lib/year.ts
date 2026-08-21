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
  //    Eigener Timeout, damit der Client nicht ewig wartet, falls der Server
  //    doch einmal haengt. Die Funktion selbst antwortet in <= 8 s.
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 12000);
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
      signal: ac.signal,
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
    // Funktion antwortet, aber mit Fehlerstatus. 504 = Zeitueberschreitung des
    // Servers -> verstaendliche Kurzmeldung statt der rohen HTML-Fehlerseite.
    const body = await res.text().catch(() => "");
    const timeoutish =
      res.status === 504 ||
      res.status === 408 ||
      /inactivity timeout|timeout/i.test(body);
    return {
      year: fallback,
      source: "spotify",
      confidence: "low",
      reason: "function_error",
      debug: timeoutish
        ? "Zeitüberschreitung: MusicBrainz war zu langsam. Mit „Jahr erneut prüfen“ nochmal versuchen."
        : `HTTP ${res.status}: ${body.slice(0, 160)}`,
    };
  } catch {
    // Funktion nicht erreichbar oder eigener Timeout (abgebrochen).
    return {
      year: fallback,
      source: "spotify",
      confidence: "low",
      reason: isrc ? "server_unreachable" : "no_isrc",
    };
  } finally {
    clearTimeout(timer);
  }
}
