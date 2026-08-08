import { Component, type ReactNode } from "react";

// Faengt Render-Fehler ab und zeigt eine Meldung, statt eines schwarzen Bildschirms.
export class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="app">
          <header className="topbar">
            <img src="/icon-192.png" className="header-logo" alt="Dropster" />
          </header>
          <div className="panel stack">
            <strong>Ups – etwas ist schiefgelaufen</strong>
            <p className="muted">{this.state.error.message}</p>
            <button
              onClick={() => {
                this.setState({ error: null });
                window.location.reload();
              }}
            >
              Neu laden
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
