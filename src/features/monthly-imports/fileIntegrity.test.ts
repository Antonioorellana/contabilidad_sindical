import { describe, expect, it } from "vitest";
import {
  calculateSha256,
  getFileReadErrorMessage,
  materializeImportFile,
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

  it("crea una copia independiente controlada por el navegador", async () => {
    const source = new File(["datos sindicales"], "origen.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      lastModified: 1234,
    });

    const materialized = await materializeImportFile(source);

    expect(materialized.file).not.toBe(source);
    expect(materialized.file.name).toBe(source.name);
    expect(materialized.file.lastModified).toBe(source.lastModified);
    expect(await materialized.file.text()).toBe("datos sindicales");
    expect(materialized.sha256).toBe(await calculateSha256(source));
  });

  it("explica los errores de permisos de proveedores cloud", () => {
    expect(
      getFileReadErrorMessage(
        new DOMException(
          "The requested file could not be read after a reference to a file was acquired.",
          "NotReadableError",
        ),
      ),
    ).toContain("OneDrive");
  });
});
