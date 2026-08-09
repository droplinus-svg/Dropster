# Dropster – Spielleiter & Instanzen verwalten

Es gibt **zwei Welten**:

- **Fall A – Neuer Spielleiter auf eine bestehende App.** Schnell, kein Deploy nötig.
  Geht, solange die App noch freie Plätze hat (max. **5 pro App**).
- **Fall B – Ganz neue App/Instanz.** Nötig, wenn die 5 Plätze einer App voll sind.
  Gibt weitere 5 Plätze.

**Zwei Grundregeln vorweg:**

- Jede Person, die ein Spiel **leiten** will, braucht selbst **Spotify Premium**.
  Reine Mitspieler (nur raten) brauchen nichts.
- Du brauchst von jeder Person nur die **E-Mail ihres Spotify-Kontos**, dann bekommt
  sie den **Link** ihrer App.

> Neu: Jede/r sieht in „Meine Gruppen" nur die **eigenen** Gruppen (an das
> Spotify-Konto gebunden). Fünf Leute auf derselben App kommen sich also nicht in
> die Quere – ideal, wenn z. B. eine Familie eine App teilt, aber jede/r mit dem
> eigenen Freundeskreis spielt.

---

# Fall A – Spielleiter zu einer bestehenden App hinzufügen

So schaltest du weitere Personen auf einer App frei, die noch Platz hat.

1. Öffne das [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
   und melde dich mit **deinem** Konto an.
2. Wähle die betreffende App aus (z. B. „Dropster – Kreis 2").
3. Gehe zu **User Management**.
4. Trage für jede neue Person **Name + E-Mail ihres Spotify-Kontos** ein und füge
   sie hinzu. Es passen **bis zu 5** Personen pro App.
5. Schick der Person den **Link** dieser App (denselben, den die anderen dieser App
   schon nutzen) und die kurze Anleitung ganz unten.

Das war's – kein Deploy, keine Datenbank, nichts weiter.

> **„Es passen keine 5 mehr rein"?** Dann ist diese App voll → weiter mit **Fall B**
> (neue App). Die 5-Personen-Grenze gilt **pro App**, aber du darfst bis zu **25
> Apps** anlegen.

---

# Fall B – Ganz neue App/Instanz anlegen (weitere 5 Plätze)

Eine **Instanz** = eine Spotify-App (5 Plätze) + eine Netlify-Seite (der Link).
Die **Datenbank bleibt dieselbe** wie bei deiner Haupt-App (eine zentrale Supabase
für alles).

## Schritt 1 – Neue Spotify-App anlegen

1. [Spotify Dashboard](https://developer.spotify.com/dashboard) → **Create app**.
2. Ausfüllen:
   - **App name:** z. B. `Dropster – Kreis 3`
   - **App description:** `Privates Musik-Ratespiel`
   - **Redirect URI:** vorerst Platzhalter, z. B. `https://example.com/callback`
     (ersetzen wir in Schritt 3).
   - **APIs:** **Web API** ankreuzen.
3. **Save**, dann App öffnen → **Settings** → **`Client ID` notieren**
   (die `Client Secret` brauchst du nicht).

## Schritt 2 – Neue Netlify-Seite aus dem Repo erstellen

1. [Netlify](https://app.netlify.com) → **Add new site** → **Import an existing
   project** → **GitHub** → Repo **`Dropster`** (dasselbe Repo wie immer).
2. Build-Einstellungen unverändert lassen → **Deploy**.
3. Optional schöner Link: **Site configuration → Change site name** →
   z. B. `dropster-kreis3` → Link ist dann `https://dropster-kreis3.netlify.app`.
4. **Link notieren.**

## Schritt 3 – Redirect URI in der Spotify-App eintragen

1. Zurück zur App → **Settings → Edit → Redirect URIs**.
2. Platzhalter entfernen, **exakt** eintragen:
   `https://DEIN-LINK.netlify.app/callback` (mit `/callback` am Ende!) → **Save**.

## Schritt 4 – Umgebungsvariablen in Netlify setzen

**Site configuration → Environment variables** → jede Zeile als **Add a variable**:

| Variable | Wert |
|---|---|
| `VITE_SPOTIFY_CLIENT_ID` | die **Client ID** dieser neuen App (Schritt 1) |
| `VITE_SPOTIFY_REDIRECT_URI` | `https://DEIN-LINK.netlify.app/callback` |
| `VITE_SUPABASE_URL` | **derselbe Wert wie bei deiner Haupt-App** (zentrale DB) |
| `VITE_SUPABASE_ANON_KEY` | **derselbe Wert wie bei deiner Haupt-App** |
| `MUSICBRAINZ_CONTACT` | eine E-Mail von dir, z. B. `linsemann72@gmail.com` |
| `NODE_VERSION` | `20` |

> Wichtig: `VITE_SUPABASE_URL` und `VITE_SUPABASE_ANON_KEY` sind **überall gleich** –
> so nutzen alle Instanzen dieselbe eine Datenbank (spart Kosten). Dass sich die
> Gruppen nicht vermischen, ist im Code geregelt (Zuordnung pro Person).

Danach **Deploys → Trigger deploy → Deploy site** (Variablen greifen erst beim
nächsten Deploy).

## Schritt 5 – Die (bis zu 5) Personen freischalten

App → **User Management** → je Person **Name + Spotify-E-Mail** eintragen (max. 5).

## Schritt 6 – Link verschicken

Schick jeder Person den Link und die kurze Anleitung unten.

---

## Kurz-Anleitung für die Spielleiter (zum Weiterleiten)

> „Öffne den Link am iPhone in **Safari**, tippe **Teilen → Zum Home-Bildschirm** –
> dann startet Dropster wie eine App. Melde dich mit deinem **Spotify-Premium-Konto**
> an. Zum Spielen einmal in der Spotify-App kurz einen Song starten, dann in Dropster
> loslegen. Deine Gruppen sind privat – nur du siehst sie."

---

## Übersicht behalten (Vorlage)

| Instanz (Link) | Spotify-App (Client ID) | Belegte Plätze (Spotify-Mail) |
|---|---|---|
| dropster.netlify.app | (Haupt-App) | 1) … 2) … 3) … 4) … 5) … |
| dropster-kreis2.netlify.app | … | 1) … 2) … 3) … 4) … 5) … |
| dropster-kreis3.netlify.app | … | 1) … 2) … 3) … 4) … 5) … |

Wenn eine Zeile 5 volle Plätze hat → neue Instanz (Fall B). Sonst einfach Fall A.

---

## Häufige Stolpersteine

- **„INVALID_CLIENT: Invalid redirect URI"** → Redirect URI in der Spotify-App
  (Fall B, Schritt 3) und `VITE_SPOTIFY_REDIRECT_URI` (Schritt 4) sind nicht
  **identisch**. Beide exakt gleich, inkl. `https://` und `/callback`.
- **Login klappt, aber „kein Gerät gefunden"** → In der **Spotify-App** kurz einen
  Song starten (aktives Gerät), und die Person braucht **Premium**.
- **Person kann sich nicht anmelden** → In **User Management** fehlt ihre
  Spotify-Mail, oder es ist die falsche Adresse.
- **„Meine Gruppen" ist leer, obwohl vorhanden** → Andere Person / anderes Konto
  eingeloggt. Gruppen hängen am Spotify-Konto, nicht am Gerät.
