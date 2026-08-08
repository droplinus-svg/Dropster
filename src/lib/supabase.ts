import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "../config";

// Reiner Datenspeicher – die Nutzeridentitaet liefert Spotify OAuth,
// daher keine Supabase-Auth. Wird erst ab dem Spiel-/Cache-Teil gebraucht.
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
});
