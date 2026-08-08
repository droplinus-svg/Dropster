import { useEffect, useState } from "react";
import { handleCallback, isLoggedIn } from "./spotify/auth";
import { Login } from "./pages/Login";
import { PlaybackTest } from "./pages/PlaybackTest";

type Status = "loading" | "loggedOut" | "loggedIn" | "error";

export function App() {
  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        // OAuth-Callback? Code aus der URL tauschen.
        const params = new URLSearchParams(window.location.search);
        const code = params.get("code");
        if (code) {
          await handleCallback(code);
          // Query-Parameter aus der URL entfernen.
          window.history.replaceState({}, "", window.location.pathname);
        }
        setStatus(isLoggedIn() ? "loggedIn" : "loggedOut");
      } catch (e) {
        setError((e as Error).message);
        setStatus("error");
      }
    })();
  }, []);

  return (
    <div className="app">
      <div className="brand">
        Drop<span>ster</span>
      </div>

      {status === "loading" && <p className="muted">Lade …</p>}
      {status === "error" && (
        <div className="panel">
          <p className="muted">Fehler: {error}</p>
          <button onClick={() => (window.location.href = "/")}>
            Neu starten
          </button>
        </div>
      )}
      {status === "loggedOut" && <Login />}
      {status === "loggedIn" && (
        <PlaybackTest onLoggedOut={() => setStatus("loggedOut")} />
      )}
    </div>
  );
}
