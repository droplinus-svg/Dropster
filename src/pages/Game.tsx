import { useState } from "react";
import {
  getCurrentlyPlaying,
  getPlaybackVolume,
  setVolume,
  skipNext,
  startPlaylist,
  type NowPlaying,
} from "../spotify/api";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
// TEST: leise weiterlaufen lassen (statt stumm/pausieren), um die Verbindung
// zu halten. Wenn das hilft, koennen wir den Wert spaeter feinjustieren.
const REVEAL_VOLUME = 10;

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
  onChangePlaylist,
}: {
  playlistId: string;
  playlistName: string;
  onChangePlaylist: () => void;
}) {
  const [phase, setPhase] = useState<"idle" | "playing" | "meta" | "year">(
    "idle"
  );
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [current, setCurrent] = useState<NowPlaying | null>(null);
  const [played, setPlayed] = useState<Set<string>>(new Set());
  const [savedVol, setSavedVol] = useState<number | null>(null);
  const [round, setRound] = useState(0);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  // Nach Start/Skip sicherstellen, dass ein noch nicht gespielter Song laeuft.
  async function avoidRepeat(dev: string) {
    for (let i = 0; i < 15; i++) {
      await sleep(600);
      const np = await getCurrentlyPlaying();
      const id = np?.id;
      if (!id) continue;
      if (!played.has(id)) {
        setPlayed((p) => new Set(p).add(id));
        return;
      }
      await skipNext(dev);
    }
  }

  async function playRound() {
    setMsg("");
    setBusy(true);
    try {
      let dev = deviceId;
      if (!dev) {
        dev = await startPlaylist(playlistId);
        setDeviceId(dev);
      } else {
        await skipNext(dev);
      }
      // Lautstaerke wieder hoch (nach dem stummen "Loesen").
      if (savedVol != null) {
        try {
          await setVolume(savedVol, dev);
        } catch {
          /* egal */
        }
      }
      await avoidRepeat(dev);
      setRound((r) => r + 1);
      setPhase("playing");
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
      const np = await getCurrentlyPlaying();
      if (!np) {
        setMsg(
          "Konnte den laufenden Song nicht lesen. Läuft in Spotify gerade wirklich etwas?"
        );
        return;
      }
      setCurrent(np);
      setPhase("meta");
      // Statt Pause: stummschalten – so bleibt die Spotify-App aktiv und die
      // Verbindung reißt in der Ratephase nicht ab.
      if (deviceId) {
        try {
          const v = await getPlaybackVolume();
          setSavedVol(v && v > 0 ? v : 70);
          // TEST: leise weiterlaufen lassen statt stumm/pausieren.
          await setVolume(REVEAL_VOLUME, deviceId);
        } catch {
          setMsg(
            "Hinweis (Test): Lautstärke ließ sich nicht senken – der Song läuft normal weiter."
          );
        }
      }
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const deviceLost = isDeviceError(msg);

  return (
    <div className="stack">
      <div className="game-stage">
        {phase === "idle" && (
          <button className="big-play" disabled={busy} onClick={playRound}>
            {busy ? "…" : "Song abspielen"}
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
            <div className="reveal-title">{current.name}</div>
            <div className="lbl">Interpret</div>
            <div className="reveal-artist">{current.artists.join(", ")}</div>

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
        <div className="footer-meta">
          <span>
            {playlistName} · Runde {round}
          </span>
          <button className="linklike" onClick={onChangePlaylist}>
            Andere Playlist
          </button>
        </div>
      )}
    </div>
  );
}
