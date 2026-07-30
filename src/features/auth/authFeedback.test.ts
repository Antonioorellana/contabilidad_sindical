import { describe, expect, it } from "vitest";
import { getAuthRedirectError, getAuthRequestError } from "./authFeedback";

describe("getAuthRedirectError", () => {
  it("explains expired single-use links", () => {
    expect(
      getAuthRedirectError(
        "#error=access_denied&error_code=otp_expired&error_description=expired",
      ),
    ).toBe(
      "El enlace ya fue utilizado o venció. Solicita un enlace nuevo.",
    );
  });

  it("returns a safe generic message for unknown auth errors", () => {
    expect(getAuthRedirectError("#error_code=unexpected_error")).toBe(
      "No fue posible completar el acceso. Solicita un enlace nuevo.",
    );
  });

  it("ignores ordinary URL fragments", () => {
    expect(getAuthRedirectError("#cargas-mensuales")).toBeNull();
  });
});

describe("getAuthRequestError", () => {
  it("explains the temporary email quota without exposing account existence", () => {
    expect(getAuthRequestError("over_email_send_rate_limit")).toBe(
      "Se alcanzó el límite temporal de correos de Supabase Free. Intenta nuevamente en una hora.",
    );
  });

  it("keeps other request failures generic", () => {
    expect(getAuthRequestError("user_not_found")).toBe(
      "La cuenta no existe o no fue posible enviar el enlace.",
    );
  });
});
