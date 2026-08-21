import { useEffect, useRef, useState } from "react";

// Onboarding-Slideshow: erklaert beim ersten Start das komplette Spiel
// (App + Zettel), jederzeit ueber das „i" erneut aufrufbar. Inhalt 1:1 aus dem
// freigegebenen Mockup.

interface Slide {
  kicker: string;
  title: string;
  body: string; // HTML
  tip?: string; // HTML
  art: string; // SVG-Markup
}

const SLIDES: Slide[] = [
  {
    kicker: "Die Idee",
    title: "Hitster – ohne die Karten",
    body:
      "Dropster spielt sich wie <b>Hitster</b> – nur <b>ohne die Spielkarten von Hitster</b>. Die App spielt einen Song ab, <b>ohne dass Titel, Interpret und Jahr angezeigt werden</b>. Ihr ratet Titel und Interpret und sortiert den Song nach seinem <span class='g'>Erscheinungsjahr</span> in eure Zeitreihe.",
    art: `<svg viewBox="0 0 300 230" fill="none" aria-hidden="true">
      <rect x="150" y="34" width="110" height="150" rx="12" transform="rotate(9 150 34)" fill="#20252e" stroke="#39414d"/>
      <rect x="70" y="30" width="110" height="150" rx="12" transform="rotate(-7 70 30)" fill="#242a34" stroke="#3c4653"/>
      <g transform="translate(96 74)">
        <rect x="0" y="34" width="10" height="26" rx="5" fill="#1db954"/>
        <rect x="18" y="14" width="10" height="46" rx="5" fill="#1db954"/>
        <rect x="36" y="28" width="10" height="32" rx="5" fill="#0e6b30"/>
        <circle cx="59" cy="55" r="5" fill="#7d8794"/>
      </g>
      <text x="150" y="205" text-anchor="middle" fill="#8b96a4" font-size="13" font-family="sans-serif">Hitster · mit euren Songs</text>
    </svg>`,
  },
  {
    kicker: "Vorbereitung",
    title: "Zettel, Stift – und dein Anker",
    body:
      "Jede:r legt sich ein paar <b>leere Klebezettel</b> und einen <b>Stift</b> bereit; das Handy bedient der <b>Spielleiter</b>. Schreib auf deinen <b>ersten Zettel</b> das <span class='g'>eigene Geburtsjahr + 10</span> und leg ihn <b>mittig vor dich</b> – das ist euer Startpunkt in der Zeitreihe.",
    art: `<svg viewBox="0 0 300 230" fill="none" aria-hidden="true">
      <rect x="46" y="58" width="86" height="96" rx="8" transform="rotate(-6 46 58)" fill="#f3f0e6" stroke="#d8d3c2"/>
      <rect x="120" y="66" width="86" height="96" rx="8" transform="rotate(4 120 66)" fill="#f3f0e6" stroke="#d8d3c2"/>
      <text x="165" y="120" text-anchor="middle" fill="#2f6b3f" font-size="24" font-weight="bold" font-family="sans-serif" transform="rotate(4 165 114)">1985</text>
      <line x1="150" y1="150" x2="252" y2="86" stroke="#7d8794" stroke-width="7" stroke-linecap="round"/>
      <path d="M252 86l10-6-2 12z" fill="#7d8794"/>
      <circle cx="150" cy="150" r="4" fill="#1db954"/>
      <text x="150" y="200" text-anchor="middle" fill="#8b96a4" font-size="13" font-family="sans-serif">Erster Zettel: Geburtsjahr + 10</text>
    </svg>`,
  },
  {
    kicker: "Einmal verbinden",
    title: "Kurz Spotify antippen",
    body:
      "Starte in <b>Spotify</b> einen Song und komm <span class='g'>sofort zurück zu Dropster</span> – <span class='g'>bleib nicht in Spotify</span>. Der Song läuft hier bei Dropster ganz normal weiter.",
    art: `<svg viewBox="0 0 300 230" fill="none" aria-hidden="true">
      <rect x="40" y="66" width="90" height="104" rx="12" fill="#171a21" stroke="#2b313c"/>
      <circle cx="85" cy="108" r="20" fill="none" stroke="#1db954" stroke-width="3"/>
      <path d="M79 99 l16 9 -16 9 z" fill="#1db954"/>
      <text x="85" y="156" text-anchor="middle" fill="#8b96a4" font-size="11" font-family="sans-serif">Spotify</text>
      <rect x="170" y="66" width="90" height="104" rx="12" fill="#171a21" stroke="#2b313c"/>
      <g transform="translate(200 96)">
        <rect x="0" y="20" width="7" height="16" rx="3.5" fill="#1db954"/>
        <rect x="12" y="8" width="7" height="28" rx="3.5" fill="#1db954"/>
        <rect x="24" y="16" width="7" height="20" rx="3.5" fill="#0e6b30"/>
      </g>
      <text x="215" y="156" text-anchor="middle" fill="#8b96a4" font-size="11" font-family="sans-serif">Dropster</text>
      <path d="M134 100 q16 -18 32 0" stroke="#1db954" stroke-width="3" fill="none" stroke-linecap="round"/>
      <path d="M166 100 l-9 -3 3 10z" fill="#1db954"/>
      <text x="150" y="150" text-anchor="middle" fill="#8b96a4" font-size="11" font-family="sans-serif">sofort zurück</text>
    </svg>`,
  },
  {
    kicker: "Playlist",
    title: "Wähle eine deiner Playlists",
    body:
      "Du spielst mit <b>deinen eigenen Spotify-Playlists</b> – Dropster zeigt sie dir zur Auswahl.",
    tip: "💡 Nimm eine <b>bunt gemischte</b> Liste über viele Jahrzehnte – eine reine 80er-Liste macht das Jahr-Raten langweilig.<br><br><b>Insider-Tipp:</b> Die offiziellen <b>Hitster-Playlists</b> gibt es auch auf Spotify. Füg eine davon deinem Konto hinzu – dann spielt ihr mit exakt denselben Songs.",
    art: `<svg viewBox="0 0 300 230" fill="none" aria-hidden="true">
      <rect x="60" y="34" width="180" height="162" rx="14" fill="#171a21" stroke="#2b313c"/>
      <g font-family="sans-serif">
        <rect x="74" y="50" width="20" height="20" rx="5" fill="#1db954"/>
        <rect x="104" y="54" width="86" height="7" rx="3.5" fill="#3a424e"/>
        <rect x="200" y="52" width="26" height="12" rx="6" fill="#20252e"/><text x="213" y="61" text-anchor="middle" fill="#8b96a4" font-size="8">1975</text>
        <rect x="74" y="84" width="20" height="20" rx="5" fill="#2a3038"/>
        <rect x="104" y="88" width="70" height="7" rx="3.5" fill="#3a424e"/>
        <rect x="200" y="86" width="26" height="12" rx="6" fill="#20252e"/><text x="213" y="95" text-anchor="middle" fill="#8b96a4" font-size="8">1994</text>
        <rect x="74" y="118" width="20" height="20" rx="5" fill="#2a3038"/>
        <rect x="104" y="122" width="80" height="7" rx="3.5" fill="#3a424e"/>
        <rect x="200" y="120" width="26" height="12" rx="6" fill="#20252e"/><text x="213" y="129" text-anchor="middle" fill="#8b96a4" font-size="8">2008</text>
        <rect x="74" y="152" width="20" height="20" rx="5" fill="#2a3038"/>
        <rect x="104" y="156" width="60" height="7" rx="3.5" fill="#3a424e"/>
        <rect x="200" y="154" width="26" height="12" rx="6" fill="#20252e"/><text x="213" y="163" text-anchor="middle" fill="#8b96a4" font-size="8">2020</text>
      </g>
    </svg>`,
  },
  {
    kicker: "Spielen",
    title: "Song hören & raten",
    body:
      "<b>1.</b> Der Song spielt.<br><b>2.</b> Wer dran ist, <b>rät Titel und Interpret</b> laut.<br><b>3.</b> Ein <b>Klick in der App</b> deckt <b>Titel und Interpret</b> auf – so seht ihr, ob's stimmte.",
    tip: "Nur wer gerade <b>dran ist</b> und richtig lag, verdient einen <b>Hitster-Chip</b> fürs spätere Eingreifen.",
    art: `<svg viewBox="0 0 300 230" fill="none" aria-hidden="true">
      <rect x="66" y="26" width="168" height="180" rx="14" fill="#171a21" stroke="#2b313c"/>
      <text x="150" y="52" text-anchor="middle" fill="#8b96a4" font-size="9" letter-spacing="1.5" font-family="sans-serif">TITEL</text>
      <rect x="96" y="60" width="108" height="9" rx="4.5" fill="#e7ebf0"/>
      <text x="150" y="92" text-anchor="middle" fill="#8b96a4" font-size="9" letter-spacing="1.5" font-family="sans-serif">INTERPRET</text>
      <rect x="110" y="100" width="80" height="8" rx="4" fill="#c2cad4"/>
      <text x="150" y="134" text-anchor="middle" fill="#8b96a4" font-size="9" letter-spacing="1.5" font-family="sans-serif">ERSCHIENEN</text>
      <text x="150" y="184" text-anchor="middle" fill="#3a424e" font-size="46" font-weight="900" font-family="sans-serif">?</text>
    </svg>`,
  },
  {
    kicker: "Platzieren",
    title: "Zettel legen",
    body:
      "Wer dran ist, legt seinen <b>leeren Zettel</b> dorthin, wo das Jahr passt – <b>zwischen</b> die Zettel, die schon liegen: <span class='g'>links = älter</span>, <span class='g'>rechts = jünger</span>.",
    art: `<svg viewBox="0 0 300 230" fill="none" aria-hidden="true">
      <line x1="30" y1="150" x2="270" y2="150" stroke="#39414d" stroke-width="2"/>
      <path d="M30 150l12-6v12z" fill="#7d8794"/><path d="M270 150l-12-6v12z" fill="#7d8794"/>
      <text x="48" y="176" fill="#8b96a4" font-size="11" font-family="sans-serif">← älter</text>
      <text x="210" y="176" fill="#8b96a4" font-size="11" font-family="sans-serif">jünger →</text>
      <rect x="44" y="88" width="52" height="60" rx="7" transform="rotate(-4 44 88)" fill="#f3f0e6" stroke="#d8d3c2"/>
      <text x="70" y="124" text-anchor="middle" fill="#3a3a3a" font-size="15" font-weight="bold" font-family="sans-serif" transform="rotate(-4 70 118)">1983</text>
      <rect x="124" y="78" width="52" height="62" rx="7" fill="#e7f6ec" stroke="#1db954" stroke-dasharray="5 4"/>
      <text x="150" y="116" text-anchor="middle" fill="#1db954" font-size="22" font-weight="bold" font-family="sans-serif">?</text>
      <rect x="204" y="88" width="52" height="60" rx="7" transform="rotate(3 204 88)" fill="#f3f0e6" stroke="#d8d3c2"/>
      <text x="230" y="124" text-anchor="middle" fill="#3a3a3a" font-size="15" font-weight="bold" font-family="sans-serif" transform="rotate(3 230 118)">2001</text>
    </svg>`,
  },
  {
    kicker: "Eingreifen",
    title: "„Hitster!“ rufen",
    body:
      "Wer die Platzierung für <b>falsch</b> hält, ruft <b>„Hitster!“</b> und legt seinen <b>Chip</b> an die Stelle, wo <b>er</b> den Song vermutet – noch <b>bevor</b> das Jahr aufgedeckt wird.",
    tip: "Eingreifen darf nur, wer einen <b>Chip</b> hat – verdient durch richtiges Nennen von Titel &amp; Interpret.",
    art: `<svg viewBox="0 0 300 230" fill="none" aria-hidden="true">
      <line x1="24" y1="156" x2="276" y2="156" stroke="#39414d" stroke-width="2"/>
      <rect x="30" y="102" width="44" height="56" rx="7" transform="rotate(-4 30 102)" fill="#f3f0e6" stroke="#d8d3c2"/>
      <text x="52" y="134" text-anchor="middle" fill="#3a3a3a" font-size="12" font-weight="bold" font-family="sans-serif" transform="rotate(-4 52 130)">1972</text>
      <rect x="92" y="100" width="44" height="56" rx="7" transform="rotate(2 92 100)" fill="#f3f0e6" stroke="#d8d3c2"/>
      <text x="114" y="132" text-anchor="middle" fill="#3a3a3a" font-size="12" font-weight="bold" font-family="sans-serif" transform="rotate(2 114 128)">1983</text>
      <rect x="154" y="96" width="44" height="60" rx="7" fill="#e7f6ec" stroke="#1db954" stroke-dasharray="5 4"/>
      <text x="176" y="131" text-anchor="middle" fill="#1db954" font-size="18" font-weight="bold" font-family="sans-serif">?</text>
      <rect x="216" y="102" width="44" height="56" rx="7" transform="rotate(3 216 102)" fill="#f3f0e6" stroke="#d8d3c2"/>
      <text x="238" y="134" text-anchor="middle" fill="#3a3a3a" font-size="12" font-weight="bold" font-family="sans-serif" transform="rotate(3 238 130)">2001</text>
      <circle cx="83" cy="156" r="12" fill="#1db954" stroke="#0b5c29" stroke-width="2"/>
      <circle cx="83" cy="156" r="4" fill="#0b5c29"/>
      <rect x="150" y="34" width="98" height="34" rx="11" fill="#20252e" stroke="#2b313c"/>
      <path d="M172 68 l0 12 13 -12 z" fill="#20252e"/>
      <text x="199" y="56" text-anchor="middle" fill="#1db954" font-size="15" font-weight="bold" font-family="sans-serif">Hitster!</text>
    </svg>`,
  },
  {
    kicker: "Auflösen",
    title: "Und jetzt das Jahr",
    body:
      "Ein <b>Klick in der App</b> zeigt das <span class='g'>Jahr</span>. Lag der Zettel des/der Dran <b>richtig</b>, wird das Jahr <span class='g'>draufgeschrieben</span> und der Zettel bleibt liegen.",
    art: `<svg viewBox="0 0 300 230" fill="none" aria-hidden="true">
      <rect x="66" y="26" width="168" height="180" rx="14" fill="#171a21" stroke="#2b313c"/>
      <text x="150" y="52" text-anchor="middle" fill="#8b96a4" font-size="9" letter-spacing="1.5" font-family="sans-serif">TITEL</text>
      <rect x="96" y="60" width="108" height="9" rx="4.5" fill="#e7ebf0"/>
      <text x="150" y="92" text-anchor="middle" fill="#8b96a4" font-size="9" letter-spacing="1.5" font-family="sans-serif">INTERPRET</text>
      <rect x="110" y="100" width="80" height="8" rx="4" fill="#c2cad4"/>
      <text x="150" y="134" text-anchor="middle" fill="#8b96a4" font-size="9" letter-spacing="1.5" font-family="sans-serif">ERSCHIENEN</text>
      <text x="150" y="176" text-anchor="middle" fill="#fff" font-size="42" font-weight="900" font-family="sans-serif">1994</text>
    </svg>`,
  },
  {
    kicker: "Wer bekommt den Zettel?",
    title: "Falsch gelegt?",
    body:
      "Lag der Zettel <b>falsch</b> und hat <b>niemand</b> „Hitster!“ gerufen, kommt er einfach <span class='r'>weg</span>. Hat jemand „Hitster!“ gerufen und <b>richtig</b> getippt, schreibt sich <b>diese Person</b> den Zettel mit dem Jahr und <span class='g'>behält</span> ihn.",
    tip: "Wer zuerst z.&#160;B. <b>10 Zettel</b> gesammelt hat, gewinnt.",
    art: `<svg viewBox="0 0 300 230" fill="none" aria-hidden="true">
      <rect x="44" y="70" width="86" height="98" rx="8" transform="rotate(-4 44 70)" fill="#2a2020" stroke="#e0555b"/>
      <path d="M66 96 l40 46 M106 96 l-40 46" stroke="#e0555b" stroke-width="5" stroke-linecap="round"/>
      <text x="86" y="196" text-anchor="middle" fill="#ff9ea1" font-size="11" font-weight="bold" font-family="sans-serif">niemand → weg</text>
      <rect x="172" y="70" width="86" height="98" rx="8" transform="rotate(4 172 70)" fill="#e7f6ec" stroke="#1db954"/>
      <text x="215" y="110" text-anchor="middle" fill="#12833a" font-size="19" font-weight="bold" font-family="sans-serif">1994</text>
      <path d="M198 130 l10 11 20 -26" stroke="#1db954" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
      <text x="215" y="196" text-anchor="middle" fill="#8fd0a3" font-size="11" font-weight="bold" font-family="sans-serif">Hitster → Punkt</text>
    </svg>`,
  },
  {
    kicker: "Gut zu wissen",
    title: "Woher kommt das Jahr?",
    body:
      "Die Zahl ist das <b>echte Erscheinungsjahr</b> des Songs – aus der Musikdatenbank <b>MusicBrainz</b>, nicht nur aus Spotify.",
    tip: "Sie kann daher vom Thema der Playlist abweichen: Ein Song aus eurer „90er“-Liste stammt im Original vielleicht von 1988. Die kleine Zeile unter dem Jahr zeigt, wie sicher die Angabe ist.",
    art: `<svg viewBox="0 0 300 230" fill="none" aria-hidden="true">
      <circle cx="104" cy="115" r="62" fill="#0a0c10" stroke="#2b313c"/>
      <circle cx="104" cy="115" r="42" fill="none" stroke="#39414d"/>
      <circle cx="104" cy="115" r="17" fill="#1db954"/>
      <circle cx="104" cy="115" r="4" fill="#0a0c10"/>
      <text x="212" y="126" text-anchor="middle" fill="#fff" font-size="34" font-weight="900" font-family="sans-serif">1994</text>
      <text x="212" y="148" text-anchor="middle" fill="#8b96a4" font-size="11" font-family="sans-serif">echtes Jahr</text>
    </svg>`,
  },
];

