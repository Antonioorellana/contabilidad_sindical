const AUTH_REDIRECT_ERRORS: Record<string, string> = {
  otp_expired:
    "El enlace ya fue utilizado o venció. Solicita un enlace nuevo.",
  access_denied:
    "El acceso fue rechazado. Solicita un enlace nuevo.",
};

/**
 * Converts a Supabase authentication redirect error into safe user feedback.
 *
 * @param hash - URL fragment returned by the authentication provider.
 * @returns A localized message or null when no authentication error exists.
 */
export function getAuthRedirectError(hash: string): string | null {
  const normalizedHash = hash.startsWith("#") ? hash.slice(1) : hash;
  const parameters = new URLSearchParams(normalizedHash);
  const errorCode = parameters.get("error_code") ?? parameters.get("error");

  if (!errorCode) {
    return null;
  }

  return (
    AUTH_REDIRECT_ERRORS[errorCode] ??
    "No fue posible completar el acceso. Solicita un enlace nuevo."
  );
}

/**
 * Converts a passwordless-email request failure into safe user feedback.
 *
 * The generic response deliberately avoids confirming whether an address is
 * registered, while operational rate limits can be explained without exposing
 * account existence.
 *
 * @param errorCode - Stable Supabase Auth error code, when available.
 * @returns A localized message suitable for the public access form.
 */
export function getAuthRequestError(errorCode?: string): string {
  if (errorCode === "over_email_send_rate_limit") {
    return "Se alcanzó el límite temporal de correos de Supabase Free. Intenta nuevamente en una hora.";
  }

  return "La cuenta no existe o no fue posible enviar el enlace.";
}
