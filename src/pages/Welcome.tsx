// Willkommens-/Aufwach-Bildschirm: macht aus dem technischen "Weck-Schritt"
// ein natuerliches Begruessungssong-Ritual.
export function Welcome({ onReady }: { onReady: () => void }) {
  return (
    <div className="panel stack">
      <strong>Bereit machen</strong>
      <p className="muted">
        Zum Aufwärmen läuft ein Begrüßungssong 🎶 Öffne kurz die Spotify-App,
        starte irgendeinen Song und lass ihn spielen. Komm dann hierher zurück
        und tippe „Los geht’s“. Das weckt Spotify, damit Dropster die Musik
        steuern kann – danach läuft alles von selbst.
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
