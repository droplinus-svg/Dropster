import { beginLogin } from "../spotify/auth";

export function Login() {
  return (
    <div className="stack">
      <img
        src="/logo.png"
        alt="Dropster – Name that Track"
        style={{
          width: "100%",
          maxWidth: "300px",
          margin: "8px auto 4px",
          display: "block",
        }}
      />
      <div className="panel stack">
        <p className="muted">
          Melde dich mit deinem <strong>Spotify-Premium-Konto</strong> an.
          Dropster steuert die Spotify-App auf diesem Handy – der Ton kommt aus
          Spotify selbst.
        </p>
        <button onClick={() => beginLogin()}>Mit Spotify anmelden</button>
        <p className="muted">
          Tipp: Öffne vor dem Spielen einmal die Spotify-App und drücke kurz
          Play, damit dieses Handy als Wiedergabegerät erkannt wird.
        </p>
      </div>
    </div>
  );
}
