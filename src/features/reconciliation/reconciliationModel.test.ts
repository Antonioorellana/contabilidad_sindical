import { describe, expect, it } from "vitest";
import type { MonthlyCycle, SourceFileKind } from "../monthly-imports/types";
import { buildReconciliationOverview } from "./reconciliationModel";
import type {
  ReconciliationBatch,
  ReconciliationStagedRow,
} from "./types";

const cycle: MonthlyCycle = {
  id: "cycle-july",
  discount_period: "2026-07-01",
  collection_period: "2026-08-01",
  provider_deadline: "2026-07-07T23:59:59Z",
  employer_deadline: "2026-07-09T12:00:00Z",
  expected_deposit_deadline: "2026-08-05",
  status: "draft",
  is_pilot: true,
};

describe("buildReconciliationOverview", () => {
  it("habilita el cruce sólo con FUNS y resultado exactos sin observaciones", () => {
    const batches = [
      createBatch("funs", "funs_sent"),
      createBatch("company", "company_result"),
    ];
    const rows = [
      createRow("funs", 30_000),
      createRow("company", 30_000),
    ];

    const overview = buildReconciliationOverview(
      [cycle],
      cycle.id,
      batches,
      rows,
    );

    expect(overview.requestedAgreementAmount).toBe(30_000);
    expect(overview.reportedAgreementAmount).toBe(30_000);
    expect(overview.difference).toBe(0);
    expect(overview.canRunExactReconciliation).toBe(true);
  });

  it("bloquea la distribución cuando existe una diferencia", () => {
    const batches = [
      createBatch("funs", "funs_sent"),
      createBatch("company", "company_result"),
    ];
    const rows = [
      createRow("funs", 30_000),
      createRow("company", 18_000),
    ];

    const overview = buildReconciliationOverview(
      [cycle],
      cycle.id,
      batches,
      rows,
    );

    expect(overview.difference).toBe(-12_000);
    expect(overview.canRunExactReconciliation).toBe(false);
    expect(overview.blockers).toContain(
      "El total solicitado no coincide con lo informado; tesorería debe investigar la diferencia.",
    );
  });

  it("mantiene bloqueado un total exacto si hay filas sin socio asociado", () => {
    const batches = [
      createBatch("funs", "funs_sent"),
      createBatch("company", "company_result", 0, 1),
    ];
    const rows = [
      createRow("funs", 30_000),
      createRow("company", 30_000, "manual_review", ["member_not_found"]),
    ];

    const overview = buildReconciliationOverview(
      [cycle],
      cycle.id,
      batches,
      rows,
    );

    expect(overview.difference).toBe(0);
    expect(overview.canRunExactReconciliation).toBe(false);
    expect(overview.issues).toEqual([
      {
        code: "member_not_found",
        label: "Socio aún no asociado",
        count: 1,
      },
    ]);
  });

  it("excluye una carga reemplazada para no duplicar montos", () => {
    const superseded = createBatch("company-old", "company_result");
    superseded.status = "superseded";
    superseded.source_files.uploaded_at = "2026-07-01T10:00:00Z";
    const active = createBatch("company-new", "company_result");
    active.source_files.uploaded_at = "2026-07-02T10:00:00Z";
    const rows = [
      createRow("company-old", 99_000),
      createRow("company-new", 30_000),
    ];

    const overview = buildReconciliationOverview(
      [cycle],
      cycle.id,
      [superseded, active],
      rows,
    );

    expect(overview.reportedAgreementAmount).toBe(30_000);
    expect(
      overview.sources.find((source) => source.kind === "company_result")
        ?.fileCount,
    ).toBe(1);
  });
});

function createBatch(
  id: string,
  kind: SourceFileKind,
  acceptedRows = 1,
  rejectedRows = 0,
): ReconciliationBatch {
  return {
    id,
    status: "processed",
    detected_rows: acceptedRows + rejectedRows,
    accepted_rows: acceptedRows,
    rejected_rows: rejectedRows,
    detected_total: 30_000,
    created_at: "2026-07-02T10:00:00Z",
    source_files: {
      id: `source-${id}`,
      original_name: `${id}.xlsx`,
      kind,
      uploaded_at: "2026-07-02T10:00:00Z",
      provider_id: kind === "provider_plan" ? "provider-one" : null,
    },
  };
}

function createRow(
  batchId: string,
  amount: number,
  validationStatus: ReconciliationStagedRow["validation_status"] = "ready",
  issueCodes: string[] = [],
): ReconciliationStagedRow {
  return {
    batch_id: batchId,
    amount,
    record_type: "agreement",
    validation_status: validationStatus,
    issue_codes: issueCodes,
  };
}
