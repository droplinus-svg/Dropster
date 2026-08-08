import { useEffect, useState } from "react";
import { supabaseConfigured } from "../lib/supabase";
import {
  createSpielrunde,
  listSpielrunden,
  type Spielrunde,
} from "../lib/groups";

// Spielrunde waehlen: neue Gruppe anlegen, bestehende fortsetzen, oder ohne
// dauerhafte Sperrliste spielen (null).
export function GroupSelect({
  onPick,
  onLogout,
}: {
  onPick: (r: Spielrunde | null) => void;
  onLogout: () => void;
}) {
  const [runden, setRunden] = useState<Spielrunde[]>([]);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    (async () => {
      try {
        setRunden(await listSpielrunden());
      } catch (e) {
        setMsg((e as Error).message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function create() {
    if (!name.trim()) return;
    setBusy(true);
    setMsg("");
    try {
      const r = await createSpielrunde(name.trim());
      if (r) onPick(r);
      else setMsg("Konnte die Runde nicht anlegen.");
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <div className="panel stack">
        <strong>Spielrunde</strong>
        <p className="muted">
          Gib der Gruppe einen Namen. Songs, die ihr spielt, werden für diese
          Runde <strong>dauerhaft gesperrt</strong> und kommen später nicht
          wieder.
        </p>
        {!supabaseConfigured && (
          <p className="muted">
            Hinweis: Ohne Datenbank merkt sich Dropster die Sperrliste nur,
            solange die App offen ist.
          </p>
        )}
        <input
          placeholder="z. B. Familienabend"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button disabled={busy || !name.trim()} onClick={create}>
          Neue Runde starten
        </button>
        {msg && <p className="muted">{msg}</p>}
      </div>

      {loading && <p className="muted">Lade Runden …</p>}

      {runden.length > 0 && (
        <div className="panel stack">
          <strong>Bestehende Runde fortsetzen</strong>
          {runden.map((r) => (
            <button
              key={r.id}
              className="secondary"
              onClick={() => onPick(r)}
            >
              {r.name}
            </button>
          ))}
        </div>
      )}

      <button className="secondary" onClick={() => onPick(null)}>
        Ohne Sperrliste spielen
      </button>
      <button className="linklike" onClick={onLogout}>
        Abmelden
      </button>
    </div>
  );
}
