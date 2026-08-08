import { useEffect, useState } from "react";
import { handleCallback, isLoggedIn, logout } from "./spotify/auth";
import {
  getPlaylistTracks,
  type SpotifyPlaylist,
  type Track,
} from "./spotify/api";
import { Login } from "./pages/Login";
import { Welcome } from "./pages/Welcome";
import { PlaylistSelect } from "./pages/PlaylistSelect";
import { Game } from "./pages/Game";

type Screen =
  | "loading"
  | "login"
  | "welcome"
  | "playlists"
  | "loadingTracks"
  | "game";

export function App() {
  const [screen, setScreen] = useState<Screen>("loading");
  const [error, setError] = useState<string | null>(null);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [playlistName, setPlaylistName] = useState("");

  useEffect(() => {
    (async () => {
      try {
        // OAuth-Callback? Code aus der URL gegen ein Token tauschen.
        const params = new URLSearchParams(window.location.search);
        const code = params.get("code");
        if (code) {
          await handleCallback(code);
          window.history.replaceState({}, "", window.location.pathname);
        }
        setScreen(isLoggedIn() ? "welcome" : "login");
      } catch (e) {
        setError((e as Error).message);
        setScreen("login");
      }
    })();
  }, []);

  async function pickPlaylist(pl: SpotifyPlaylist) {
    setScreen("loadingTracks");
    setError(null);
    try {
      const t = await getPlaylistTracks(pl.id);
      const usable = t.filter((x) => x.uri);
      if (usable.length === 0) {
        setError("Diese Playlist enthält keine abspielbaren Songs.");
        setScreen("playlists");
        return;
      }
      setTracks(usable);
      setPlaylistName(pl.name);
      setScreen("game");
    } catch (e) {
      setError((e as Error).message);
      setScreen("playlists");
    }
  }

  return (
    <div className="app">
      {screen !== "login" && screen !== "loading" && (
        <header className="topbar">
          <img
            src="/logo.png"
            className="header-logo"
            alt="Dropster – Name that Track"
          />
        </header>
      )}

      {error && (
        <div className="panel">
          <p className="muted">Hinweis: {error}</p>
        </div>
      )}

      {screen === "loading" && <p className="muted">Lade …</p>}
      {screen === "login" && <Login />}
      {screen === "welcome" && (
        <Welcome onReady={() => setScreen("playlists")} />
      )}
      {screen === "playlists" && (
        <PlaylistSelect
          onPick={pickPlaylist}
          onLogout={() => {
            logout();
            setScreen("login");
          }}
        />
      )}
      {screen === "loadingTracks" && (
        <p className="muted">Playlist wird geladen …</p>
      )}
      {screen === "game" && (
        <Game
          tracks={tracks}
          playlistName={playlistName}
          onChangePlaylist={() => setScreen("playlists")}
        />
      )}
    </div>
  );
}
