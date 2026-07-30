export interface PublicEnvironment {
  supabaseUrl: string | null;
  supabaseAnonKey: string | null;
  isSupabaseConfigured: boolean;
}

/**
 * Reads and validates the public browser configuration.
 *
 * The service-role key is intentionally unsupported because any variable
 * exposed through Vite is shipped to every browser.
 *
 * @returns Public Supabase configuration and its availability state.
 */
export function readPublicEnvironment(): PublicEnvironment {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim() || null;
  const supabaseAnonKey =
    import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() || null;

  const hasValidUrl = (() => {
    if (!supabaseUrl) {
      return false;
    }

    try {
      const parsedUrl = new URL(supabaseUrl);
      return (
        parsedUrl.protocol === "https:" &&
        parsedUrl.hostname.endsWith(".supabase.co")
      );
    } catch {
      return false;
    }
  })();

  return {
    supabaseUrl,
    supabaseAnonKey,
    isSupabaseConfigured: hasValidUrl && Boolean(supabaseAnonKey),
  };
}

export const publicEnvironment = readPublicEnvironment();
