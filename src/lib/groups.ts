import { supabase } from "./supabase";
import { INSTANCE_ID } from "../config";
import { getCurrentUserId } from "../spotify/api";

export interface Spielrunde {
  id: string;
  name: string;
}

// Bestehende Spielrunden laden (neueste zuerst) – nur die des eingeloggten
// KONTOS, damit bei einer gemeinsamen Datenbank jede/r nur die eigenen Gruppen
// sieht (Familienmitglieder spielen meist getrennt mit eigenen Freundeskreisen).
export async function listSpielrunden(): Promise<Spielrunde[]> {
  if (!supabase) return [];
  const owner = await getCurrentUserId();
  if (!owner) return []; // ohne Konto keine Zuordnung -> nichts Fremdes zeigen
  const { data, error } = await supabase
    .from("spielrunde")
    .select("id,name")
    .eq("owner", owner)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function createSpielrunde(
  name: string
): Promise<Spielrunde | null> {
  if (!supabase) return null;
  const owner = await getCurrentUserId();
  const { data, error } = await supabase
    .from("spielrunde")
    // owner = wem die Gruppe gehoert; instance = auf welchem Link/App sie
    // entstand (nur informativ, gefiltert wird nach owner).
    .insert({ name, owner, instance: INSTANCE_ID })
    .select("id,name")
    .single();
  if (error) throw new Error(error.message);
  return data ?? null;
}

// Alle bereits gesperrten Track-IDs einer Spielrunde laden.
export async function loadBlacklist(spielrundeId: string): Promise<string[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("burned_song")
    .select("track_id")
    .eq("spielrunde_id", spielrundeId);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r: { track_id: string }) => r.track_id);
}

// Alle gesperrten Songs einer Spielrunde wieder freigeben.
export async function resetSpielrunde(spielrundeId: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase
    .from("burned_song")
    .delete()
    .eq("spielrunde_id", spielrundeId);
  if (error) throw new Error(error.message);
}

// Eine Spielgruppe ganz loeschen (inkl. ihrer Sperrliste – burned_song
// haengt per ON DELETE CASCADE dran).
export async function deleteSpielrunde(spielrundeId: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase
    .from("spielrunde")
    .delete()
    .eq("id", spielrundeId);
  if (error) throw new Error(error.message);
}

// Einen gespielten Song fuer die Spielrunde sperren.
export async function burnSong(
  spielrundeId: string,
  trackId: string,
  title: string,
  artist: string
): Promise<void> {
  if (!supabase) return;
  await supabase
    .from("burned_song")
    .upsert(
      { spielrunde_id: spielrundeId, track_id: trackId, title, artist },
      { onConflict: "spielrunde_id,track_id" }
    );
}
