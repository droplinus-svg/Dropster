import { useEffect, useRef, useState } from "react";
import {
  getCurrentlyPlaying,
  getDevices,
  getPlaylistMembers,
  getQueue,
  pausePlayback,
  pickBestDeviceId,
  playTrack,
  playTrackInContext,
  searchAmbientUri,
  setShuffle,
  startPlaylist,
  transferPlayback,
  type TrackInfo,
} from "../spotify/api";
import { burnSong, loadBlacklist } from "../lib/groups";
import { loadKnownTracks, recordTracks } from "../lib/tracks";
import { supabaseConfigured } from "../lib/supabase";
import { resolveYear, type YearResult } from "../lib/year";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Stiller Pausen-Track (haelt beim Loesen die Verbindung). Suche als Notnagel.
const AMBIENT_ID = "3ccQUpgvYqmgblII6yzyDM";
const AMBIENT_URI = `spotify:track:${AMBIENT_ID}`;

// Ein bekannter Titel MIT seiner Herkunfts-Playlist – so können wir aus einem
// gemeinsamen Topf mehrerer Listen ziehen und gezielt in die richtige Playlist
// springen.
type PoolTrack = TrackInfo & { playlistId: string };

export interface PickedPlaylist {
  id: string;
  name: string;
}

function isDeviceError(m: string): boolean {
  const s = m.toLowerCase();
  return (
    s.includes("gerät") ||
    s.includes("device") ||
    s.includes("eingeschlafen") ||
    s.includes("no active")
  );
}

