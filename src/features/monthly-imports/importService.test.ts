import { describe, expect, it } from "vitest";
import { isStorageConflict } from "./importService";

describe("isStorageConflict", () => {
  it("reconoce el estado de conflicto de Supabase Storage", () => {
    expect(isStorageConflict({ statusCode: "409", message: "Conflict" })).toBe(
      true,
    );
  });

  it("reconoce el mensaje actual de objeto duplicado", () => {
    expect(isStorageConflict({ message: "The resource already exists" })).toBe(
      true,
    );
  });

  it("no oculta otros errores de almacenamiento", () => {
    expect(isStorageConflict({ statusCode: 500, message: "Network error" })).toBe(
      false,
    );
  });
});
