import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "../config";

// Reiner Datenspeicher (keine Supabase-Auth). Nur aktiv, wenn konfiguriert –
// sonst laeuft das Spiel ohne dauerhafte Sperrliste weiter.
export const supabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

export const supabase = supabaseConfigured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false },
    })
  : null;
