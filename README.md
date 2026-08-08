# Dropster

Musik-Rate-Spiel (Hitster-Variante) als installierbare PWA. Dropster spielt
zufällige Songs aus einer Spotify-Playlist über die **Spotify-App auf demselben
Handy** ab, verrät nichts, und zeigt auf „Lösen" **Jahr, Titel und Interpret** –
mit korrektem Original-Erscheinungsjahr über MusicBrainz.

> **Voraussetzung:** Spotify **Premium** (Playback-Steuerung geht nicht mit Free).

---

## Aktueller Stand

Erster Baustein: **Login + Fernsteuer-Durchstich**. Der Rest (Playlist
vorbereiten, Spiel-Loop, Spielrunden/Blacklist) folgt – die Datenbank und die
Jahres-Anreicherung sind bereits vorbereitet.

- ✅ Spotify OAuth (PKCE, ohne Client-Secret)
- ✅ Durchstich-Screen: Gerät wählen, Testsong abspielen/stoppen
- ✅ Supabase-Schema (`supabase/schema.sql`)
- ✅ MusicBrainz-Anreicherung (`netlify/functions/enrich.ts`)
- ⏳ Playlist-Auswahl & Vorbereiten (Anreicherung anstoßen)
- ⏳ Spiel-Loop (Blind → Lösen → nächste Runde)
- ⏳ Spielrunden + Blacklist inkl. Un-blacklisten

---

## 1. Spotify-App registrieren

1. https://developer.spotify.com/dashboard → **Create App**.
2. **Redirect URIs** hinzufügen (beide):
   - `http://127.0.0.1:5173/callback` (lokal)
   - `https://DEINE-NETLIFY-URL/callback` (Produktion)
3. **Web API** als API auswählen.
4. **Client ID** kopieren → in `.env` als `VITE_SPOTIFY_CLIENT_ID`.
5. Unter **User Management** die bis zu **5** Spotify-Account-E-Mails eintragen,
   die spielen dürfen (jeweils Premium).

## 2. Supabase einrichten

1. Projekt anlegen, **Project URL** und **anon key** notieren.
2. Im **SQL Editor** den Inhalt von `supabase/schema.sql` ausführen.
3. **service_role key** (Settings → API) für die Netlify Function notieren.

## 3. Environment-Variablen

`.env.example` nach `.env` kopieren und ausfüllen. In Netlify dieselben Werte
unter **Site settings → Environment variables** eintragen (auch die
Server-Variablen `SUPABASE_SERVICE_ROLE_KEY` und `MUSICBRAINZ_CONTACT`).

## 4. Lokal starten

```bash
npm install
npm run dev
```

Auf dem iPhone testen: Am einfachsten über die deployte Netlify-URL (OAuth-
Redirect braucht HTTPS). Für rein lokales Testen `http://127.0.0.1:5173`
verwenden (Spotify erlaubt `127.0.0.1`, aber **nicht** `localhost`).

## 5. Deploy (Netlify)

Repo mit Netlify verbinden – `netlify.toml` ist bereits konfiguriert
(Build `npm run build`, Publish `dist`, Functions `netlify/functions`).

---

## Der wichtigste Test zuerst

Nach dem Login erscheint der **Durchstich-Screen**:

1. Öffne die **Spotify-App** auf demselben iPhone und drücke **einmal kurz
   Play** (damit das Handy als Wiedergabegerät registriert wird).
2. Zurück in Dropster: **„Geräte aktualisieren"** → dein iPhone sollte in der
   Liste stehen.
3. **„Testsong abspielen"** → der Song sollte aus der Spotify-App kommen.
4. **„Stopp"** → pausiert.

Klappt das zuverlässig, trägt die ganze Architektur. Falls das Handy nicht als
Gerät auftaucht oder die Steuerung hakt, ist das **jetzt** der Moment, es zu
wissen – bevor der Rest gebaut wird.

---

## Projektstruktur

```
src/
  spotify/auth.ts      OAuth (PKCE), Token-Handling
  spotify/api.ts       Web API: Geräte, Play/Pause, Playlists, Tracks
  lib/supabase.ts      Supabase-Client (reiner Datenspeicher)
  pages/Login.tsx      Anmeldung
  pages/PlaybackTest.tsx  Durchstich-Test
netlify/functions/
  enrich.ts            MusicBrainz → Jahr → Supabase-Cache
supabase/schema.sql    Datenmodell (Cache, Overrides, Spielrunden, Blacklist)
```
