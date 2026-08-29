import { useEffect, useState } from "react";
import { getMyPlaylists, type SpotifyPlaylist } from "../spotify/api";

export interface PickedPlaylist {
  id: string;
  name: string;
}

// Playlist-Auswahl: der Spielleiter wählt eine ODER MEHRERE Playlists. Bei
// mehreren kommt pro Runde ein zufälliger Song aus einer zufälligen der
// gewählten Listen.
export function PlaylistSelect({
  onStart,
  onLogout,
}: {
  onStart: (picked: PickedPlaylist[]) => void;
  onLogout: () => void;
}) {
  const [playlists, setPlaylists] = useState<SpotifyPlaylist[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  async function load() {
    setLoading(true);
    setMsg("");
    try {
      setPlaylists(await getMyPlaylists());
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function start() {
    const picked = playlists
      .filter((pl) => selected.has(pl.id))
      .map((pl) => ({ id: pl.id, name: pl.name }));
    if (picked.length) onStart(picked);
  }

  const count = selected.size;

  return (
    <div className="stack">
      <div className="panel stack">
        <strong>Deine Playlists</strong>
        <p className="muted">
          Wähle eine <strong>oder mehrere</strong> deiner Spotify-Playlists. Bei
          mehreren kommt pro Runde ein zufälliger Song aus einer zufälligen der
          gewählten Listen – ein bunter gemeinsamer Ratetopf.
        </p>
        <p className="muted">
          <strong>Insider-Tipp:</strong> Die offiziellen{" "}
          <strong>Hitster-Playlists</strong> gibt es auch auf Spotify. Füg eine
          davon deinem Konto hinzu – dann spielt ihr mit exakt denselben Songs.
        </p>
        <div className="pl-reloadrow">
          <span className="muted">
            {loading
              ? "Lade Playlists …"
              : `${playlists.length} Playlists gefunden`}
          </span>
          <button
            className="linklike"
            disabled={loading}
            onClick={load}
          >
            ↻ Aktualisieren
          </button>
        </div>
        {msg && <p className="muted">{msg}</p>}
        <div className="stack">
          {[...playlists]
            .sort((a, b) => a.name.localeCompare(b.name, "de"))
            .map((pl) => {
              const on = selected.has(pl.id);
              return (
                <button
                  key={pl.id}
                  className={"pl-pick" + (on ? " on" : "")}
                  onClick={() => toggle(pl.id)}
                >
                  <span className="pl-check" aria-hidden="true">
                    {on ? "✓" : ""}
                  </span>
                  <span className="pl-name">
                    {pl.name} · {pl.tracks?.total ?? "?"} Songs
                  </span>
                </button>
              );
            })}
        </div>
      </div>

      {count > 0 && (
        <button className="pl-start" onClick={start}>
          Spielen ({count} {count === 1 ? "Liste" : "Listen"})
        </button>
      )}

      <button className="secondary" onClick={onLogout}>
        Abmelden
      </button>
    </div>
  );
}
