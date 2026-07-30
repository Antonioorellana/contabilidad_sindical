import { describe, expect, it } from "vitest";
import { decideReconciliation } from "./reconciliation";

describe("decideReconciliation", () => {
  it("autoriza la distribución cuando el total coincide exactamente", () => {
    const result = decideReconciliation(
      [
        { id: "optica-1", amount: 10_000 },
        { id: "rimo-1", amount: 10_000 },
        { id: "capual-1", amount: 10_000 },
      ],
      30_000,
    );

    expect(result).toEqual({
      kind: "automatic",
      requestedAmount: 30_000,
      reportedAmount: 30_000,
      difference: 0,
      installmentIds: ["optica-1", "rimo-1", "capual-1"],
    });
  });

  it("envía a revisión manual cualquier diferencia", () => {
    const result = decideReconciliation(
      [
        { id: "optica-1", amount: 10_000 },
        { id: "rimo-1", amount: 10_000 },
      ],
      18_000,
    );

    expect(result).toMatchObject({
      kind: "manual-review",
      difference: -2_000,
      reason: "amount-mismatch",
    });
  });

  it("no distribuye cuando falta el archivo de resultados", () => {
    const result = decideReconciliation(
      [{ id: "rimo-1", amount: 25_000 }],
      null,
    );

    expect(result).toMatchObject({
      kind: "manual-review",
      reportedAmount: null,
      reason: "missing-company-result",
    });
  });

  it("rechaza montos fraccionarios o negativos", () => {
    expect(() =>
      decideReconciliation([{ id: "invalida", amount: -1 }], 0),
    ).toThrow(RangeError);
  });
});
