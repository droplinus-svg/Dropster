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

-- Row Level Security aktivieren, aber dem anonymen Schluessel (Browser ohne
-- Login) Zugriff geben. Die Daten sind unkritisch (Gruppennamen + Track-IDs).
alter table spielrunde enable row level security;
alter table burned_song enable row level security;

create policy "anon_all_spielrunde" on spielrunde
  for all to anon using (true) with check (true);
create policy "anon_all_burned" on burned_song
  for all to anon using (true) with check (true);
