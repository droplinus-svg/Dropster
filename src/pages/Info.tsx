// Spielanleitung als Overlay – erreichbar über das „i" oben rechts.
export function Info({ onClose }: { onClose: () => void }) {
  return (
    <div className="overlay">
      <div className="overlay-inner">
        <div
          className="row"
          style={{ justifyContent: "space-between", alignItems: "center" }}
        >
          <h2 className="howto-title">Spielanleitung</h2>
          <button
            className="secondary"
            style={{ width: "auto" }}
            onClick={onClose}
          >
            Schließen
          </button>
        </div>

        <div className="panel stack">
          <p className="muted">
            <strong>So läuft’s:</strong> Der Spielleiter verbindet dieses Handy
            mit der App und gibt es reihum. Jede:r braucht ein paar leere{" "}
            <strong>Klebezettel</strong> und einen Stift. Ziel ist, die Songs vor
            sich nach <strong>Erscheinungsjahr</strong> in eine Reihe zu bringen.
          </p>
        </div>

        <ol className="howto">
          <li>
            Ein Song wird abgespielt – noch <strong>verdeckt</strong>. Niemand
            sieht Titel, Interpret oder Jahr.
          </li>
          <li>
            Wer dran ist, nimmt einen <strong>leeren Zettel</strong> und legt ihn
            in die eigene Reihe: weiter <strong>links = älter</strong>, weiter{" "}
            <strong>rechts = jünger</strong> als die Songs, die schon liegen.
          </li>
          <li>
            Dann <strong>„Lösen“</strong> – erst erscheinen Titel und Interpret,
            mit einem weiteren Tipp das <strong>Jahr</strong>.
          </li>
          <li>
            Lag der Zettel richtig (das Jahr passt in die Reihenfolge)? Dann das{" "}
            <strong>Jahr darauf schreiben</strong> und liegen lassen. Sonst den
            Zettel wieder <strong>entfernen</strong>.
          </li>
          <li>
            Handy weiter zum/zur Nächsten – <strong>Nächste Runde</strong>.
          </li>
        </ol>

        <div className="panel stack">
          <p className="muted">
            <strong>Gewonnen</strong> hat, wer als Erste:r z. B.{" "}
            <strong>10 richtig einsortierte Zettel</strong> vor sich liegen hat –
            die Zielzahl legt ihr selbst fest.
          </p>
        </div>

        <div className="panel stack">
          <p className="muted">
            <strong>Marken zum Eingreifen:</strong> Ihr könnt die{" "}
            <strong>Hitster-Marken</strong> aus dem normalen Spiel verwenden –
            oder euch selbst welche basteln (z. B. Chips oder Münzen). Mit einer
            Marke darf man <strong>intervenieren</strong>: Glaubst du, dass die
            Person, die gerade dran ist, das Jahr{" "}
            <strong>falsch einsortiert</strong> hat, gibst du eine Marke ab und
            legst <strong>die Marke selbst</strong> an die Stelle in der Reihe,
            wo deiner Meinung nach das Jahr richtig läge – keinen Zettel, nur die
            Marke. Stimmt deine Position, gewinnst du – liegst du daneben, ist
            die Marke weg.
          </p>
        </div>

        <button onClick={onClose}>Alles klar</button>
      </div>
    </div>
  );
}
