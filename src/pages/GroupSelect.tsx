import { useEffect, useState } from "react";
import { supabaseConfigured } from "../lib/supabase";
import {
  createSpielrunde,
  deleteSpielrunde,
  listSpielrunden,
  resetSpielrunde,
  type Spielrunde,
} from "../lib/groups";

// Spielrunde waehlen: neue Gruppe anlegen, bestehende fortsetzen (deren
// Sperrliste zuruecksetzen oder die Gruppe loeschen), oder ohne dauerhafte
// Sperrliste spielen (null).
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
  const [confirmReset, setConfirmReset] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

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

  async function doReset(id: string) {
    setBusy(true);
    setMsg("");
    try {
      await resetSpielrunde(id);
      setMsg("Sperrliste zurückgesetzt – alle Songs sind wieder frei.");
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setConfirmReset(null);
      setBusy(false);
    }
  }

  async function doDelete(id: string) {
    setBusy(true);
    setMsg("");
    try {
      await deleteSpielrunde(id);
      setRunden((rs) => rs.filter((r) => r.id !== id));
      setMsg("Gruppe gelöscht.");
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setConfirmDelete(null);
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <div className="group-hero stack">
        <div className="group-hero-top">
          <span className="group-hero-icon" aria-hidden="true">
            🎉
          </span>
          <div>
            <div className="group-hero-title">Spielgruppe</div>
            <div className="group-hero-sub">Wer spielt heute mit?</div>
          </div>
        </div>
        <p className="group-hero-text">
          Gib der Gruppe einen Namen. Songs, die ihr spielt, bleiben für diese
          Gruppe <strong>dauerhaft gesperrt</strong> und kommen später nicht
          wieder.
        </p>
        {!supabaseConfigured && (
          <p className="group-hero-text">
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
          Neue Gruppe starten
        </button>
      </div>

      {loading && <p className="muted">Lade Gruppen …</p>}

      {runden.length > 0 && (
        <div className="panel stack">
          <strong>Bestehende Gruppe fortsetzen</strong>
          {runden.map((r) => (
            <div key={r.id} className="group-block">
              <div className="group-row">
                <button
                  className="secondary group-name"
                  onClick={() => onPick(r)}
                >
                  {r.name}
                </button>
              </div>
              {confirmReset === r.id ? (
                <span className="group-confirm">
                  <span className="muted">Sperrliste löschen?</span>
                  <button
                    className="linklike"
                    disabled={busy}
                    onClick={() => doReset(r.id)}
                  >
                    Ja
                  </button>
                  <button
                    className="linklike"
                    onClick={() => setConfirmReset(null)}
                  >
                    Nein
                  </button>
                </span>
              ) : confirmDelete === r.id ? (
                <span className="group-confirm">
                  <span className="muted">Gruppe wirklich löschen?</span>
                  <button
                    className="linklike danger-link"
                    disabled={busy}
                    onClick={() => doDelete(r.id)}
                  >
                    Ja, löschen
                  </button>
                  <button
                    className="linklike"
                    onClick={() => setConfirmDelete(null)}
                  >
                    Nein
                  </button>
                </span>
              ) : (
                <span className="group-actions">
                  <button
                    className="linklike"
                    onClick={() => {
                      setConfirmDelete(null);
                      setConfirmReset(r.id);
                    }}
                  >
                    zurücksetzen
                  </button>
                  <span className="group-dot">·</span>
                  <button
                    className="linklike danger-link"
                    onClick={() => {
                      setConfirmReset(null);
                      setConfirmDelete(r.id);
                    }}
                  >
                    löschen
                  </button>
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {msg && (
        <div className="panel">
          <p className="muted">{msg}</p>
        </div>
      )}

      <div className="panel stack">
        <button className="secondary" onClick={() => onPick(null)}>
          Ohne Sperrliste spielen
        </button>
      </div>
      <button className="linklike logout-link" onClick={onLogout}>
        Abmelden
      </button>
    </div>
  );
}
