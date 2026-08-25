import { useEffect, useRef, useState } from "react";
import {
  getCurrentlyPlaying,
  getPlaybackVolume,
  getPlaylistMembers,
  pickBestDeviceId,
  playTrack,
  playTrackInContext,
  searchAmbientUri,
  setVolume,
  skipNext,
  startPlaylist,
  type NowPlaying,
  type TrackInfo,
} from "../spotify/api";
import { burnSong, loadBlacklist } from "../lib/groups";
import { resolveYear, type YearResult } from "../lib/year";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Stiller Pausen-Track (haelt beim Loesen die Verbindung). Suche als Notnagel.
const AMBIENT_ID = "3ccQUpgvYqmgblII6yzyDM";
const AMBIENT_URI = `spotify:track:${AMBIENT_ID}`;

function isDeviceError(m: string): boolean {
  const s = m.toLowerCase();
  return (
    s.includes("gerät") ||
    s.includes("device") ||
    s.includes("eingeschlafen") ||
    s.includes("no active")
  );
}

// "Was laeuft gerade?" -> unser internes Track-Format (ohne Abspiel-URI, die
// brauchen wir nicht: wir bewegen uns immer im Playlist-Kontext).
function npToInfo(np: NowPlaying): TrackInfo {
  return {
    id: np.id ?? "",
    uri: "",
    title: np.name,
    artist: np.artists.join(", "),
    year: np.year,
    isrc: np.isrc,
  };
}

