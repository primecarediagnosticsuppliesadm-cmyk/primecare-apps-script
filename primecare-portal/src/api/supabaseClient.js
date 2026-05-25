import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    "PrimeCare Supabase: set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY for stock reads."
  );
}

export const supabase =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      })
    : null;

/** Stable metadata for QA auth diagnostics (single module-level client). */
export const PRIMECARE_SUPABASE_CLIENT_META = {
  modulePath: "src/api/supabaseClient.js",
  importSpecifier: "./supabaseClient.js",
  singleton: true,
  instanceCount: 1,
};
