import { useEffect, useMemo, useState } from "react";
import {
  getMyPlaylists,
  getMyProfile,
  getPlaylistBrief,
  type SpotifyPlaylist,
} from "../spotify/api";

export interface PickedPlaylist {
  id: string;
  name: string;
}

interface Row {
  id: string;
  name: string;
  total: number;
}

// Vom Nutzer in Dropster ausgeblendete Listen. Nötig, weil Spotify gelöschte
// Playlists serverseitig teils wochenlang weiter ausliefert – das können wir
// nicht erzwingen, also lassen wir den Nutzer sie hier lokal entfernen.
const HIDDEN_KEY = "dropster.hiddenPlaylists";

function loadHidden(): Set<string> {
  try {
    const raw = localStorage.getItem(HIDDEN_KEY);
    return new Set<string>(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set<string>();
  }
}

function saveHidden(set: Set<string>) {
  try {
    localStorage.setItem(HIDDEN_KEY, JSON.stringify([...set]));
  } catch {
    /* localStorage nicht verfügbar – dann eben nur für diese Sitzung */
  }
}

// Spotify-Playlist-Link oder -URI in die reine Playlist-ID zerlegen.
function parsePlaylistId(input: string): string | null {
  const s = input.trim();
  const m = s.match(/playlist[:/]([A-Za-z0-9]+)/);
  if (m) return m[1];
  if (/^[A-Za-z0-9]{16,}$/.test(s)) return s;
  return null;
}

// Playlist-Auswahl: eine ODER mehrere Listen wählen. Weitergehende Werkzeuge
// (Konto prüfen, per Link ergänzen, neu laden) sind hinter „Playlist nicht
// dabei?" eingeklappt, damit die Startmaske schlank bleibt.
export function PlaylistSelect({
  onStart,
  onLogout,
}: {
  onStart: (picked: PickedPlaylist[]) => void;
  onLogout: () => void;
}) {
  const [playlists, setPlaylists] = useState<SpotifyPlaylist[]>([]);
  const [manual, setManual] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [account, setAccount] = useState<string | null>(null);
  const [link, setLink] = useState("");
  const [adding, setAdding] = useState(false);
  const [addMsg, setAddMsg] = useState("");
  const [showMore, setShowMore] = useState(false);
  const [hidden, setHidden] = useState<Set<string>>(loadHidden);
  const [manage, setManage] = useState(false);

  async function load() {
    setLoading(true);
    setMsg("");
    try {
      const [pls, profile] = await Promise.all([
        getMyPlaylists(),
        getMyProfile(),
      ]);
      setPlaylists(pls);
      setAccount(profile.name);
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const rows: Row[] = useMemo(() => {
    const seen = new Set<string>();
    const out: Row[] = [];
    for (const r of manual) {
      if (!seen.has(r.id) && !hidden.has(r.id)) {
        seen.add(r.id);
        out.push(r);
      }
    }
    for (const pl of playlists) {
      if (!seen.has(pl.id) && !hidden.has(pl.id)) {
        seen.add(pl.id);
        out.push({ id: pl.id, name: pl.name, total: pl.tracks?.total ?? 0 });
      }
    }
    return out.sort((a, b) => a.name.localeCompare(b.name, "de"));
  }, [manual, playlists, hidden]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Liste in Dropster ausblenden (dauerhaft gemerkt) – auch aus der Auswahl.
  function hide(id: string) {
    setHidden((prev) => {
      const next = new Set(prev).add(id);
      saveHidden(next);
      return next;
    });
    setSelected((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }

  function unhideAll() {
    setHidden(() => {
      const empty = new Set<string>();
      saveHidden(empty);
      return empty;
    });
  }

  async function addByLink() {
    setAddMsg("");
    const id = parsePlaylistId(link);
    if (!id) {
      setAddMsg("Das sieht nicht nach einem Playlist-Link aus.");
      return;
    }
    setAdding(true);
    try {
      const brief = await getPlaylistBrief(id);
      if (!brief) {
        setAddMsg("Playlist nicht gefunden oder nicht zugänglich.");
        return;
      }
      setManual((prev) =>
        prev.some((r) => r.id === brief.id) ? prev : [brief, ...prev]
      );
      setSelected((prev) => new Set(prev).add(brief.id));
      setLink("");
      setAddMsg(`„${brief.name}“ hinzugefügt.`);
    } catch (e) {
      const m = (e as Error).message;
      // 404/403 = Spotify gibt genau diese Playlist der App im Dev-Modus nicht
      // frei (typisch bei fremden/offiziellen Listen). Klartext statt API-Text.
      setAddMsg(
        /40[34]/.test(m)
          ? "Diese Playlist gibt Spotify der App nicht frei (meist fremde/offizielle Listen). Verlinke am besten eine EIGENE Playlist – oder kopiere die Liste einmal in dein Konto und nimm den Link der Kopie."
          : m
      );
    } finally {
      setAdding(false);
    }
  }

  function start() {
    const byId = new Map(rows.map((r) => [r.id, r.name]));
    const picked = [...selected]
      .filter((id) => byId.has(id))
      .map((id) => ({ id, name: byId.get(id) as string }));
    if (picked.length) onStart(picked);
  }

  const count = selected.size;

  return (
    <div className="stack">
      <div className="panel stack">
        <strong>Deine Playlists</strong>
        <p className="muted">
          Wähle eine oder mehrere Listen – gespielt wird zufällig quer durch.
        </p>

        {loading && <p className="muted">Lade Playlists …</p>}
        {msg && <p className="muted">{msg}</p>}

        <div className="stack">
          {rows.map((r) => {
            const on = selected.has(r.id);
            return (
              <div key={r.id} className="pl-row">
                <button
                  className={"pl-pick" + (on ? " on" : "")}
                  onClick={() => toggle(r.id)}
                >
                  <span className="pl-check" aria-hidden="true">
                    {on ? "✓" : ""}
                  </span>
                  <span className="pl-name">
                    {r.name} · {r.total || "?"} Songs
                  </span>
                </button>
                {manage && (
                  <button
                    className="pl-hide"
                    aria-label={`„${r.name}" ausblenden`}
                    onClick={() => hide(r.id)}
                  >
                    ×
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* Dezenter Auslöser – bewusst KEIN Button-Look, damit er nicht mit den
            Start-Aktionen verwechselt wird. */}
        <button
          className="pl-more-toggle"
          onClick={() => setShowMore((v) => !v)}
        >
          Playlist nicht dabei?
        </button>

        {showMore && (
          <div className="more-panel">
            <div className="muted" style={{ fontSize: 13 }}>
              Spotify zeigt neue Listen oft verzögert. Hier kannst du nachhelfen.
            </div>

            {account && (
              <div className="account-line">
                Angemeldet als <b>{account}</b>
              </div>
            )}

            <div className="pl-addrow">
              <input
                type="text"
                inputMode="url"
                placeholder="Playlist-Link einfügen"
                value={link}
                onChange={(e) => {
                  setLink(e.target.value);
                  if (addMsg) setAddMsg("");
                }}
              />
              <button
                className="pl-addbtn"
                disabled={adding || !link.trim()}
                onClick={addByLink}
              >
                {adding ? "…" : "Hinzufügen"}
              </button>
            </div>
            <div className="muted" style={{ fontSize: 12 }}>
              In Spotify: Playlist → „…" → Teilen → Link kopieren.
            </div>
            {addMsg && (
              <div className="muted" style={{ fontSize: 13 }}>
                {addMsg}
              </div>
            )}

            <button className="linklike" disabled={loading} onClick={load}>
              ↻ Liste neu laden
            </button>

            <div className="pl-manage-row">
              <button
                className="linklike"
                onClick={() => setManage((v) => !v)}
              >
                {manage ? "✓ Fertig" : "Listen ausblenden"}
              </button>
              {hidden.size > 0 && (
                <button className="linklike" onClick={unhideAll}>
                  {hidden.size} ausgeblendet – wieder einblenden
                </button>
              )}
            </div>
            {manage && (
              <div className="muted" style={{ fontSize: 12 }}>
                Tipp auf das <b>×</b> neben einer Liste, um sie aus Dropster zu
                entfernen. (In Spotify gelöschte Listen hängen dort oft noch
                nach – so wirst du sie hier trotzdem los.)
              </div>
            )}

            <div className="hint-box">
              <b>Insider-Tipp:</b> Fremde oder offizielle Listen (z. B. die
              Hitster-Playlists) gibt Spotify der App nicht direkt frei. Der
              Trick: In Spotify die Liste öffnen → <b>„…" → „Zu Playlist
              hinzufügen" → „Neue Playlist"</b>. So landet eine <b>eigene
              Kopie</b> in deinem Konto. Deren Link hier einfügen – schon
              spielbar.
            </div>
          </div>
        )}
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
