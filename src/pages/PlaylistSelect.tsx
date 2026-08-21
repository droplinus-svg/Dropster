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
        <strong>Deine Playlists</strong>
        <p className="muted">
          Das sind <strong>deine eigenen</strong> Spotify-Playlists – wähle eine,
          die zum Spielen passt. Tipp: eine <strong>bunt gemischte</strong> Liste
          über viele Jahrzehnte macht am meisten Spaß.
        </p>
        {loading && <p className="muted">Lade Playlists …</p>}
        {msg && <p className="muted">{msg}</p>}
        <div className="stack">
          {[...playlists]
            .sort((a, b) => a.name.localeCompare(b.name, "de"))
            .map((pl) => (
            <button
              key={pl.id}
              className="secondary"
              onClick={() => onPick(pl)}
            >
              {pl.name} · {pl.tracks?.total ?? "?"} Songs
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
