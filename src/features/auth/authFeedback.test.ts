import { describe, expect, it } from "vitest";
import { getAuthRedirectError } from "./authFeedback";

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
