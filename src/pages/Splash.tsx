import { useEffect } from "react";

// Inszenierter Startbildschirm: Das Dropster-Logo faehrt hoch (Equalizer tanzt,
// Wortmarke blendet ein). Erscheint bei JEDEM Öffnen der App. Ein Tipp – oder
// nach kurzer Zeit automatisch – geht es weiter.
export function Splash({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 4500);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="splash" onClick={onDone}>
      <div className="splash-logo">
        <div className="splash-eq" aria-hidden="true">
          <i />
          <i />
          <i />
          <i />
        </div>
        <div className="splash-word">
          Drop<b>ster</b>
        </div>
        <div className="splash-tag">Name that Track</div>
      </div>
      <button className="splash-cta">Los geht’s</button>
    </div>
  );
}
