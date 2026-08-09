import { useEffect, useRef, useState } from "react";
import {
  getCurrentlyPlaying,
  getQueue,
  pausePlayback,
  playTrack,
  playTrackInContext,
  searchAmbientUri,
  skipNext,
  startPlaylist,
  type TrackInfo,
} from "../spotify/api";
import { supabaseConfigured } from "../lib/supabase";
import { burnSong, loadBlacklist } from "../lib/groups";
import { loadKnownTracks, recordTracks } from "../lib/tracks";

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

  // Warteschlange lesen und neue Titel merken (spielt nichts ab).
  async function learnFromQueue(): Promise<{ current: TrackInfo | null }> {
    try {
      const q = await getQueue();
      const fresh: TrackInfo[] = [];
      const add = (t: TrackInfo | null) => {
        if (!t || t.id === AMBIENT_ID) return;
        if (!knownRef.current.has(t.id)) {
          knownRef.current.set(t.id, t);
          fresh.push(t);
        }
      };
      add(q.current);
      q.upcoming.forEach(add);
      if (fresh.length && supabaseConfigured) {
        recordTracks(playlistId, fresh).catch(() => {});
      }
      return { current: q.current };
    } catch {
      return { current: null }; // Warteschlange nicht verfuegbar
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
    setRound((r) => r + 1);
    setPhase("playing");
    learnFromQueue().catch(() => {}); // im Hintergrund weiterlernen
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
        });
        return true;
      }
      lastSkipped = id;
      await skipNext(dev);
    }
    return false;
  }

  async function playRound() {
    setMsg("");
    setBusy(true);
    try {
      let dev = deviceId;

      // Erststart: Kontext anspielen (kurzer Anlern-Moment) und Queue lesen.
      if (!dev) {
        dev = await startPlaylist(playlistId);
        setDeviceId(dev);
        const boot = await learnFromQueue();
        if (boot.current && !played.has(boot.current.id)) {
          lockRound(boot.current); // Anlern-Song ist frei -> direkt nehmen
          return;
        }
      }

      // Bekannten freien Titel gezielt spielen (kein Ueberspringen).
      let cand = pickCandidate();

      // Nichts Freies bekannt? -> Kontext anspielen, dazulernen, nochmal.
      if (!cand) {
        await startPlaylist(playlistId);
        const boot = await learnFromQueue();
        if (boot.current && !played.has(boot.current.id)) {
          lockRound(boot.current);
          return;
        }
        cand = pickCandidate();
      }

      if (cand) {
        await playTrackInContext(playlistId, cand.uri, dev);
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

  return (
    <div className="stack">
      <div className="game-stage">
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

            {phase === "meta" && (
              <button disabled={busy} onClick={() => setPhase("year")}>
                Jahr zeigen
              </button>
            )}

            {phase === "year" && (
              <>
                <div className="lbl">Erschienen</div>
                <div className="reveal-year">{current.year ?? "—"}</div>
                <span className="badge low">
                  Jahr noch vorläufig aus Spotify
                </span>
                <button disabled={busy} onClick={playRound}>
                  {busy ? "…" : "Nächste Runde"}
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {msg && (
        <div className={deviceLost ? "alert stack" : "panel"}>
          <p className={deviceLost ? "" : "muted"}>{msg}</p>
          {deviceLost && (
            <button
              className="secondary"
              onClick={() => {
                window.location.href = "spotify:";
              }}
            >
              Spotify öffnen
            </button>
          )}
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
