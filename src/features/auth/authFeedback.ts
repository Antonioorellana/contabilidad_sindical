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
