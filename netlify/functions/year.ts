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

// Hartes Gesamt-Zeitbudget der Funktion. Netlify bricht Funktionen nach ihrem
// Limit (Standard 10 s) mit "504 Inactivity Timeout" ab. Wir bleiben klar
// darunter und antworten notfalls VORHER mit dem Spotify-Jahr, statt in den
// 504 zu laufen. Ueber die Umgebungsvariable MB_BUDGET_MS anpassbar: Wer bei
// Netlify ein hoeheres Funktions-Limit hat (z. B. 26 s), kann hier z. B. 20000
// setzen und bekommt dadurch deutlich seltener "MusicBrainz zu langsam".
const BUDGET_MS = Math.max(
  4000,
  parseInt(process.env.MB_BUDGET_MS ?? "9000", 10) || 9000
);

// fetch mit hartem Timeout, damit eine einzelne haengende Anfrage nicht das
// ganze Budget frisst.
async function fetchTimeout(
  url: string,
  opts: RequestInit,
  ms: number
): Promise<Response> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), Math.max(500, ms));
  try {
    return await fetch(url, { ...opts, signal: ac.signal });
  } finally {
    clearTimeout(t);
  }
}

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
  const res = await fetchTimeout(url, { headers: supaHeaders() }, 2500);
  if (!res.ok) return null;
  const rows = (await res.json()) as any[];
  return rows?.[0] ?? null;
}

async function cacheWrite(row: Record<string, unknown>): Promise<void> {
  if (!SUPA_URL || !SUPA_KEY) return;
  // Upsert per PostgREST: Prefer merge-duplicates loest den Primary-Key-Konflikt.
  await fetchTimeout(
    `${SUPA_URL}/rest/v1/year_cache`,
    {
      method: "POST",
      headers: {
        ...supaHeaders(),
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify([row]),
    },
    2500
  ).catch(() => {});
}

// ---------- MusicBrainz ----------
// Liefert JSON, null bei 404 (ISRC/Work unbekannt), wirft sonst mit Detail.
// Bei 503 ("server busy") oder 429 (Rate-Limit) wird mit kurzer Pause
// automatisch erneut versucht – das faengt die haeufigen, kurzlebigen
// Ueberlastungen von MusicBrainz ab, ohne dass der Spieler etwas merkt.
async function mb(path: string, deadline: number, tries = 0): Promise<any> {
  // Kein Budget mehr -> gar nicht erst anfragen.
  if (Date.now() >= deadline) throw new Error("Zeitbudget erschöpft");
  const remaining = deadline - Date.now();
  let res: Response;
  try {
    res = await fetchTimeout(
      `${MB}${path}`,
      { headers: { "User-Agent": UA, Accept: "application/json" } },
      Math.min(5000, remaining)
    );
  } catch {
    // Abbruch durch unseren Timeout ("operation aborted") -> wie eine
    // Ueberlastung behandeln: kurz erneut versuchen, wenn noch Budget da ist.
    if (tries < 2 && deadline - Date.now() > 1500) {
      await sleep(400);
      return mb(path, deadline, tries + 1);
    }
    throw new Error("MusicBrainz zu langsam (Zeitüberschreitung)");
  }
  if (res.status === 404) return null;
  if (res.status === 503 || res.status === 429) {
    // Nur erneut versuchen, wenn noch genug Zeit ist (kurze feste Pause).
    if (tries < 2 && deadline - Date.now() > 1500) {
      await sleep(700);
      return mb(path, deadline, tries + 1);
    }
    throw new Error(`MusicBrainz ${res.status} (überlastet)`);
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
  // provisorisch: Wir hatten ein Work, konnten die genaue "fruehestes Release"-
  // Abfrage aber (noch) nicht sicher auswerten -> das Jahr koennte ein
  // Remaster-/Aufnahmedatum sein. Solche Ergebnisse werden NICHT gecacht,
  // damit ein spaeterer Versuch das echte Erstveroeffentlichungsjahr liefert.
  partial?: boolean;
}

async function resolveByIsrc(
  isrc: string,
  deadline: number
): Promise<Resolved | null> {
  // 1) ISRC -> Recording(s) inkl. Artist-Credit und Work-Beziehung.
  const data = await mb(
    `/isrc/${encodeURIComponent(isrc)}?inc=artist-credits+work-rels&fmt=json`,
    deadline
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

  // Fall A: Der Song ist einer Komposition (Work) zugeordnet – typisch fuer
  // Originale UND Remaster/Neuaufnahmen. Nur ueber das Work bekommen wir das
  // ECHTE Erstveroeffentlichungsjahr durch diesen Interpreten.
  if (workMbid && artistMbid) {
    // Genaue Abfrage nur, wenn das Zeitbudget reicht (zweite MB-Anfrage +
    // 1s Rate-Limit-Pause).
    if (deadline - Date.now() > 2500) {
      await sleep(1000);
      const w = await mb(
        `/recording?work=${workMbid}&inc=artist-credits&limit=100&fmt=json`,
        deadline
      );
      const sameArtist = (w?.recordings ?? []).filter((r: any) =>
        (r["artist-credit"] ?? []).some(
          (ac: any) => ac.artist?.id === artistMbid
        )
      );
      const years = sameArtist
        .map((r: any) => yearOf(r["first-release-date"]))
        .filter((y: number | null): y is number => y != null);
      if (years.length) {
        // ECHTES Erstveroeffentlichungsjahr durch diesen Interpreten.
        return {
          year: Math.min(...years),
          source: "musicbrainz",
          confidence: "high",
          artistMbid,
        };
      }
    }
    // Konnten die genaue Abfrage nicht (sicher) auswerten -> Aufnahmedatum als
    // VORLAEUFIGES Ergebnis. Wird nicht gecacht, damit spaeter das echte
    // Erstveroeffentlichungsjahr nachgeliefert werden kann.
    if (recDate) {
      return {
        year: recDate,
        source: "musicbrainz",
        confidence: "medium",
        artistMbid,
        partial: true,
      };
    }
    return null;
  }

  // Fall B: Kein Work hinterlegt (echtes Einzelrecording / mancher Cover) ->
  // das Aufnahmedatum IST hier die beste Antwort und darf gecacht werden.
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

    // 1) Cache? – aber NUR gesicherten MusicBrainz-Treffern (confidence "high"
    //    = ueber das Work bestaetigtes Erstveroeffentlichungsjahr) vertrauen.
    //    So blockieren weder alte Spotify-Fallbacks noch vorlaeufige
    //    Aufnahme-/Remaster-Daten einen erneuten, genaueren Versuch.
    const hit = await cacheRead(t.trackId).catch(() => null);
    if (
      hit &&
      hit.resolved_year != null &&
      hit.source === "musicbrainz" &&
      hit.confidence === "high"
    ) {
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

    // 3) MusicBrainz befragen – mit hartem Zeitbudget, damit wir NIE in
    //    Netlifys 504-Timeout laufen.
    const deadline = Date.now() + BUDGET_MS;
    let resolved: Resolved | null = null;
    let mbErr: string | null = null;
    try {
      resolved = await resolveByIsrc(t.isrc, deadline);
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

    // 3b) NUR gesicherte Treffer (confidence "high", ueber das Work bestaetigt)
    //     dauerhaft cachen. Vorlaeufige Aufnahme-/Remaster-Daten (partial) NICHT
    //     cachen – sonst blockieren sie fuer immer das echte
    //     Erstveroeffentlichungsjahr.
    if (resolved.confidence === "high" && !resolved.partial) {
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
    }

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
