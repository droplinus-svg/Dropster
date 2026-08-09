import { useEffect, useState } from "react";
import { supabaseConfigured } from "../lib/supabase";
import {
  createSpielrunde,
  deleteSpielrunde,
  listSpielrunden,
  resetSpielrunde,
  type Spielrunde,
} from "../lib/groups";

// Kleines, originelles Icon: eine sich langsam drehende Vinyl-Platte mit
// Dropster-gruenem Label.
function VinylIcon() {
  return (
    <span className="group-hero-icon" aria-hidden="true">
      <svg className="vinyl" viewBox="0 0 48 48" width="54" height="54">
        <defs>
          <radialGradient id="dropster-label" cx="50%" cy="42%" r="60%">
            <stop offset="0%" stopColor="#4ade7f" />
            <stop offset="100%" stopColor="#12833a" />
          </radialGradient>
        </defs>
        <circle cx="24" cy="24" r="23" fill="#0a0c0f" />
        <circle
          cx="24"
          cy="24"
          r="19"
          fill="none"
          stroke="rgba(255,255,255,0.10)"
        />
        <circle
          cx="24"
          cy="24"
          r="15"
          fill="none"
          stroke="rgba(255,255,255,0.07)"
        />
        <path
          d="M24 2 A22 22 0 0 1 41 11"
          fill="none"
          stroke="rgba(255,255,255,0.22)"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <circle cx="24" cy="24" r="8.5" fill="url(#dropster-label)" />
        <circle cx="24" cy="24" r="2" fill="#0a0c0f" />
      </svg>
    </span>
  );
}

// Spielrunde waehlen: im selben Kasten entweder eine neue Gruppe anlegen ODER
// eine bestehende fortsetzen (zuruecksetzen/loeschen). Darunter: ohne
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
  const [confirmReset, setConfirmReset] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [mode, setMode] = useState<"new" | "continue">("new");
  const [filter, setFilter] = useState("");

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

  const gefiltert = filter.trim()
    ? runden.filter((r) =>
        r.name.toLowerCase().includes(filter.trim().toLowerCase())
      )
    : runden;

  // Ohne bestehende Gruppen gibt es nichts fortzusetzen -> immer "neu".
  const hasGroups = runden.length > 0;
  const showNew = mode === "new" || !hasGroups;

  return (
    <div className="stack">
      <div className="group-hero stack">
        <div className="group-hero-top">
          <VinylIcon />
          <div>
            <div className="group-hero-title">Spielgruppe</div>
            <div className="group-hero-sub">Wer spielt heute mit?</div>
          </div>
        </div>

        {hasGroups && (
          <div className="seg">
            <button
              className={"seg-btn" + (showNew ? " active" : "")}
              onClick={() => setMode("new")}
            >
              Neue Gruppe
            </button>
            <button
              className={"seg-btn" + (!showNew ? " active" : "")}
              onClick={() => setMode("continue")}
            >
              Meine Gruppen <span className="seg-count">{runden.length}</span>
            </button>
          </div>
        )}

        {showNew ? (
          <>
            <p className="group-hero-text">
              Gib der Gruppe einen Namen. Songs, die ihr spielt, bleiben für diese
              Gruppe <strong>dauerhaft gesperrt</strong> und kommen nicht wieder –
              egal wie oft ihr zusammen spielt.
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
            <button
              className={name.trim() ? "" : "btn-quiet"}
              disabled={busy || !name.trim()}
              onClick={create}
            >
              Neue Gruppe starten
            </button>
          </>
        ) : (
          <div className="stack group-list">
            {runden.length > 6 && (
              <input
                placeholder="Gruppe suchen …"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              />
            )}
            {gefiltert.length === 0 && (
              <p className="group-hero-text">Keine Gruppe passt zu „{filter}“.</p>
            )}
            {gefiltert.map((r) => (
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
      </div>

      {loading && <p className="muted">Lade Gruppen …</p>}

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
