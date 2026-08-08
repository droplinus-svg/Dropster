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
        </p>
        <button onClick={() => beginLogin()}>Mit Spotify anmelden</button>
      </div>
    </div>
  );
}
