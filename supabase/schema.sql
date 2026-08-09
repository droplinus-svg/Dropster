-- Dropster – Sperrlisten-Schema
-- Im Supabase SQL Editor ausfuehren (New query -> einfuegen -> Run).

-- Eine wiederkehrende Gruppe / benannte Spielrunde.
create table if not exists spielrunde (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_at  timestamptz not null default now()
);

-- Songs, die eine Spielrunde schon gespielt hat -> dauerhaft gesperrt.
create table if not exists burned_song (
  spielrunde_id uuid not null references spielrunde(id) on delete cascade,
  track_id      text not null,
  title         text,
  artist        text,
  burned_at     timestamptz not null default now(),
  primary key (spielrunde_id, track_id)
);

create index if not exists idx_burned_runde on burned_song(spielrunde_id);

-- Ueber die Warteschlange angelernte Titel einer Playlist (gruppenuebergreifend
-- geteilt), damit gesperrte Songs gezielt uebersprungen werden koennen, ohne
-- sie anzuspielen.
create table if not exists playlist_track (
  playlist_id text not null,
  track_id    text not null,
  uri         text not null,
  title       text,
  artist      text,
  year        text,
  isrc        text,
  primary key (playlist_id, track_id)
);
alter table playlist_track add column if not exists isrc text;
alter table playlist_track enable row level security;
create policy "anon_all_playlist_track" on playlist_track
  for all to anon using (true) with check (true);

-- Aufgeloeste Erscheinungsjahre (MusicBrainz), pro Spotify-Track gecacht und
-- gruppenuebergreifend geteilt. Regel: Erstveroeffentlichung durch DIESEN
-- Interpreten (Neuaufnahme -> Original; Cover -> diese Version).
create table if not exists year_cache (
  track_id      text primary key,
  isrc          text,
  title         text,
  artist        text,
  artist_mbid   text,
  resolved_year int,
  source        text,   -- 'musicbrainz' | 'spotify_fallback'
  confidence    text,   -- 'high' | 'medium' | 'low'
  updated_at    timestamptz not null default now()
);
alter table year_cache enable row level security;
create policy "anon_all_year_cache" on year_cache
  for all to anon using (true) with check (true);

-- Row Level Security aktivieren, aber dem anonymen Schluessel (Browser ohne
-- Login) Zugriff geben. Die Daten sind unkritisch (Gruppennamen + Track-IDs).
alter table spielrunde enable row level security;
alter table burned_song enable row level security;

create policy "anon_all_spielrunde" on spielrunde
  for all to anon using (true) with check (true);
create policy "anon_all_burned" on burned_song
  for all to anon using (true) with check (true);
