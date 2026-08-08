import { useEffect, useState } from "react";
import { getMyPlaylists, type SpotifyPlaylist } from "../spotify/api";

// Playlist-Auswahl: der Spielleiter waehlt am Anfang die Playlist.
export function PlaylistSelect({
  onPick,
  onLogout,
}: {
  onPick: (pl: SpotifyPlaylist) => void;
  onLogout: () => void;
}) {
  const [playlists, setPlaylists] = useState<SpotifyPlaylist[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    (async () => {
      try {
        setPlaylists(await getMyPlaylists());
      } catch (e) {
        setMsg((e as Error).message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div className="stack">
      <div className="panel stack">
        <strong>Playlist wählen</strong>
        <p className="muted">Aus welcher Playlist soll geraten werden?</p>
        {loading && <p className="muted">Lade Playlists …</p>}
        {msg && <p className="muted">{msg}</p>}
        <div className="stack">
          {playlists.map((pl) => (
            <button
              key={pl.id}
              className="secondary"
              onClick={() => onPick(pl)}
            >
              {pl.name} · {pl.tracks.total} Songs
            </button>
          ))}
        </div>
      </div>
      <button className="secondary" onClick={onLogout}>
        Abmelden
      </button>
    </div>
  );
}
