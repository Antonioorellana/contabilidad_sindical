import { describe, expect, it } from "vitest";
import { parseImportFile } from "./spreadsheetParser";

describe("parseImportFile", () => {
  it("detecta encabezados desplazados y clasifica sin inventar categorías", async () => {
    const csv = [
      "Reporte mensual;;;",
      "Generado por empresa;;;",
      ";;;",
      "RUT;nombre;ITEM;MONTO",
      "12.345.678-5;Persona Uno;CAPUAL;10.000",
      "11.111.111-1;Persona Dos;Cuota Sind. Jumbo Copiapó;8000",
      "10.000.000-8;Persona Tres;JUMBO;12000",
    ].join("\n");
    const file = new File([csv], "resultado.csv", { type: "text/csv" });

    const result = await parseImportFile(file, "company_result");

    expect(result.rows).toHaveLength(3);
    expect(result.rows[0]).toMatchObject({
      rowNumber: 5,
      recordType: "agreement",
      amount: 10000,
    });
    expect(result.rows[1].recordType).toBe("social_fee");
    expect(result.rows[2].recordType).toBe("unknown");
    expect(result.rows[2].issues).toContain("unknown_record_type");
  });

  it("conserva comas dentro de campos CSV entre comillas", async () => {
    const csv = [
      "RUT,nombre,monto",
      '"12.345.678-5","Pérez, Juan",15000',
    ].join("\n");
    const file = new File([csv], "funs.csv", { type: "text/csv" });

    const result = await parseImportFile(file, "funs_sent");

    expect(result.rows[0]).toMatchObject({
      name: "Pérez, Juan",
      amount: 15000,
      recordType: "agreement",
    });
  });

  it("archiva XLS antiguo sin intentar interpretarlo", async () => {
    const file = new File(["legacy"], "capual.xls", {
      type: "application/vnd.ms-excel",
    });

    const result = await parseImportFile(file, "provider_plan");

    expect(result.canProcess).toBe(false);
    expect(result.rows).toHaveLength(0);
    expect(result.notice).toContain("XLS antiguo");
  });

  it("marca montos decimales ambiguos para revisión", async () => {
    const csv = [
      "RUT;nombre;monto",
      "12.345.678-5;Persona Uno;10,50",
    ].join("\n");
    const file = new File([csv], "funs.csv", { type: "text/csv" });

    const result = await parseImportFile(file, "funs_sent");

    expect(result.rows[0].amount).toBeNull();
    expect(result.rows[0].issues).toContain("missing_or_invalid_amount");
  });

  it("excluye la celda final que repite exactamente el total de la hoja", async () => {
    const csv = [
      "RUT;nombre;ITEM;MONTO",
      "12.345.678-5;Persona Uno;CAPUAL;10000",
      "11.111.111-1;Persona Dos;Óptica;20000",
      ";;;30000",
    ].join("\n");
    const file = new File([csv], "resultado.csv", { type: "text/csv" });

    const result = await parseImportFile(file, "company_result");

    expect(result.rows).toHaveLength(2);
    expect(result.detectedTotal).toBe(30_000);
  });
});
