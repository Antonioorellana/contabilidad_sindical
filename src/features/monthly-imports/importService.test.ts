import { describe, expect, it } from "vitest";
import {
  buildImportReviewSearchFilter,
  isStorageConflict,
} from "./importService";

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

describe("buildImportReviewSearchFilter", () => {
  it("normaliza un RUT con puntos para buscar el valor almacenado", () => {
    expect(buildImportReviewSearchFilter("12.345.678-9")).toContain(
      "normalized_rut.ilike.%12345678-9%",
    );
  });

  it("conserva nombres y elimina operadores de PostgREST", () => {
    expect(buildImportReviewSearchFilter("  María,(Pérez)%  ")).toBe(
      "source_name.ilike.%María Pérez%",
    );
  });

  it("no genera filtros para una búsqueda vacía", () => {
    expect(buildImportReviewSearchFilter("   ")).toBe("");
  });
});