export function Game({
  playlists,
  spielrundeId,
  onChangePlaylist,
  onEnd,
}: {
  playlists: PickedPlaylist[];
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
  const [preparing, setPreparing] = useState(false);
  const [recheck, setRecheck] = useState(false);
  const [msg, setMsg] = useState("");
  const [playlistDone, setPlaylistDone] = useState(false);
  // Erlaubt Wiederholungen (nach "nochmal von vorn").
  const allowRepeatsRef = useRef(false);
  // Wurde das Spotify-Gerät in dieser Sitzung schon einmal aktiv geweckt?
  const deviceWarmRef = useRef(false);

  const [playlistTotal, setPlaylistTotal] = useState(0);
  const [memberCount, setMemberCount] = useState(0);
  const [hasHidden, setHasHidden] = useState(false);
  const playedMembersRef = useRef(0);

  // Bekannte Titel-IDs (über alle gewählten Listen) und die vollständigen Titel
  // (mit Abspiel-Adresse + Herkunfts-Playlist) für den gemeinsamen Ratetopf.
  const memberIdsRef = useRef<Set<string>>(new Set());
  const memberTracksRef = useRef<PoolTrack[]>([]);
  // Welche Playlists haben wir schon einmal "angelernt" (Kontext angespielt)?
  const seededRef = useRef<Set<string>>(new Set());
  // Gemeldete Gesamtzahl je Liste (auch wenn Titel verborgen sind) – damit wir
  // wissen, wie viel wir von einer verborgenen Liste noch anlernen sollten.
  const listTotalsRef = useRef<Map<string, number>>(new Map());
  // Ausgangs-Sperrliste (für "nochmal von vorn": zurück auf diesen Stand).
  const blacklistRef = useRef<Set<string>>(new Set());

  const combinedName =
    playlists.length === 1
      ? playlists[0]?.name
      : `${playlists.length} Listen`;

  useEffect(() => {
    (async () => {
      if (spielrundeId) {
        try {
          const ids = await loadBlacklist(spielrundeId);
          if (ids.length) {
            blacklistRef.current = new Set(ids);
            setPlayed(new Set(ids));
          }
        } catch {
          /* ohne Sperrliste weiter */
        }
      }
      let total = 0;
      let known = 0;
      let hidden = false;
      for (const pl of playlists) {
        // a) Direkt lesbare Titel (eigene Playlists) – inkl. Gesamtzahl.
        try {
          const { members, total: t } = await getPlaylistMembers(pl.id);
          if (t > 0) {
            total += t;
            listTotalsRef.current.set(pl.id, t);
          }
          if (members.length) {
            addToPool(members, pl.id);
            known += members.length;
          } else if (t > 0) {
            hidden = true;
          }
        } catch {
          /* nicht lesbar */
        }
        // b) Früher gemerkte Titel (aus der Warteschlange gelernt).
        try {
          const cached = await loadKnownTracks(pl.id);
          if (cached.length) addToPool(cached, pl.id);
        } catch {
          /* ohne Cache weiter */
        }
      }
      setPlaylistTotal(total);
      setMemberCount(known);
      setHasHidden(hidden);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spielrundeId]);

  // Titel in den gemeinsamen Topf legen (mit Herkunfts-Playlist, ohne Dubletten).
  function addToPool(tracks: TrackInfo[], playlistId: string) {
    tracks.forEach((t) => {
      if (!t.uri || t.id === AMBIENT_ID) return;
      if (memberIdsRef.current.has(t.id)) return;
      memberIdsRef.current.add(t.id);
      memberTracksRef.current.push({ ...t, playlistId });
    });
  }

  function playlistExhausted(): boolean {
    return playlistTotal > 0 && playedMembersRef.current >= playlistTotal;
  }

  // Einen zufälligen (noch nicht gespielten) Titel aus dem gemeinsamen Topf.
  function pickMember(): PoolTrack | null {
    const free = memberTracksRef.current.filter(
      (t) =>
        t.id !== AMBIENT_ID &&
        t.uri &&
        (allowRepeatsRef.current || !played.has(t.id))
    );
    if (!free.length) return null;
    return free[Math.floor(Math.random() * free.length)];
  }

  function lockRound(info: TrackInfo, isMember: boolean) {
    if (isMember && !played.has(info.id)) playedMembersRef.current += 1;
    setCurrent(info);
    setPlayed((p) => new Set(p).add(info.id));
    if (spielrundeId) {
      burnSong(spielrundeId, info.id, info.title, info.artist).catch(() => {});
    }
    setYearInfo(null);
    resolveYear(info)
      .then((r) => setYearInfo(r))
      .catch(() => {});
    setRound((r) => r + 1);
    setPhase("playing");
  }

  // Wächter gegen Spotify-Autoplay: Läuft ein Song zu Ende, ohne dass jemand
  // auflöst, springt Spotify von selbst weiter. Dann still auf den Ambient-Track
  // wechseln (stoppt den fremden Song, hält die Verbindung wach).
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

  // Wie viele Titel einer Liste kennen wir schon?
  function knownForList(pid: string): number {
    let n = 0;
    for (const t of memberTracksRef.current) if (t.playlistId === pid) n++;
    return n;
  }

  // Eine Playlist gründlich "anlernen": Kontext STUMM (pausiert) anspielen und
  // dann MEHRFACH neu mischen + die Warteschlange neu auslesen. Jeder Durchlauf
  // liefert ein neues Zufalls-Fenster von ~20 Titeln – so sammeln wir auch von
  // verborgenen Listen einen großen Teil der Songs, ganz ohne hörbares
  // Durchspielen.
  async function seedPlaylist(pid: string, dev: string, budgetMs = 9000) {
    const stop = Date.now() + budgetMs;
    const ours = `spotify:playlist:${pid}`;
    let np = await getCurrentlyPlaying();
    if (np?.contextUri !== ours) {
      await startPlaylist(pid);
      try {
        await pausePlayback(dev);
      } catch {
        /* egal */
      }
      for (let i = 0; i < 16 && Date.now() < stop; i++) {
        await sleep(350);
        np = await getCurrentlyPlaying();
        if (np?.contextUri === ours) break;
      }
    }
    const total = listTotalsRef.current.get(pid) ?? 0;
    // Bis alle bekannt sind – oder bis zwei Durchläufe nichts Neues bringen –
    // oder bis das Zeitbudget aufgebraucht ist (damit viele Listen nicht ewig
    // brauchen; der Rest wird über spätere Runden nachgelernt).
    let stale = 0;
    for (let pass = 0; pass < 12 && stale < 2 && Date.now() < stop; pass++) {
      if (total > 0 && knownForList(pid) >= total) break;
      // Reihenfolge neu würfeln (aus -> ein erzwingt ein echtes Neu-Mischen).
      try {
        await setShuffle(false, dev);
        await setShuffle(true, dev);
      } catch {
        /* Shuffle optional */
      }
      await sleep(350);
      const before = memberIdsRef.current.size;
      try {
        const q = await getQueue();
        learnQueue(pid, q);
      } catch {
        /* Warteschlange nicht verfügbar */
      }
      stale = memberIdsRef.current.size > before ? 0 : stale + 1;
    }
  }

  // Titel aus der laufenden Warteschlange in den Topf lernen + dauerhaft merken.
  function learnQueue(pid: string, q: { current: TrackInfo | null; upcoming: TrackInfo[] }) {
    const fresh = [q.current, ...q.upcoming].filter(
      (t): t is TrackInfo =>
        !!t && !!t.uri && t.id !== AMBIENT_ID && !memberIdsRef.current.has(t.id)
    );
    if (!fresh.length) return;
    addToPool(fresh, pid);
    if (supabaseConfigured) recordTracks(pid, fresh).catch(() => {});
  }

  function removeFromPool(id: string) {
    memberIdsRef.current.delete(id);
    memberTracksRef.current = memberTracksRef.current.filter((t) => t.id !== id);
  }

  // Spotify-Gerät „aufwecken": Ein frisch geöffnetes iPhone-Spotify steht zwar
  // in der Geräteliste, ist aber INAKTIV – ein Play-Befehl weckt es dann oft
  // nicht. transferPlayback macht das Gerät zum aktiven Ziel; danach greifen die
  // Play-Befehle zuverlässig. Wir warten kurz, bis Spotify das Gerät als aktiv
  // meldet. Läuft nur einmal pro Sitzung (danach ist das Gerät warm).
  async function wakeDevice(dev: string, force = false): Promise<void> {
    if (deviceWarmRef.current && !force) return;
    try {
      const devs = await getDevices();
      // Läuft schon irgendein Gerät aktiv (z. B. weil in Spotify gerade ein Song
      // lief)? Dann NICHT anfassen – ein Transfer würde es pausieren und Connect
      // durcheinanderbringen. Das war genau der Grund, warum der erste Versuch
      // scheiterte und erst der zweite klappte.
      if (devs.some((d) => d.is_active)) {
        deviceWarmRef.current = true;
        return;
      }
      // Nur ein WIRKLICH schlafendes Gerät aktiv schalten.
      await transferPlayback(dev);
    } catch {
      /* Transfer optional */
    }
    for (let i = 0; i < 8; i++) {
      await sleep(350);
      try {
        const devs = await getDevices();
        if (devs.some((d) => d.is_active)) break;
      } catch {
        /* egal */
      }
    }
    deviceWarmRef.current = true;
  }

  // Kernstück: der/die nächste Song. Wir ziehen einen ZUFÄLLIGEN Titel aus dem
  // gemeinsamen Topf (mehrere Listen möglich) und springen gezielt in seine
  // Playlist. Kein Durchschalten, echte Zufalls-Reihenfolge, startet bei 0:00.
  async function playRound() {
    setMsg("");
    if (playlistExhausted() && !allowRepeatsRef.current) {
      setPlaylistDone(true);
      return;
    }
    setBusy(true);
    setPreparing(true);

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

      // Gerät einmalig aktiv wecken, BEVOR wir das erste Mal etwas abspielen –
      // sonst schluckt ein kaltes iPhone-Spotify den ersten Song.
      await wakeDevice(dev);

      // 1. Anlernen – aber NUR so viel wie nötig, damit es egal ist, wie viele
      //    Listen gewählt sind. Regeln:
      //    • Ist schon etwas Spielbares im Topf (z. B. lesbare Liste), kommt der
      //      erste Song SOFORT – ohne Anlernen.
      //    • Sonst lernen wir Listen an, bis wir etwas haben – zeitlich gedeckelt.
      //    • Ab der 2. Runde lernen wir pro Runde HÖCHSTENS EINE weitere Liste
      //      nach, damit der Topf über die Zeit wächst, ohne je lange zu blocken.
      let seededSomething = false;
      const nextUnseeded = () =>
        playlists.find((pl) => {
          if (seededRef.current.has(pl.id)) return false;
          const total = listTotalsRef.current.get(pl.id) ?? 0;
          const known = knownForList(pl.id);
          return total > 0 ? known < total : known === 0;
        });

      if (!pickMember()) {
        // Noch nichts spielbar -> Listen anlernen, bis der Topf etwas hergibt.
        const seedDeadline = Date.now() + 7000;
        let pl = nextUnseeded();
        while (pl && Date.now() < seedDeadline) {
          try {
            await seedPlaylist(pl.id, dev, 4000);
            seededSomething = true;
          } catch {
            /* diese Liste konnten wir nicht anlernen */
          }
          seededRef.current.add(pl.id);
          if (pickMember()) break;
          pl = nextUnseeded();
        }
        // Listen, die wir aus Zeitgründen nicht mehr geschafft haben, bleiben
        // „unseeded" und werden in späteren Runden nachgeholt.
      } else if (round > 0) {
        // Schon spielbar und nicht der allererste Song -> genau EINE Liste
        // nachlernen, damit der Topf wächst.
        const pl = nextUnseeded();
        if (pl) {
          try {
            await seedPlaylist(pl.id, dev, 4000);
            seededSomething = true;
          } catch {
            /* egal */
          }
          seededRef.current.add(pl.id);
        }
      }
      // Sichtbare Topf-Größe aktualisieren.
      setMemberCount(memberTracksRef.current.length);

      // Falls angelernt wurde: kurz zur Ruhe kommen lassen (das Anlernen hat
      // gerade Kontexte angespielt/pausiert), sonst kollidiert der erste echte
      // Start mit dem letzten Lern-Vorgang.
      if (seededSomething) {
        try {
          await pausePlayback(dev);
        } catch {
          /* egal */
        }
        await sleep(500);
      }

      // 2. Gibt es überhaupt einen freien Titel? Wenn NICHT:
      //    • Sind noch Listen NICHT angelernt (Zeitbudget) -> kein „durchgespielt",
      //      sondern freundlich zum erneuten Tippen bitten (nächste Liste kommt).
      //    • Ist wirklich alles angelernt und dran -> Ende-Karte.
      const first = pickMember();
      if (!first) {
        if (nextUnseeded()) {
          setPhase("idle");
          setMsg(
            "Die nächste Liste wird noch geladen – tippt bitte gleich noch einmal auf „Song abspielen“."
          );
        } else {
          setPlaylistDone(true);
        }
        return;
      }

      // Zufälligen freien Titel gezielt anspringen. WICHTIG: Ein Titel, der wegen
      // eines schlafenden Geräts nicht startet, wird NICHT verbrannt – wir wecken
      // das Gerät und versuchen DENSELBEN Titel erneut. Nur ein echt nicht
      // abspielbarer Titel (Play-Befehl abgelehnt) fliegt aus dem Topf.
      let cand: PoolTrack | null = first;
      let deviceTrouble = false;
      // Harter Zeitdeckel: nach spätestens ~14 s brechen wir ab und melden das,
      // statt endlos in „Song wird geladen" hängen zu bleiben.
      const deadline = Date.now() + 14000;
      for (let picks = 0; picks < 6 && cand && Date.now() < deadline; picks++) {
        let advanced = false;

        for (let attempt = 0; attempt < 3 && Date.now() < deadline; attempt++) {
          // 1) Play-Befehl senden.
          try {
            await playTrackInContext(cand.playlistId, cand.uri, dev);
          } catch (err) {
            const m = (err as Error).message;
            if (isDeviceError(m)) {
              // Gerät eingeschlafen -> wecken und SELBEN Titel erneut versuchen.
              deviceTrouble = true;
              await wakeDevice(dev, true);
              continue;
            }
            // Titel wirklich nicht abspielbar -> raus und nächsten Titel.
            removeFromPool(cand.id);
            cand = pickMember();
            advanced = true;
            break;
          }

          // 2) Auf tatsächlichen Start warten. WICHTIG: Es reicht NICHT, dass die
          //    richtige Playlist im Kontext steht – nach dem Anlernen stimmt der
          //    contextUri schon, obwohl noch der (pausierte) Lern-Song drin hängt.
          //    Echt gestartet ist es nur, wenn GENAU unser Ziel-Titel LÄUFT.
          let started = false;
          for (let p = 0; p < 7; p++) {
            await sleep(400);
            const chk = await getCurrentlyPlaying();
            if (chk?.id === cand.id && chk.isPlaying) {
              started = true;
              break;
            }
          }
          if (started) {
            // Weitere Titel dieser Liste aus der Warteschlange nachlernen.
            try {
              const q = await getQueue();
              learnQueue(cand.playlistId, q);
            } catch {
              /* egal */
            }
            lockRound(cand, true);
            return;
          }

          // Start nicht erkannt: Gerät war vermutlich noch nicht wach -> wecken
          // und SELBEN Titel erneut (Titel NICHT verbrennen).
          deviceTrouble = true;
          await wakeDevice(dev, true);
        }

        // Nach 3 Versuchen an diesem Titel: nächsten Titel probieren.
        if (!advanced) cand = pickMember();
      }

      // Es GÄBE freie Titel, aber der Start klappte gerade nicht.
      deviceWarmRef.current = false; // beim nächsten Mal frisch wecken
      setPhase("idle");
      setMsg(
        deviceTrouble
          ? "Spotify ist eingeschlafen 😴 Öffne kurz die Spotify-App, starte dort einen Song und lass ihn laufen – und komm dann sofort wieder hierher zurück, bleib nicht in Spotify. Danach hier erneut „Song abspielen“."
          : "Ich konnte gerade keinen Song starten. Tippt bitte noch einmal auf „Song abspielen“."
      );
    } catch (e) {
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
      // Ruhigen Ambient-Track spielen: hält die Spotify-Verbindung während der
      // Ratepause wach (Pausieren würde das Gerät trennen).
      if (deviceId) {
        try {
          await playTrack(AMBIENT_URI, deviceId);
        } catch {
          try {
            const uri = await searchAmbientUri();
            if (uri) await playTrack(uri, deviceId);
          } catch {
            /* Song läuft leise weiter – unkritisch */
          }
        }
      }
    } finally {
      setBusy(false);
    }
  }

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

  // Nochmal – ab jetzt sind Wiederholungen erlaubt (Titel dürfen erneut kommen).
  function playAgain() {
    allowRepeatsRef.current = true;
    playedMembersRef.current = 0;
    setPlaylistDone(false);
    playRound();
  }

  async function endGame() {
    // NICHT pausieren – das entkoppelt Spotify. Stattdessen den stillen
    // Ambient-Track spielen: hält die Verbindung für eine neue Runde.
    try {
      if (deviceId) await playTrack(AMBIENT_URI, deviceId);
    } catch {
      /* egal */
    }
    onEnd();
  }

  const deviceLost = isDeviceError(msg);

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
            <div className="done-title">
              {round === 0 ? "Schon alle gehört" : "Alle Songs durchgespielt"}
            </div>
            <p className="done-sub">
              {round === 0
                ? "Diese Gruppe hat die bekannten Songs dieser Listen schon gehört. Tippt „Nochmal“, um trotzdem zu spielen (Titel dürfen sich dann wiederholen)."
                : `Alle${playlistTotal ? ` ${playlistTotal}` : ""} Songs aus ${
                    playlists.length === 1
                      ? "„" + combinedName + "“"
                      : "den gewählten Listen"
                  } waren dran.`}
            </p>
            <button disabled={busy} onClick={playAgain}>
              {busy ? "…" : "Nochmal – Songs dürfen sich wiederholen"}
            </button>
            <button className="secondary" onClick={onChangePlaylist}>
              Andere Listen wählen
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
              <div className="reveal-year">?</div>
            ) : yearInfo ? (
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

      {!deviceLost && !playlistDone && hasHidden && (
        <div className="hint-box">
          <b>Hinweis:</b> Bei mindestens einer gewählten Liste verbirgt Spotify
          die Titel – von der können vorerst nur die schon einmal gehörten Songs
          mitmischen. Für volle Auswahl die Liste in dein eigenes Spotify
          kopieren und die Kopie wählen.
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
              {combinedName} · Runde {round}
            </span>
            <button className="linklike" onClick={onChangePlaylist}>
              Andere Listen
            </button>
          </div>
          {memberCount > 0 && (
            <div className="check-status ok">
              ✓ {memberCount} Titel im Ratetopf
            </div>
          )}
        </>
      )}
    </div>
  );
}
