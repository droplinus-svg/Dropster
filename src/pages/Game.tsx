import { useState } from "react";
import { pausePlayback, startTrack, type Track } from "../spotify/api";

// Geraet-/Verbindungsfehler (kein Track-Problem) von Track-Fehlern unterscheiden.
function isDeviceError(message: string): boolean {
  const s = message.toLowerCase();
  return s.includes("gerät") || s.includes("device") || s.includes("no active");
}

// Der Spielablauf: Song blind abspielen -> Loesen -> Jahr/Titel/Interpret zeigen.
export function Game({
  tracks,
  playlistName,
  onChangePlaylist,
}: {
  tracks: Track[];
  playlistName: string;
  onChangePlaylist: () => void;
}) {
  const [current, setCurrent] = useState<Track | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [played, setPlayed] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const remaining = tracks.filter((t) => !played.has(t.uri)).length;

  async function nextRound() {
    setMsg("");
    setRevealed(false);
    let pool = tracks.filter((t) => !played.has(t.uri));
    if (pool.length === 0) {
      setMsg("Alle Songs dieser Playlist wurden gespielt. 🎉");
      setCurrent(null);
      return;
    }
    setBusy(true);
    const skipped = new Set<string>();
    let lastErr = "";

    // Bis zu 8 Versuche: nicht abspielbare Songs (z. B. Region-Sperre) ueberspringen.
    for (let i = 0; i < 8 && pool.length > 0; i++) {
      const pick = pool[Math.floor(Math.random() * pool.length)];
      try {
        await startTrack(pick.uri);
        setCurrent(pick);
        setPlayed((prev) => new Set([...prev, ...skipped, pick.uri]));
        if (skipped.size > 0) {
          setMsg(`${skipped.size} nicht abspielbare Songs übersprungen.`);
        }
        setBusy(false);
        return;
      } catch (e) {
        const m = (e as Error).message;
        lastErr = m;
        if (isDeviceError(m)) {
          // Verbindungs-/Geraetefehler: nicht weiter-skippen, sondern melden.
          setCurrent(null);
          setMsg(m);
          setBusy(false);
          return;
        }
        skipped.add(pick.uri);
        pool = pool.filter((t) => t.uri !== pick.uri);
      }
    }

    setPlayed((prev) => new Set([...prev, ...skipped]));
    setCurrent(null);
    setMsg("Konnte keinen abspielbaren Song finden. " + lastErr);
    setBusy(false);
  }

  async function reveal() {
    setBusy(true);
    setMsg("");
    try {
      await pausePlayback();
      setRevealed(true);
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const year = current?.albumReleaseDate
    ? current.albumReleaseDate.slice(0, 4)
    : "—";

  return (
    <div className="stack">
      <div className="panel stack">
        <span className="badge">{playlistName}</span>
        <span className="muted">
          Noch {remaining} von {tracks.length} Songs
        </span>
      </div>

      {!current && (
        <button className="big-play" disabled={busy} onClick={nextRound}>
          {busy ? "…" : "Song abspielen"}
        </button>
      )}

      {current && !revealed && (
        <div className="panel stack">
          <p className="muted" style={{ textAlign: "center" }}>
            🎵 Ein Song läuft – aus welchem Jahr ist er?
          </p>
          <button disabled={busy} onClick={reveal}>
            {busy ? "…" : "Lösen"}
          </button>
        </div>
      )}

      {current && revealed && (
        <div className="panel stack">
          <div className="reveal-year">{year}</div>
          <div className="reveal-meta">
            <div className="reveal-title">{current.name}</div>
            <div className="reveal-artist">{current.artists.join(", ")}</div>
          </div>
          <span className="badge low">Jahr noch vorläufig aus Spotify</span>
          <button disabled={busy} onClick={nextRound}>
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