export function Onboarding({ onClose }: { onClose: () => void }) {
  const [i, setI] = useState(0);
  const n = SLIDES.length;
  const trackRef = useRef<HTMLDivElement>(null);
  const drag = useRef({ x0: 0, dx: 0, active: false });

  function go(idx: number) {
    setI(Math.max(0, Math.min(n - 1, idx)));
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowRight") go(i + 1);
      else if (e.key === "ArrowLeft") go(i - 1);
      else if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [i]);

  function onDown(e: React.PointerEvent) {
    drag.current = { x0: e.clientX, dx: 0, active: true };
    if (trackRef.current) trackRef.current.style.transition = "none";
  }
  function onMove(e: React.PointerEvent) {
    const d = drag.current;
    if (!d.active) return;
    d.dx = e.clientX - d.x0;
    if (trackRef.current)
      trackRef.current.style.transform = `translateX(calc(${-i * 100}% + ${d.dx}px))`;
  }
  function onUp() {
    const d = drag.current;
    if (!d.active) return;
    d.active = false;
    if (trackRef.current) trackRef.current.style.transition = "";
    if (Math.abs(d.dx) > 50) go(d.dx < 0 ? i + 1 : i - 1);
    else if (trackRef.current)
      trackRef.current.style.transform = `translateX(${-i * 100}%)`;
  }

  const last = i === n - 1;

  return (
    <div className="ob-overlay">
      <div className="ob-top">
        <span className="ob-logo">
          <span className="ob-eq">
            <i />
            <i />
            <i />
            <i />
          </span>
          <span>
            Drop<b>ster</b>
          </span>
        </span>
        <button className="ob-skip" onClick={onClose}>
          Überspringen
        </button>
      </div>

      <div
        className="ob-viewport"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onPointerLeave={onUp}
      >
        <div
          className="ob-track"
          ref={trackRef}
          style={{ transform: `translateX(${-i * 100}%)` }}
        >
          {SLIDES.map((s, idx) => (
            <section className="ob-slide" key={idx}>
              <div
                className="ob-art"
                dangerouslySetInnerHTML={{ __html: s.art }}
              />
              <div className="ob-kicker">{s.kicker}</div>
              <h2 className="ob-h2">{s.title}</h2>
              <p className="ob-p" dangerouslySetInnerHTML={{ __html: s.body }} />
              {s.tip && (
                <div
                  className="ob-tip"
                  dangerouslySetInnerHTML={{ __html: s.tip }}
                />
              )}
            </section>
          ))}
        </div>
      </div>

      <div className="ob-foot">
        <div className="ob-dots">
          {SLIDES.map((_, idx) => (
            <button
              key={idx}
              className={"ob-dot" + (idx === i ? " on" : "")}
              aria-label={"Karte " + (idx + 1)}
              onClick={() => go(idx)}
            />
          ))}
        </div>
        <div className="ob-nav">
          <button
            className="ob-btn ob-back"
            aria-label="Zurück"
            disabled={i === 0}
            onClick={() => go(i - 1)}
          >
            ‹
          </button>
          <button
            className="ob-btn ob-next"
            onClick={() => (last ? onClose() : go(i + 1))}
          >
            {last ? "Los spielen" : "Weiter"}
          </button>
        </div>
      </div>
    </div>
  );
}
