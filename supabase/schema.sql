-- Dropster – Supabase-Schema
-- Ausfuehren im Supabase SQL Editor (oder via CLI-Migration).

-- =========================================================
-- MUSIKDATEN (global geteilt zwischen allen Nutzern)
-- =========================================================

-- Ermitteltes Erscheinungsjahr pro Song (Key: ISRC).
create table if not exists year_cache (
  isrc          text primary key,
  title         text,
  artist        text,
  artist_mbid   text,
  resolved_year int,
  source        text check (source in ('musicbrainz','override','spotify_fallback')),
  confidence    text check (confidence in ('high','medium','low')),
  updated_at    timestamptz not null default now()
);

-- Manuelle Korrekturen. Haben beim Lesen Vorrang vor year_cache.
create table if not exists year_override (
  isrc        text primary key,
  year        int not null,
  note        text,
  created_by  text,               -- Spotify-User-ID des Spielleiters
  created_at  timestamptz not null default now()
);

-- =========================================================
-- SPIEL-STRUKTUR
-- =========================================================

-- Die wiederkehrende Gruppe. Besitzt die Blacklist.
create table if not exists spielrunde (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  owner_spotify_id  text not null,
  created_at        timestamptz not null default now()
);

-- Ein einzelner Spielabend.
create table if not exists session (
  id               uuid primary key default gen_random_uuid(),
  spielrunde_id    uuid not null references spielrunde(id) on delete cascade,
  name             text not null,          -- z. B. Datum
  playlist_id      text not null,          -- Spotify-Playlist
  honor_blacklist  boolean not null default true,   -- verbrannte Songs ausschliessen?
  persist_burns    boolean not null default true,   -- gespielte Songs verbrennen?
  created_at       timestamptz not null default now()
);

-- Die Blacklist: welche Songs diese Gruppe schon gehoert hat (Scope: pro Spielrunde, per ISRC).
create table if not exists burned_song (
  id               uuid primary key default gen_random_uuid(),
  spielrunde_id    uuid not null references spielrunde(id) on delete cascade,
  isrc             text not null,
  first_session_id uuid references session(id) on delete set null,
  burned_at        timestamptz not null default now(),
  unique (spielrunde_id, isrc)
);

-- Protokoll eines Abends (verhindert Wiederholung innerhalb derselben Session).
create table if not exists session_played (
  session_id uuid not null references session(id) on delete cascade,
  isrc       text not null,
  played_at  timestamptz not null default now(),
  primary key (session_id, isrc)
);

-- Indizes fuer die haeufigen Abfragen.
create index if not exists idx_burned_runde on burned_song(spielrunde_id);
create index if not exists idx_session_runde on session(spielrunde_id);
create index if not exists idx_played_session on session_played(session_id);

-- Bequemes Lesen des "besten" Jahres (Override schlaegt Cache).
create or replace view resolved_year as
select
  c.isrc,
  coalesce(o.year, c.resolved_year)               as year,
  case when o.isrc is not null then 'override' else c.source end as source,
  case when o.isrc is not null then 'high'     else c.confidence end as confidence,
  c.title, c.artist
from year_cache c
left join year_override o on o.isrc = c.isrc;
