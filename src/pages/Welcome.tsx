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
          Starte <strong>irgendeinen Song</strong> und komm{" "}
          <strong>sofort hierher zurück</strong> – bleib nicht in Spotify.
        </li>
        <li>
          Tippe <strong>„Los geht’s“</strong>. Der Song läuft in Dropster weiter.
        </li>
      </ol>
      <p className="muted">
        Das weckt Spotify, damit Dropster die Musik steuern kann. Du musst den
        Song <strong>nicht</strong> in Spotify anhören – das passiert hier.
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
