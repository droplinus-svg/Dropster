import { useEffect, useState } from "react";
import { handleCallback, isLoggedIn, logout } from "./spotify/auth";
import { type SpotifyPlaylist } from "./spotify/api";
import { type Spielrunde } from "./lib/groups";
import { Login } from "./pages/Login";
import { Welcome } from "./pages/Welcome";
import { GroupSelect } from "./pages/GroupSelect";
import { PlaylistSelect } from "./pages/PlaylistSelect";
import { Game } from "./pages/Game";
import { Onboarding } from "./pages/Onboarding";

const ONBOARD_KEY = "dropster.onboarded";

type Screen =
  | "loading"
  | "login"
  | "welcome"
  | "groups"
  | "playlists"
  | "game";

export function App() {
  const [screen, setScreen] = useState<Screen>("loading");
  const [error, setError] = useState<string | null>(null);
  const [playlistId, setPlaylistId] = useState("");
  const [playlistName, setPlaylistName] = useState("");
  const [spielrunde, setSpielrunde] = useState<Spielrunde | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);

  // Beim allerersten Start die Einführung zeigen (einmalig pro Gerät).
  useEffect(() => {
    try {
      if (!localStorage.getItem(ONBOARD_KEY)) setShowOnboarding(true);
    } catch {
      /* localStorage nicht verfügbar – ohne Einführung weiter */
    }
  }, []);

  function closeOnboarding() {
    setShowOnboarding(false);
    try {
      localStorage.setItem(ONBOARD_KEY, "1");
    } catch {
      /* egal */
    }
  }

  useEffect(() => {
    (async () => {
      try {
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

  function pickPlaylist(pl: SpotifyPlaylist) {
    setError(null);
    setPlaylistId(pl.id);
    setPlaylistName(pl.name);
    setScreen("game");
  }

  return (
    <div className="app">
      {screen !== "loading" && (
        <button
          className="info-btn"
          aria-label="Einführung"
          onClick={() => setShowOnboarding(true)}
        >
          i
        </button>
      )}
      {showOnboarding && <Onboarding onClose={closeOnboarding} />}

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
        <Welcome onReady={() => setScreen("groups")} />
      )}
      {screen === "groups" && (
        <GroupSelect
          onPick={(r) => {
            setSpielrunde(r);
            setScreen("playlists");
          }}
          onLogout={() => {
            logout();
            setScreen("login");
          }}
        />
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
      {screen === "game" && (
        <Game
          playlistId={playlistId}
          playlistName={playlistName}
          spielrundeId={spielrunde?.id ?? null}
          onChangePlaylist={() => setScreen("playlists")}
          onEnd={() => setScreen("groups")}
        />
      )}
    </div>
  );
}
