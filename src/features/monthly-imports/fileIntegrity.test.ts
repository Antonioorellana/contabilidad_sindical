import { describe, expect, it } from "vitest";
import {
  calculateSha256,
  sanitizeFileName,
  validateImportFile,
} from "./fileIntegrity";

describe("file integrity", () => {
  it("calcula una huella SHA-256 reproducible", async () => {
    const file = new File(["control-sindical"], "archivo.csv", {
      type: "text/csv",
    });

    await expect(calculateSha256(file)).resolves.toBe(
      "47d8c8ff1e7c089408ccc731a97b6da90bd6da1f6208683a0d3cb14b8685d38e",
    );
  });

  it("normaliza nombres de objeto sin perder la extensión", () => {
    expect(sanitizeFileName("Óptica Joval — Julio 2026.xlsx")).toBe(
      "Optica-Joval-Julio-2026.xlsx",
    );
  });

  it("rechaza extensiones fuera del contrato", () => {
    const file = new File(["x"], "script.html", { type: "text/html" });

    expect(() => validateImportFile(file)).toThrow("Formato no permitido");
  });
});
