// Netlify Function: loest Erscheinungsjahre ueber MusicBrainz auf und schreibt
// sie in den geteilten Supabase-Cache. Wird beim "Playlist vorbereiten" gerufen.
//
// Regel: Angezeigt wird das Jahr, in dem DIESER Interpret DIESEN Song zuerst
// veroeffentlicht hat.
//   - gleicher Interpret (Neuaufnahme/Remaster) -> Erstveroeffentlichung durch ihn
//   - anderer Interpret (Cover)                 -> Erstveroeffentlichung dieser Version
//
// MusicBrainz erlaubt ~1 Anfrage/Sekunde und verlangt einen aussagekraeftigen
// User-Agent. Deshalb sequenziell mit Drosselung.

import { createClient } from "@supabase/supabase-js";

const MB = "https://musicbrainz.org/ws/2";
const UA = `Dropster/0.1 ( ${process.env.MUSICBRAINZ_CONTACT ?? "unknown"} )`;

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

interface InTrack {
  isrc: string | null;
  title: string;
  artist: string;
  albumReleaseDate: string | null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const yearOf = (d?: string | null): number | null =>
  d && d.length >= 4 ? parseInt(d.slice(0, 4), 10) : null;

async function mb(path: string): Promise<any> {
  const res = await fetch(`${MB}${path}`, {
    headers: { "User-Agent": UA, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`MusicBrainz ${res.status}`);
  return res.json();
}

interface Resolved {
  year: number | null;
  source: "musicbrainz" | "spotify_fallback";
  confidence: "high" | "medium" | "low";
  artistMbid: string | null;
}

async function resolveByIsrc(isrc: string): Promise<Resolved | null> {
  // 1) ISRC -> Recording(s) inkl. Artist-Credit und Work-Beziehung.
  const data = await mb(
    `/isrc/${encodeURIComponent(isrc)}?inc=artist-credits+work-rels&fmt=json`
  );
  const rec = data?.recordings?.[0];
  if (!rec) return null;

  const artistMbid: string | null =
    rec["artist-credit"]?.[0]?.artist?.id ?? null;
  const workRel = (rec.relations ?? []).find(
    (r: any) => r["target-type"] === "work" && r.work?.id
  );
  const workMbid: string | null = workRel?.work?.id ?? null;
  const recDate = yearOf(rec["first-release-date"]);

  // 2a) Work vorhanden -> fruehestes Release DESSELBEN Interpreten fuer dieses Work.
  if (workMbid && artistMbid) {
    await sleep(1100);
    const w = await mb(
      `/recording?work=${workMbid}&inc=artist-credits&limit=100&fmt=json`
    );
    const sameArtist = (w.recordings ?? []).filter((r: any) =>
      (r["artist-credit"] ?? []).some(
        (ac: any) => ac.artist?.id === artistMbid
      )
    );
    const years = sameArtist
      .map((r: any) => yearOf(r["first-release-date"]))
      .filter((y: number | null): y is number => y != null);
    if (years.length) {
      return {
        year: Math.min(...years),
        source: "musicbrainz",
        confidence: "high",
        artistMbid,
      };
    }
  }

  // 2b) Kein Work / Cover -> Datum der konkreten Aufnahme.
  if (recDate) {
    return {
      year: recDate,
      source: "musicbrainz",
      confidence: "medium",
      artistMbid,
    };
  }
  return null;
}

async function enrichOne(t: InTrack): Promise<{
  isrc: string;
  year: number | null;
  source: string;
  confidence: string;
}> {
  const isrc = t.isrc!;
  let resolved: Resolved | null = null;
  try {
    resolved = await resolveByIsrc(isrc);
  } catch {
    resolved = null;
  }

  // Fallback: Spotify-Albumjahr (unsicher).
  if (!resolved || resolved.year == null) {
    resolved = {
      year: yearOf(t.albumReleaseDate),
      source: "spotify_fallback",
      confidence: "low",
      artistMbid: resolved?.artistMbid ?? null,
    };
  }

  await supabase.from("year_cache").upsert({
    isrc,
    title: t.title,
    artist: t.artist,
    artist_mbid: resolved.artistMbid,
    resolved_year: resolved.year,
    source: resolved.source,
    confidence: resolved.confidence,
    updated_at: new Date().toISOString(),
  });

  return {
    isrc,
    year: resolved.year,
    source: resolved.source,
    confidence: resolved.confidence,
  };
}

export async function handler(event: { body: string | null }) {
  try {
    const { tracks } = JSON.parse(event.body ?? "{}") as { tracks: InTrack[] };
    if (!Array.isArray(tracks)) {
      return { statusCode: 400, body: "tracks[] erwartet" };
    }

    // Nur Tracks mit ISRC, die noch nicht im Cache sind.
    const withIsrc = tracks.filter((t) => t.isrc);
    const isrcs = withIsrc.map((t) => t.isrc!);
    const { data: cached } = await supabase
      .from("year_cache")
      .select("isrc")
      .in("isrc", isrcs.length ? isrcs : ["__none__"]);
    const known = new Set((cached ?? []).map((r: any) => r.isrc));
    const todo = withIsrc.filter((t) => !known.has(t.isrc!));

    const results = [];
    for (const t of todo) {
      results.push(await enrichOne(t));
      await sleep(1100); // MusicBrainz Rate-Limit einhalten
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        processed: results.length,
        skippedCached: known.size,
        results,
      }),
    };
  } catch (e) {
    return { statusCode: 500, body: (e as Error).message };
  }
}
