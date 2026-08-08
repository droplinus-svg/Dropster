import { useState } from "react";
import {
  getCurrentlyPlaying,
  pausePlayback,
  skipNext,
  startPlaylist,
  type NowPlaying,
} from "../spotify/api";

// Spielablauf OHNE Titel-Auslesen: Playlist als Kontext mit Zufall starten,
// beim Loesen "was laeuft gerade?" abfragen, fuer die naechste Runde "weiter".
export function Game({
  playlistId,
  playlistName,
  onChangePlaylist,
}: {
  playlistId: string;
  playlistName: string;
  onChangePlaylist: () => void;
}) {
  const [phase, setPhase] = useState<"idle" | "playing" | "revealed">("idle");
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [current, setCurrent] = useState<NowPlaying | null>(null);
  const [round, setRound] = useState(0);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  // Startet die erste Runde (Playlist-Kontext) oder springt zur naechsten.
  async function playRound() {
    setMsg("");
    setCurrent(null);
    setBusy(true);
    try {
      if (!deviceId) {
        const id = await startPlaylist(playlistId);
        setDeviceId(id);
      } else {
        await skipNext(deviceId);
      }
      setRound((r) => r + 1);
      setPhase("playing");
    } catch (e) {
      setMsg((e as Error).message);
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
      setPhase("revealed");
      // Nach dem Auslesen anhalten.
      await pausePlayback(deviceId ?? undefined);
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <div className="panel stack">
        <span className="badge">{playlistName}</span>
        <span className="muted">Runde {round}</span>
      </div>

      {phase === "idle" && (
        <button className="big-play" disabled={busy} onClick={playRound}>
          {busy ? "…" : "Song abspielen"}
        </button>
      )}

      {phase === "playing" && (
        <div className="panel stack">
          <p className="muted" style={{ textAlign: "center" }}>
            🎵 Ein Song läuft – aus welchem Jahr ist er?
          </p>
          <button disabled={busy} onClick={reveal}>
            {busy ? "…" : "Lösen"}
          </button>
        </div>
      )}

      {phase === "revealed" && current && (
        <div className="panel stack">
          <div className="reveal-year">{current.year ?? "—"}</div>
          <div className="reveal-meta">
            <div className="reveal-title">{current.name}</div>
            <div className="reveal-artist">{current.artists.join(", ")}</div>
          </div>
          <span className="badge low">Jahr noch vorläufig aus Spotify</span>
          <button disabled={busy} onClick={playRound}>
            {busy ? "…" : "Nächste Runde"}
          </button>
        </div>
      )}

      {msg && (
        <div className="panel">
          <p className="muted">{msg}</p>
        </div>
      )}

      <button className="secondary" onClick={onChangePlaylist}>
        Andere Playlist
      </button>
    </div>
  );
}