export function Game({
  playlistId,
  playlistName,
  spielrundeId,
  onChangePlaylist,
  onEnd,
}: {
  playlistId: string;
  playlistName: string;
  spielrundeId: string | null;
  onChangePlaylist: () => void;
  onEnd: () => void;
}) {
  const [phase, setPhase] = useState<"idle" | "playing" | "meta" | "year">(
    "idle"
  );
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [current, setCurrent] = useState<TrackInfo | null>(null);
  const [yearInfo, setYearInfo] = useState<YearResult | null>(null);
  const [played, setPlayed] = useState<Set<string>>(new Set());
  const [round, setRound] = useState(0);
  const [busy, setBusy] = useState(false);
  // Läuft gerade das (stumme) Vorbereiten des nächsten Songs? Dann zeigen wir
  // ein klares Ladesignal, damit niemand ungeduldig mehrfach tippt.
  const [preparing, setPreparing] = useState(false);
  const [recheck, setRecheck] = useState(false);
  const [msg, setMsg] = useState("");
  // Playlist komplett durchgespielt? Dann darf der/die Spielleiter/in
  // entscheiden: mit Spotifys aehnlichen Songs weiter oder neue Playlist.
  const [playlistDone, setPlaylistDone] = useState(false);
  // Als Ref, damit die Wiedergabe-Logik direkt nach dem Antippen von
  // "weiterspielen" sofort den neuen Wert sieht (ohne Render-Verzoegerung).
  const allowExtRef = useRef(false);

  // Gemeldete Gesamtzahl der Playlist-Titel (auch im Dev-Mode zuverlaessig,
  // selbst wenn Spotify die Titel-Details verbirgt). Fuer die Ende-Anzeige.
  const [playlistTotal, setPlaylistTotal] = useState(0);
  // Wie viele echte Titel der Playlist konnten wir lesen? (0 = Spotify verbirgt
  // die Liste -> dann greift nur die Kontext-Prüfung.)
  const [memberCount, setMemberCount] = useState(0);
  // Wie viele ECHTE Playlist-Titel wurden schon gespielt (keine Erweiterungen)?
  const playedMembersRef = useRef(0);
  // Zuletzt bekannte "echte" Lautstaerke (>0). Schutz davor, dass die App nach
  // dem stummen Vorbereiten versehentlich auf 0 haengen bleibt.
  const lastVolRef = useRef(70);
  // Die ECHTEN Track-IDs dieser Playlist (wenn Spotify sie herausgibt – bei
  // eigenen Playlists meist ja). Damit prüfen wir jeden Song gegen und lassen
  // Fremd-Einstreuungen (Smart Shuffle) gar nicht erst als Rundensong zu.
  const memberIdsRef = useRef<Set<string>>(new Set());
  // Die vollständigen Titel (inkl. Abspiel-Adresse) – für den Direktstart bei
  // eigenen Playlists, ganz ohne stummes Durchschalten.
  const memberTracksRef = useRef<TrackInfo[]>([]);
  // Kennen wir die Liste vollständig? Nur dann darf ein Nicht-Mitglied hart
  // abgelehnt werden (bei sehr großen Playlists kann die Liste unvollständig
  // sein – dann verlassen wir uns nur auf den Kontext).
  const memberListCompleteRef = useRef(false);

  useEffect(() => {
    (async () => {
      if (spielrundeId) {
        try {
          const ids = await loadBlacklist(spielrundeId);
          if (ids.length) setPlayed(new Set(ids));
        } catch {
          /* ohne Sperrliste weiter */
        }
      }
      try {
        const { members, total } = await getPlaylistMembers(playlistId);
        if (total > 0) setPlaylistTotal(total);
        setMemberCount(members.length);
        if (members.length) {
          memberTracksRef.current = members;
          members.forEach((m) => memberIdsRef.current.add(m.id));
          // Vollständig, wenn wir mindestens so viele wie die gemeldete
          // Gesamtzahl haben (Spotify liefert max. ~100 pro Seite).
          memberListCompleteRef.current = members.length >= total;
        }
      } catch {
        /* Titelliste nicht lesbar – dann greift nur die Kontext-Prüfung */
      }
    })();
  }, [spielrundeId, playlistId]);

  // Gehört dieser Song sicher NICHT zur Playlist? Nur wenn wir die vollständige
  // Titelliste kennen und der Song nicht darin ist.
  function isForeignInjection(id: string | null): boolean {
    return (
      memberListCompleteRef.current &&
      memberIdsRef.current.size > 0 &&
      !!id &&
      !memberIdsRef.current.has(id)
    );
  }

  // Sind alle Original-Titel der Playlist durchgespielt?
  function playlistExhausted(): boolean {
    return playlistTotal > 0 && playedMembersRef.current >= playlistTotal;
  }

  // Einen noch nicht gespielten ECHTEN Titel der Playlist zufällig wählen
  // (für den Direktstart bei eigenen Playlists).
  function pickMember(): TrackInfo | null {
    const free = memberTracksRef.current.filter(
      (t) => t.id !== AMBIENT_ID && t.uri && !played.has(t.id)
    );
    if (!free.length) return null;
    return free[Math.floor(Math.random() * free.length)];
  }

  // Einen Titel als aktuelle Runde festhalten. `isMember` = echter Playlist-Titel
  // (nicht Spotifys Auto-Verlaengerung) -> zaehlt fuer die Ende-Erkennung.
  function lockRound(info: TrackInfo, isMember: boolean) {
    if (isMember && !played.has(info.id)) playedMembersRef.current += 1;
    setCurrent(info);
    setPlayed((p) => new Set(p).add(info.id));
    if (spielrundeId) {
      burnSong(spielrundeId, info.id, info.title, info.artist).catch(() => {});
    }
    // Jahr im Hintergrund waehrend des Abspielens aufloesen, damit es beim
    // "Loesen" schon feststeht (MusicBrainz, danach aus dem Cache sofort).
    setYearInfo(null);
    resolveYear(info)
      .then((r) => setYearInfo(r))
      .catch(() => {});
    setRound((r) => r + 1);
    setPhase("playing");
  }

  // Wächter gegen Spotify-Autoplay: Läuft ein Song zu Ende, ohne dass jemand
  // auflöst, springt Spotify von selbst weiter. Sobald ein ANDERER Titel läuft
  // als der gerätselte, still auf den Ambient-Track wechseln und Hinweis zeigen.
  useEffect(() => {
    if (phase !== "playing" || !current?.id || !deviceId) return;
    let confirmed = false;
    let stopped = false;
    const dev = deviceId;
    const lockedId = current.id;
    const iv = setInterval(async () => {
      if (stopped) return;
      try {
        const np = await getCurrentlyPlaying();
        if (!np?.id) return;
        if (np.id === lockedId) {
          confirmed = true;
          return;
        }
        if (np.id === AMBIENT_ID) return;
        if (confirmed) {
          stopped = true;
          try {
            await playTrack(AMBIENT_URI, dev);
          } catch {
            /* egal */
          }
          setMsg(
            "Der Song war zu Ende – tippt auf „Titel & Interpret zeigen“, um aufzulösen."
          );
        }
      } catch {
        /* Netzwerk-Aussetzer ignorieren */
      }
    }, 4000);
    return () => {
      stopped = true;
      clearInterval(iv);
    };
  }, [phase, current?.id, deviceId]);

  // Kernstueck: Der/die naechste Song. Wir spielen NIE einen einzelnen Titel per
  // URI (das wuerde den Playlist-Kontext zerstoeren und Fremd-Songs einschleusen).
  // Stattdessen bleiben wir IMMER im Playlist-Kontext und bewegen uns nur darin.
  // So garantiert Spotify selbst, dass nur Titel DIESER Playlist kommen – erkennbar
  // am contextUri, das Spotify mitliefert.
  async function playRound() {
    setMsg("");
    // Alle Original-Titel dran und noch nicht bewusst "weiterspielen" getippt?
    if (playlistExhausted() && !allowExtRef.current) {
      setPlaylistDone(true);
      return;
    }
    setBusy(true);
    setPreparing(true);
    const ours = `spotify:playlist:${playlistId}`;
    let muted: string | null = null;
    let prevVol = 100;
    async function mute(dev: string) {
      if (!muted) {
        // Nie auf 0 "wiederherstellen": ein 0-/unbekannt-Wert wuerde die App
        // stumm festsetzen (dann spielt gar keine Playlist mehr, bis man sie
        // neu startet). Deshalb nur echte Werte (>=5) merken, sonst den letzten
        // bekannten guten Wert nehmen.
        const read = await getPlaybackVolume();
        if (read != null && read >= 5) {
          prevVol = read;
          lastVolRef.current = read;
        } else {
          prevVol = lastVolRef.current;
        }
        muted = dev;
        try {
          await setVolume(0, dev);
        } catch {
          /* egal */
        }
        // Kurz warten, bis die Stummschaltung wirklich greift – sonst hoert man
        // den Anfang des naechsten (noch nicht gemeinten) Songs.
        await sleep(250);
      }
    }
    async function unmute(dev: string) {
      if (muted) {
        try {
          await setVolume(prevVol, dev);
        } catch {
          /* egal */
        }
        muted = null;
      }
    }

    try {
      let dev = deviceId;
      if (!dev) {
        dev = await pickBestDeviceId();
        if (!dev) {
          throw new Error(
            "Kein Spotify-Gerät gefunden. Starte in der Spotify-App auf dem iPhone kurz einen Song und lass ihn laufen."
          );
        }
        setDeviceId(dev);
      }

      // FALL A: Eigene Playlist mit vollständig bekannter Titelliste -> den
      // besten Weg nehmen: gezielt EINEN noch nicht gespielten Titel im
      // Playlist-Kontext starten. Kein Durchschalten, kein Stummschalten (das
      // auf dem iPhone unzuverlässig war und die kurz angespielten Songs
      // verursachte), und der Song startet bei 0:00.
      if (memberListCompleteRef.current && !allowExtRef.current) {
        const cand = pickMember();
        if (!cand) {
          // Alle echten Titel gespielt -> Playlist durch.
          setPlaylistDone(true);
          return;
        }
        await playTrackInContext(playlistId, cand.uri, dev);
        lockRound(cand, true);
        return;
      }

      // FALL B: Verborgene Titelliste ODER Erweiterungen erlaubt -> wir kennen
      // die Titel nicht und müssen im Kontext stumm zum nächsten freien Titel
      // durchschalten.
      // 1. Sicherstellen, dass UNSERE Playlist als Kontext laeuft. Laeuft gerade
      //    etwas anderes (fremder Weck-Song, Ambient, andere Playlist), starten
      //    wir unsere Playlist STUMM und warten, bis Spotify sie uebernommen hat.
      let np = await getCurrentlyPlaying();
      if (np?.contextUri !== ours) {
        await mute(dev);
        dev = await startPlaylist(playlistId);
        setDeviceId(dev);
        let switched = false;
        for (let i = 0; i < 20; i++) {
          await sleep(350);
          np = await getCurrentlyPlaying();
          if (np?.contextUri === ours) {
            switched = true;
            break;
          }
        }
        if (!switched) {
          await unmute(dev);
          setMsg(
            "Spotify hat die Playlist noch nicht übernommen. Öffnet kurz die Spotify-App, startet einen Song, kommt zurück und tippt erneut auf „Song abspielen“."
          );
          setPhase("idle");
          return;
        }
      }

      // 2. Innerhalb unseres Kontexts zum naechsten noch nicht gespielten
      //    ECHTEN Playlist-Titel weiterschalten – STUMM.
      let stableId: string | null = null;
      let stableHits = 0;
      for (let i = 0; i < 40; i++) {
        np = await getCurrentlyPlaying();
        const inOurs = np?.contextUri === ours;
        const id = np?.id ?? null;

        if (!inOurs) {
          // Kontext hat unsere Playlist verlassen -> Spotify verlaengert sie
          // mit aehnlichen Songs (= Playlist zu Ende).
          if (allowExtRef.current) {
            if (id && id !== AMBIENT_ID && !played.has(id)) {
              await unmute(dev);
              lockRound(npToInfo(np!), false);
              return;
            }
          } else {
            await unmute(dev);
            setPlaylistDone(true);
            return;
          }
        } else if (
          id &&
          id !== AMBIENT_ID &&
          !played.has(id) &&
          !isForeignInjection(id)
        ) {
          // Kandidat aus UNSERER Playlist. Vor dem Festlegen kurz auf Stabilitaet
          // pruefen: denselben Titel ZWEIMAL in Folge sehen – gegen den kurzen
          // Moment, in dem Spotify schon den neuen Kontext, aber noch den alten
          // (fremden) Titel meldet.
          if (id === stableId) {
            stableHits += 1;
          } else {
            stableId = id;
            stableHits = 1;
          }
          if (stableHits >= 2) {
            await unmute(dev);
            lockRound(npToInfo(np!), true);
            return;
          }
          await sleep(300);
          continue; // nur pruefen, NICHT weiterschalten
        }

        // Nicht passend (schon gespielt / Fremd-Einstreuung / Ambient) -> weiter.
        stableId = null;
        stableHits = 0;
        await mute(dev);
        await skipNext(dev);
        await sleep(450);
      }

      // Nichts Frisches gefunden -> im Zweifel ist die Playlist durch.
      await unmute(dev);
      if (!allowExtRef.current) {
        setPlaylistDone(true);
      } else {
        setMsg(
          "Ich konnte gerade keinen freien Titel finden. Tippt bitte noch einmal auf „Song abspielen“."
        );
        setPhase("idle");
      }
    } catch (e) {
      if (muted) {
        try {
          await setVolume(prevVol, muted);
        } catch {
          /* egal */
        }
        muted = null;
      }
      const m = (e as Error).message;
      if (isDeviceError(m)) {
        setDeviceId(null);
        setPhase("idle");
        setMsg(
          "Spotify ist eingeschlafen 😴 Öffne kurz die Spotify-App, starte dort einen Song und lass ihn laufen – und komm dann sofort wieder hierher zurück, bleib nicht in Spotify. Danach hier erneut „Song abspielen“."
        );
      } else {
        setMsg(m);
      }
    } finally {
      setBusy(false);
      setPreparing(false);
    }
  }

  async function reveal() {
    setBusy(true);
    setMsg("");
    try {
      setPhase("meta");
      // Stiller Track: haelt die Verbindung waehrend der Ratepause.
      if (deviceId) {
        try {
          await playTrack(AMBIENT_URI, deviceId);
        } catch {
          try {
            const uri = await searchAmbientUri();
            if (uri) await playTrack(uri, deviceId);
          } catch {
            /* Song laeuft weiter */
          }
        }
      }
    } finally {
      setBusy(false);
    }
  }

  // Jahr auf Wunsch noch einmal aufloesen (z. B. nach einem MusicBrainz-503).
  async function recheckYear() {
    if (!current) return;
    setRecheck(true);
    setYearInfo(null);
    try {
      setYearInfo(await resolveYear(current));
    } catch {
      /* bleibt beim vorlaeufigen Jahr */
    } finally {
      setRecheck(false);
    }
  }

  // Bewusst mit Spotifys aehnlichen Songs weiterspielen.
  function continueWithExtensions() {
    allowExtRef.current = true;
    setPlaylistDone(false);
    playRound();
  }

  async function endGame() {
    // NICHT pausieren – das entkoppelt Spotify (die App verliert das Geraet).
    // Stattdessen den stillen Ambient-Track spielen: haelt die Verbindung, damit
    // man ohne Neuverbinden gleich eine neue Runde starten kann. Vorher die
    // Lautstaerke sicher auf einen hoerbaren Wert setzen (falls sie vom stummen
    // Vorbereiten noch auf 0 stand).
    try {
      if (deviceId) {
        try {
          await setVolume(lastVolRef.current, deviceId);
        } catch {
          /* egal */
        }
        await playTrack(AMBIENT_URI, deviceId);
      }
    } catch {
      /* egal */
    }
    onEnd();
  }

  const deviceLost = isDeviceError(msg);

  // Kennzeichnung, woher das angezeigte Jahr stammt (inkl. Grund bei Spotify).
  function badgeFor(y: YearResult | null): { text: string; cls: string } {
    if (!y) return { text: "Jahr wird noch geprüft …", cls: "low" };
    if (y.source === "musicbrainz") {
      return {
        text:
          y.confidence === "high"
            ? "Erstveröffentlichung · MusicBrainz"
            : "Aufnahmejahr · MusicBrainz",
        cls: "ok",
      };
    }
    const why: Record<string, string> = {
      no_isrc: "Aus Spotify · keine ISRC",
      mb_notfound: "Aus Spotify · bei MusicBrainz nicht gefunden",
      mb_error: "Aus Spotify · MusicBrainz-Fehler",
      function_error: "Aus Spotify · Server-Fehler",
      server_unreachable: "Aus Spotify · Server nicht erreicht",
    };
    return { text: why[y.reason] ?? "Jahr vorläufig aus Spotify", cls: "low" };
  }
  const yearBadge = badgeFor(yearInfo);

  return (
    <div className="stack">
      {deviceLost && (
        <div className="alert stack">
          <button
            className="secondary"
            onClick={() => {
              window.location.href = "spotify:";
            }}
          >
            Spotify öffnen
          </button>
          <p>{msg}</p>
        </div>
      )}

      <div className={"game-stage" + (deviceLost ? " compact" : "")}>
        {playlistDone && (
          <div className="reveal-card playlist-done">
            <div className="done-emoji" aria-hidden="true">🎉</div>
            <div className="done-title">Playlist durchgespielt</div>
            <p className="done-sub">
              Alle{playlistTotal ? ` ${playlistTotal}` : ""} Songs von „{playlistName}“
              waren dran. Ab jetzt hängt Spotify von selbst <b>ähnliche</b> Songs an –
              die gehören nicht mehr zur Original-Playlist.
            </p>
            <button disabled={busy} onClick={continueWithExtensions}>
              {busy ? "…" : "Mit ähnlichen Songs weiterspielen"}
            </button>
            <button className="secondary" onClick={onChangePlaylist}>
              Andere Playlist wählen
            </button>
          </div>
        )}

        {!playlistDone && preparing && (
          <div className="loading-card" aria-live="polite">
            <div className="loading-eq" aria-hidden="true">
              <i />
              <i />
              <i />
              <i />
              <i />
            </div>
            <div className="loading-title">Song wird geladen …</div>
            <div className="loading-sub">
              Spotify sucht den nächsten Titel – einen Moment bitte
            </div>
          </div>
        )}

        {!playlistDone && !preparing && phase === "idle" && (
          <button className="start-tile" disabled={busy} onClick={playRound}>
            <span className="start-tile-eq">
              <i />
              <i />
              <i />
            </span>
            <span className="start-tile-title">
              {busy ? "…" : "Los geht’s"}
            </span>
            <span className="start-tile-sub">Ersten Song starten</span>
          </button>
        )}

        {!playlistDone && !preparing && phase === "playing" && (
          <div className="playing-hero">
            <div className="eq">
              <span />
              <span />
              <span />
              <span />
              <span />
            </div>
            <p className="question">
              Ein Song läuft 🎧
              <br />
              Ratet <span>Titel, Interpret &amp; Jahr</span>
            </p>
            <p className="play-hint">
              Sagt Titel &amp; Interpret – dann auflösen
            </p>
            <button className="big-solve" disabled={busy} onClick={reveal}>
              {busy ? "…" : "Titel & Interpret zeigen"}
            </button>
          </div>
        )}

        {!playlistDone && !preparing && (phase === "meta" || phase === "year") && current && (
          <div className="reveal-card">
            <div className="lbl">Titel</div>
            <div className="reveal-title">{current.title}</div>
            <div className="lbl">Interpret</div>
            <div className="reveal-artist">{current.artist}</div>

            <div className="lbl">Erschienen</div>
            {phase !== "year" ? (
              // Vor dem Aufloesen des Jahres: nur ein Platzhalter.
              <div className="reveal-year">?</div>
            ) : yearInfo ? (
              // Jahr steht fest -> Zahl + Quelle zeigen.
              <>
                <div className="reveal-year">
                  {yearInfo.year ?? current.year ?? "—"}
                </div>
                <span className={"badge " + yearBadge.cls}>
                  {yearBadge.text}
                </span>
                {yearInfo.debug && yearInfo.source !== "musicbrainz" && (
                  <div className="year-debug">{yearInfo.debug}</div>
                )}
                {yearInfo.source !== "musicbrainz" &&
                  ["mb_error", "function_error", "server_unreachable"].includes(
                    yearInfo.reason
                  ) && (
                    <button
                      className="recheck-btn"
                      disabled={recheck}
                      onClick={recheckYear}
                    >
                      {recheck ? "… wird geprüft" : "↻ Jahr erneut prüfen"}
                    </button>
                  )}
              </>
            ) : (
              // Noch am Pruefen -> KEINE vorlaeufige Zahl, sondern Ladeanzeige.
              <div className="year-checking" aria-live="polite">
                <div className="loading-eq small" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                  <i />
                  <i />
                </div>
                <div className="year-checking-text">Jahr wird noch geprüft …</div>
              </div>
            )}

            <p
              className="reveal-hint"
              style={{ visibility: phase === "meta" ? "visible" : "hidden" }}
            >
              Erst Zettel legen · dann ggf. „Hitster!“ rufen · dann Jahr zeigen
            </p>

            {phase === "meta" ? (
              <button disabled={busy} onClick={() => setPhase("year")}>
                Jahr zeigen
              </button>
            ) : (
              <button disabled={busy} onClick={playRound}>
                {busy ? "…" : "Nächste Runde"}
              </button>
            )}
          </div>
        )}
      </div>

      {!deviceLost && !playlistDone && memberCount === 0 && playlistTotal > 0 && (
        <div className="hint-box">
          <b>Hinweis:</b> Bei dieser Playlist verbirgt Spotify die Titelliste –
          deshalb können vereinzelt fremde Songs auftauchen. Für volle Kontrolle
          die Playlist einmal in dein eigenes Spotify kopieren und die Kopie hier
          wählen.
        </div>
      )}

      {msg && !deviceLost && (
        <div className="panel">
          <p className="muted">{msg}</p>
        </div>
      )}

      {!deviceLost && (
        <>
          <button className="end-btn" onClick={endGame}>
            <span aria-hidden="true">⏹</span> Spiel beenden
          </button>
          <div className="footer-meta">
            <span>
              {playlistName} · Runde {round}
            </span>
            <button className="linklike" onClick={onChangePlaylist}>
              Andere Playlist
            </button>
          </div>
          {(memberCount > 0 || playlistTotal > 0) && (
            <div
              className={
                "check-status " + (memberCount > 0 ? "ok" : "warn")
              }
            >
              {memberCount > 0
                ? `✓ ${memberCount} Titel dieser Playlist geprüft`
                : "⚠ Titelliste von Spotify verborgen"}
            </div>
          )}
        </>
      )}
    </div>
  );
}
