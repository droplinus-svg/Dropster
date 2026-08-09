// Netlify Function: loest das Erscheinungsjahr EINES Tracks ueber MusicBrainz
// auf und legt das Ergebnis im geteilten Supabase-Cache ab. Wird beim "Loesen"
// im Spiel aufgerufen (pro Song genau einmal – danach kommt es aus dem Cache).
//
// Regel: Angezeigt wird das Jahr, in dem DIESER Interpret DIESEN Song zuerst
// veroeffentlicht hat.
//   - gleicher Interpret (Neuaufnahme/Remaster) -> Erstveroeffentlichung durch ihn
//   - anderer Interpret (Cover)                 -> Erstveroeffentlichung dieser Version
//
// WICHTIG: Wir sprechen Supabase hier per REST (fetch) an, NICHT ueber
// @supabase/supabase-js. Die JS-Bibliothek zieht serverseitig eine
// WebSocket-Komponente nach, die unter Node < 22 abstuerzt
// ("native WebSocket not found"). Reines fetch vermeidet das komplett.
//
// MusicBrainz erlaubt ~1 Anfrage/Sekunde und verlangt einen aussagekraeftigen
// User-Agent. Pro Track fallen max. 2 Anfragen an.

const MB = "https://musicbrainz.org/ws/2";
const UA = `Dropster/0.1 ( ${process.env.MUSICBRAINZ_CONTACT ?? "unknown"} )`;

const SUPA_URL = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL;
const SUPA_KEY =
  process.env.VITE_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const yearOf = (d?: string | null): number | null =>
  d && d.length >= 4 ? parseInt(d.slice(0, 4), 10) : null;

// ---------- Supabase per REST (kein WebSocket) ----------
function supaHeaders(): Record<string, string> {
  return {
    apikey: SUPA_KEY!,
    Authorization: `Bearer ${SUPA_KEY}`,
    "Content-Type": "application/json",
  };
}

async function cacheRead(trackId: string): Promise<{
  resolved_year: number | null;
  source: string | null;
  confidence: string | null;
} | null> {
  if (!SUPA_URL || !SUPA_KEY) return null;
  const url =
    `${SUPA_URL}/rest/v1/year_cache` +
    `?select=resolved_year,source,confidence&track_id=eq.${encodeURIComponent(
      trackId
    )}&limit=1`;
  const res = await fetch(url, { headers: supaHeaders() });
  if (!res.ok) return null;
  const rows = (await res.json()) as any[];
  return rows?.[0] ?? null;
}

async function cacheWrite(row: Record<string, unknown>): Promise<void> {
  if (!SUPA_URL || !SUPA_KEY) return;
  // Upsert per PostgREST: Prefer merge-duplicates loest den Primary-Key-Konflikt.
  await fetch(`${SUPA_URL}/rest/v1/year_cache`, {
    method: "POST",
    headers: {
      ...supaHeaders(),
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify([row]),
  }).catch(() => {});
}

// ---------- MusicBrainz ----------
// Liefert JSON, null bei 404 (ISRC/Work unbekannt), wirft sonst mit Detail.
// Bei 503 ("server busy") oder 429 (Rate-Limit) wird mit kurzer Pause
// automatisch erneut versucht – das faengt die haeufigen, kurzlebigen
// Ueberlastungen von MusicBrainz ab, ohne dass der Spieler etwas merkt.
async function mb(path: string, tries = 0): Promise<any> {
  const res = await fetch(`${MB}${path}`, {
    headers: { "User-Agent": UA, Accept: "application/json" },
  });
  if (res.status === 404) return null;
  if ((res.status === 503 || res.status === 429) && tries < 3) {
    await sleep(1200 * (tries + 1)); // 1,2s / 2,4s / 3,6s
    return mb(path, tries + 1);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`MusicBrainz ${res.status} ${body.slice(0, 120)}`.trim());
  }
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
    const sameArtist = (w?.recordings ?? []).filter((r: any) =>
      (r["artist-credit"] ?? []).some((ac: any) => ac.artist?.id === artistMbid)
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

interface InTrack {
  trackId: string;
  isrc: string | null;
  title: string;
  artist: string;
  fallbackYear: number | null;
}

export async function handler(event: { body: string | null }) {
  try {
    const t = JSON.parse(event.body ?? "{}") as Partial<InTrack>;
    if (!t.trackId) return { statusCode: 400, body: "trackId erwartet" };

    // 1) Cache? – aber NUR echten MusicBrainz-Treffern vertrauen. Alte
    //    Spotify-Fallbacks duerfen einen erneuten MusicBrainz-Versuch nicht
    //    blockieren.
    const hit = await cacheRead(t.trackId).catch(() => null);
    if (hit && hit.resolved_year != null && hit.source === "musicbrainz") {
      return json({
        year: hit.resolved_year,
        source: hit.source,
        confidence: hit.confidence,
        reason: "mb_hit",
        cached: true,
      });
    }

    // 2) Ohne ISRC ist MusicBrainz nicht befragbar.
    if (!t.isrc) {
      return json({
        year: t.fallbackYear ?? null,
        source: "spotify_fallback",
        confidence: "low",
        reason: "no_isrc",
      });
    }

    // 3) MusicBrainz befragen.
    let resolved: Resolved | null = null;
    let mbErr: string | null = null;
    try {
      resolved = await resolveByIsrc(t.isrc);
    } catch (e) {
      mbErr = (e as Error).message;
    }

    // 3a) Kein Treffer -> Spotify-Fallback, aber NICHT cachen (wiederholbar).
    if (!resolved || resolved.year == null) {
      return json({
        year: t.fallbackYear ?? null,
        source: "spotify_fallback",
        confidence: "low",
        reason: mbErr ? "mb_error" : "mb_notfound",
        debug: mbErr ?? undefined,
      });
    }

    // 3b) Echter MusicBrainz-Treffer -> dauerhaft cachen.
    await cacheWrite({
      track_id: t.trackId,
      isrc: t.isrc ?? null,
      title: t.title ?? null,
      artist: t.artist ?? null,
      artist_mbid: resolved.artistMbid,
      resolved_year: resolved.year,
      source: resolved.source,
      confidence: resolved.confidence,
      updated_at: new Date().toISOString(),
    });

    return json({
      year: resolved.year,
      source: resolved.source,
      confidence: resolved.confidence,
      reason: "mb_hit",
      cached: false,
    });
  } catch (e) {
    // Auch bei einem internen Fehler mit 200 + Grund antworten, damit das
    // Frontend die konkrete Ursache anzeigen kann (statt nur "500").
    return json({
      year: null,
      source: "spotify_fallback",
      confidence: "low",
      reason: "function_error",
      debug: (e as Error).message,
    });
  }
}

function json(obj: unknown) {
  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(obj),
  };
}
