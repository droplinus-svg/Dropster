// Willkommens-/Aufwach-Bildschirm: gross und deutlich, damit das
// Begruessungssong-Ritual wirklich verstanden wird.
export function Welcome({ onReady }: { onReady: () => void }) {
  return (
    <div className="panel stack">
      <h2 className="howto-title">So geht’s los 🎶</h2>
      <ol className="howto">
        <li>
          Öffne die <strong>Spotify-App</strong> auf diesem Handy.
        </li>
        <li>
          Starte <strong>irgendeinen Song</strong> und lass ihn{" "}
          <strong>laufen</strong> – nicht pausieren.
        </li>
        <li>
          Komm hierher zurück und tippe <strong>„Los geht’s“</strong>.
        </li>
      </ol>
      <p className="muted">
        Das ist der Begrüßungssong – er weckt Spotify, damit Dropster die Musik
        steuern kann. Danach läuft alles von selbst.
      </p>
      <button
        className="secondary"
        onClick={() => {
          window.location.href = "spotify:";
        }}
      >
        Spotify öffnen
      </button>
      <button onClick={onReady}>Los geht’s</button>
    </div>
  );
}
