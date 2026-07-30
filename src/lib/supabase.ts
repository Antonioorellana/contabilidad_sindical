import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { publicEnvironment } from "./env";

/**
 * Browser Supabase client.
 *
 * It remains null in the visual prototype until valid public credentials are
 * configured. This lets the interface run without inventing fake secrets.
 */
export const supabase: SupabaseClient | null =
  publicEnvironment.isSupabaseConfigured &&
  publicEnvironment.supabaseUrl &&
  publicEnvironment.supabaseAnonKey
    ? createClient(
        publicEnvironment.supabaseUrl,
        publicEnvironment.supabaseAnonKey,
        {
          auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true,
          },
        },
      )
    : null;
