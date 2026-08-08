import { useEffect, useState } from "react";
import {
  getDevices,
  pausePlayback,
  playTrack,
  type SpotifyDevice,
} from "../spotify/api";
import { logout } from "../spotify/auth";

// DURCHSTICH-SCREEN: Der wichtigste Test des ganzen Projekts.
// Ziel: Auf dem iPhone einen Track in der Spotify-App starten und pausieren.
// Ein oeffentlich bekannter Track als Testfall (Rick Astley – Never Gonna Give You Up).
const TEST_TRACK_URI = "spotify:track:4cOdK2wGLETKBW3PvgPWqT";

export function PlaybackTest({ onLoggedOut }: { onLoggedOut: () => void }) {
  const [devices, setDevices] = useState<SpotifyDevice[]>([]);
  const [deviceId, setDeviceId] = useState<string>("");
  const [msg, setMsg] = useState<string>("");
  const [busy, setBusy] = useState(false);

  async function refreshDevices() {
    setMsg("");
    try {
      const list = await getDevices();
      setDevices(list);
      const active = list.find((d) => d.is_active) ?? list[0];
      if (active?.id) setDeviceId(active.id);
      if (list.length === 0) {
        setMsg(
          "Kein Gerät gefunden. Öffne die Spotify-App, drücke kurz Play, dann hier auf ‚Geräte aktualisieren‘."
        );
      }
    } catch (e) {
      setMsg((e as Error).message);
    }
  }

  useEffect(() => {
    refreshDevices();
  }, []);

  async function guard(fn: () => Promise<void>) {
    setBusy(true);
    setMsg("");
    try {
      await fn();
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <div className="panel stack">
        <strong>Durchstich-Test: Fernsteuerung</strong>
        <p className="muted">
          Prüft, ob Dropster die Spotify-App auf diesem Handy steuern kann. Das
          ist die zentrale Machbarkeits-Annahme.
        </p>

        <label className="muted">Wiedergabegerät</label>
        <select
          value={deviceId}
          onChange={(e) => setDeviceId(e.target.value)}
        >
          {devices.length === 0 && <option value="">– keins –</option>}
          {devices.map((d) => (
            <option key={d.id} value={d.id ?? ""}>
              {d.name} ({d.type}){d.is_active ? " • aktiv" : ""}
            </option>
          ))}
        </select>

        <button className="secondary" onClick={() => guard(refreshDevices)}>
          Geräte aktualisieren
        </button>
      </div>

      <div className="panel stack">
        <div className="row">
          <button
            disabled={busy}
            onClick={() =>
              guard(async () => {
                // Kein device_id, keine Uebertragung: einfach dem aktiven
                // Geraet (dem laufenden iPhone) sagen, diesen Song zu spielen.
                await playTrack(TEST_TRACK_URI);
                setMsg("▶️ Läuft – hörst du den Testsong?");
              })
            }
          >
            Testsong abspielen
          </button>
          <button
            className="secondary"
            disabled={busy}
            onClick={() =>
              guard(async () => {
                await pausePlayback();
                setMsg("⏸️ Pausiert.");
              })
            }
          >
            Stopp
          </button>
        </div>
        {msg && <p className="muted">{msg}</p>}
      </div>

      <button
        className="secondary"
        onClick={() => {
          logout();
          onLoggedOut();
        }}
      >
        Abmelden
      </button>
    </div>
  );
}
