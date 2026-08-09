import { useEffect, useRef, useState } from "react";
import {
  getCurrentlyPlaying,
  getQueue,
  pausePlayback,
  pickBestDeviceId,
  playTrack,
  searchAmbientUri,
  skipNext,
  startPlaylist,
  type TrackInfo,
} from "../spotify/api";
import { supabaseConfigured } from "../lib/supabase";
import { burnSong, loadBlacklist } from "../lib/groups";
import { loadKnownTracks, recordTracks } from "../lib/tracks";
import { resolveYear, type YearResult } from "../lib/year";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Stiller Pausen-Track (haelt beim Loesen die Verbindung). Suche als Notnagel.
const AMBIENT_ID = "3ccQUpgvYqmgblII6yzyDM";
const AMBIENT_URI = `spotify:track:${AMBIENT_ID}`;

function isDeviceError(m: string): boolean {
  const s = m.toLowerCase();
  return (
    s.includes("gerät") ||
    s.includes("device") ||
    s.includes("eingeschlafen") ||
    s.includes("no active")
  );
}

export function Game({
  playlistId,
  playlistName,
  spielrundeId,
  onChangePlaylist,
  onEnd,
}: {
  playlistId: string;
  playlistName: string;
  spielrundeId: string | null;
  onChangePlaylist: () => void;
  onEnd: () => void;
}) {
  const [phase, setPhase] = useState<"idle" | "playing" | "meta" | "year">(
    "idle"
  );
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [current, setCurrent] = useState<TrackInfo | null>(null);
  const [yearInfo, setYearInfo] = useState<YearResult | null>(null);
  const [played, setPlayed] = useState<Set<string>>(new Set());
  const [round, setRound] = useState(0);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  // Bekannte Titel der Playlist (ueber die Warteschlange angelernt).
  const knownRef = useRef<Map<string, TrackInfo>>(new Map());

  useEffect(() => {
    (async () => {
      if (spielrundeId) {
        try {
          const ids = await loadBlacklist(spielrundeId);
          if (ids.length) setPlayed(new Set(ids));
        } catch {
          /* ohne Sperrliste weiter */
        }
      }
      try {
        const kt = await loadKnownTracks(playlistId);
        kt.forEach((t) => knownRef.current.set(t.id, t));
      } catch {
        /* ohne Vorwissen weiter */
      }
    })();
  }, [spielrundeId, playlistId]);

  // Nur die KOMMENDEN Playlist-Titel merken (nicht den gerade laufenden – der
  // koennte noch der Begruessungssong sein). Spielt nichts ab.
  async function learnFromQueue(): Promise<void> {
    try {
      const q = await getQueue();
      const fresh: TrackInfo[] = [];
      q.upcoming.forEach((t) => {
        if (t.id === AMBIENT_ID) return;
        if (!knownRef.current.has(t.id)) {
          knownRef.current.set(t.id, t);
          fresh.push(t);
        }
      });
      if (fresh.length && supabaseConfigured) {
        recordTracks(playlistId, fresh).catch(() => {});
      }
    } catch {
      /* Warteschlange nicht verfuegbar */
    }
  }

  // Einen bekannten, noch nicht gesperrten Titel zufaellig waehlen.
  function pickCandidate(): TrackInfo | null {
    const cands: TrackInfo[] = [];
    knownRef.current.forEach((t) => {
      if (t.id !== AMBIENT_ID && !played.has(t.id)) cands.push(t);
    });
    if (!cands.length) return null;
    return cands[Math.floor(Math.random() * cands.length)];
  }

  function lockRound(info: TrackInfo) {
    setCurrent(info);
    setPlayed((p) => new Set(p).add(info.id));
    if (spielrundeId) {
      burnSong(spielrundeId, info.id, info.title, info.artist).catch(() => {});
    }
    if (supabaseConfigured && info.uri) {
      recordTracks(playlistId, [info]).catch(() => {});
    }
    // Jahr im Hintergrund waehrend des Abspielens aufloesen, damit es beim
    // "Loesen" schon feststeht (MusicBrainz, danach aus dem Cache sofort).
    setYearInfo(null);
    resolveYear(info)
      .then((r) => setYearInfo(r))
      .catch(() => {});
    setRound((r) => r + 1);
    setPhase("playing");
  }

  // Notnagel: alte Methode – zufaellig starten und gesperrte Songs ueberspringen.
  async function skipFallback(dev: string): Promise<boolean> {
    let lastSkipped: string | null = null;
    for (let i = 0; i < 25; i++) {
      await sleep(350);
      const np = await getCurrentlyPlaying();
      const id = np?.id;
      if (!id || id === AMBIENT_ID || id === lastSkipped) continue;
      if (!played.has(id)) {
        lockRound({
          id,
          uri: "",
          title: np!.name,
          artist: np!.artists.join(", "),
          year: np!.year,
          isrc: np!.isrc,
        });
        return true;
      }
      lastSkipped = id;
      await skipNext(dev);
    }
    return false;
  }

  // Warten, bis nach dem Kontext-Start wirklich ein NEUER Titel laeuft
  // (nicht mehr der Begruessungssong).
  async function waitForContextTrack(prevId: string | null) {
    for (let i = 0; i < 12; i++) {
      await sleep(350);
      const np = await getCurrentlyPlaying();
      if (np?.id && np.id !== prevId && np.id !== AMBIENT_ID) return np;
    }
    return await getCurrentlyPlaying();
  }

  async function playRound() {
    setMsg("");
    setBusy(true);
    try {
      // 1. Geraet sicherstellen – OHNE etwas abzuspielen.
      let dev = deviceId;
      if (!dev) {
        dev = await pickBestDeviceId();
        if (!dev) {
          throw new Error(
            "Kein Spotify-Gerät gefunden. Starte in der Spotify-App auf dem iPhone kurz einen Song und lass ihn laufen."
          );
        }
        setDeviceId(dev);
      }

      // 2. Bekannten, freien Titel direkt spielen (kein Anspielen, kein Umspringen).
      let cand = pickCandidate();

      // 3. Noch nichts bekannt (erste Begegnung mit der Playlist) -> Kontext
      //    anspielen und die Warteschlange lernen.
      if (!cand) {
        const prevId = (await getCurrentlyPlaying())?.id ?? null; // ggf. Begruessungssong
        dev = await startPlaylist(playlistId);
        setDeviceId(dev);
        const np = await waitForContextTrack(prevId);
        await learnFromQueue();
        if (np?.id && np.id !== AMBIENT_ID && !played.has(np.id)) {
          lockRound({
            id: np.id,
            uri: "",
            title: np.name,
            artist: np.artists.join(", "),
            year: np.year,
            isrc: np.isrc,
          });
          return;
        }
        cand = pickCandidate();
      }

      if (cand) {
        await playTrack(cand.uri, dev);
        lockRound(cand);
        return;
      }

      // Letzter Notnagel: alte Skip-Methode.
      if (!(await skipFallback(dev))) {
        setMsg("Alle Songs dieser Playlist wurden gespielt. 🎉");
        setPhase("idle");
      }
    } catch (e) {
      const m = (e as Error).message;
      if (isDeviceError(m)) {
        setDeviceId(null);
        setPhase("idle");
        setMsg(
          "Spotify ist eingeschlafen 😴 Kurz die Stimmung heben: Öffne die Spotify-App, starte einen Song und lass ihn laufen – dann hier wieder „Song abspielen“. Wir starten neu."
        );
      } else {
        setMsg(m);
      }
    } finally {
      setBusy(false);
    }
  }

  async function reveal() {
    setBusy(true);
    setMsg("");
    try {
      setPhase("meta");
      // Stiller Track: haelt die Verbindung waehrend der Ratepause.
      if (deviceId) {
        try {
          await playTrack(AMBIENT_URI, deviceId);
        } catch {
          try {
            const uri = await searchAmbientUri();
            if (uri) await playTrack(uri, deviceId);
          } catch {
            /* Song laeuft weiter */
          }
        }
      }
    } finally {
      setBusy(false);
    }
  }

  async function endGame() {
    try {
      if (deviceId) await pausePlayback(deviceId);
    } catch {
      /* egal */
    }
    onEnd();
  }

  const deviceLost = isDeviceError(msg);

  // Kennzeichnung, woher das angezeigte Jahr stammt (inkl. Grund bei Spotify).
  function badgeFor(y: YearResult | null): { text: string; cls: string } {
    if (!y) return { text: "Jahr wird noch geprüft …", cls: "low" };
    if (y.source === "musicbrainz") {
      return {
        text:
          y.confidence === "high"
            ? "Erstveröffentlichung · MusicBrainz"
            : "Aufnahmejahr · MusicBrainz",
        cls: "ok",
      };
    }
    const why: Record<string, string> = {
      no_isrc: "Aus Spotify · keine ISRC",
      mb_notfound: "Aus Spotify · bei MusicBrainz nicht gefunden",
      mb_error: "Aus Spotify · MusicBrainz-Fehler",
      server_unreachable: "Aus Spotify · Server nicht erreicht",
    };
    return { text: why[y.reason] ?? "Jahr vorläufig aus Spotify", cls: "low" };
  }
  const yearBadge = badgeFor(yearInfo);

  return (
    <div className="stack">
      {deviceLost && (
        <div className="alert stack">
          <button
            className="secondary"
            onClick={() => {
              window.location.href = "spotify:";
            }}
          >
            Spotify öffnen
          </button>
          <p>{msg}</p>
        </div>
      )}

      <div className={"game-stage" + (deviceLost ? " compact" : "")}>
        {phase === "idle" && (
          <button className="start-tile" disabled={busy} onClick={playRound}>
            <span className="start-tile-eq">
              <i />
              <i />
              <i />
            </span>
            <span className="start-tile-title">
              {busy ? "…" : "Los geht’s"}
            </span>
            <span className="start-tile-sub">Ersten Song starten</span>
          </button>
        )}

        {phase === "playing" && (
          <div className="playing-hero">
            <div className="eq">
              <span />
              <span />
              <span />
              <span />
              <span />
            </div>
            <p className="question">
              Ein Song läuft 🎧
              <br />
              Aus welchem <span>Jahr</span> ist er?
            </p>
            <button className="big-solve" disabled={busy} onClick={reveal}>
              {busy ? "…" : "Lösen"}
            </button>
          </div>
        )}

        {(phase === "meta" || phase === "year") && current && (
          <div className="reveal-card">
            <div className="lbl">Titel</div>
            <div className="reveal-title">{current.title}</div>
            <div className="lbl">Interpret</div>
            <div className="reveal-artist">{current.artist}</div>

            <div className="lbl">Erschienen</div>
            <div className="reveal-year">
              {phase === "year"
                ? (yearInfo?.year ?? current.year ?? "—")
                : "?"}
            </div>
            <span
              className={"badge " + yearBadge.cls}
              style={{ visibility: phase === "year" ? "visible" : "hidden" }}
            >
              {yearBadge.text}
            </span>

            {phase === "meta" ? (
              <button disabled={busy} onClick={() => setPhase("year")}>
                Jahr zeigen
              </button>
            ) : (
              <button disabled={busy} onClick={playRound}>
                {busy ? "…" : "Nächste Runde"}
              </button>
            )}
          </div>
        )}
      </div>

      {msg && !deviceLost && (
        <div className="panel">
          <p className="muted">{msg}</p>
        </div>
      )}

      {!deviceLost && (
        <>
          <button className="end-btn" onClick={endGame}>
            <span aria-hidden="true">⏹</span> Spiel beenden
          </button>
          <div className="footer-meta">
            <span>
              {playlistName} · Runde {round}
            </span>
            <button className="linklike" onClick={onChangePlaylist}>
              Andere Playlist
            </button>
          </div>
        </>
      )}
    </div>
  );
}
