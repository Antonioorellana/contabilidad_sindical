import type { ImportRecordType, SourceFileKind } from "../monthly-imports/types";
import type {
  ComparisonStatus,
  ReconciliationBatch,
  ReconciliationComparison,
  ReconciliationIssueSummary,
  ReconciliationOverview,
  ReconciliationSourceStatus,
  ReconciliationSourceSummary,
  ReconciliationStagedRow,
} from "./types";
import type { MonthlyCycle } from "../monthly-imports/types";

const sourceDefinitions: Record<
  SourceFileKind,
  { label: string; description: string }
> = {
  provider_plan: {
    label: "Planillas de convenios",
    description: "Cobros recibidos desde cada proveedor",
  },
  funs_sent: {
    label: "FUNS enviado",
    description: "Solicitud consolidada enviada a Jumbo",
  },
  company_result: {
    label: "Resultado empresa",
    description: "Descuentos efectivamente aplicados",
  },
  bank_statement: {
    label: "Cartola bancaria",
    description: "Depósitos y pagos respaldados por Scotiabank",
  },
};

const issueLabels: Record<string, string> = {
  duplicate_row: "Fila duplicada",
  invalid_rut: "RUT inválido",
  member_not_found: "Socio aún no asociado",
  missing_or_invalid_amount: "Monto ausente o inválido",
  missing_rut: "RUT ausente",
  unknown_record_type: "Tipo de descuento no reconocido",
};

/**
 * Builds an accounting-safe reconciliation summary from staging data.
 *
 * Only the latest active singleton file and the latest file per provider are
 * considered. Superseded files remain auditable but never inflate totals.
 *
 * @param cycles Available monthly cycles.
 * @param selectedCycleId Cycle selected by the officer.
 * @param batches Registered source batches for the selected cycle.
 * @param rows Minimal staged fields, without member names or RUTs.
 * @returns Reconciliation readiness, comparisons and blocking reasons.
 */
export function buildReconciliationOverview(
  cycles: MonthlyCycle[],
  selectedCycleId: string | undefined,
  batches: ReconciliationBatch[],
  rows: ReconciliationStagedRow[],
): ReconciliationOverview {
  const selectedCycle =
    cycles.find((cycle) => cycle.id === selectedCycleId) ?? cycles[0] ?? null;
  const effectiveBatches = selectEffectiveBatches(batches);
  const effectiveBatchIds = new Set(effectiveBatches.map((batch) => batch.id));
  const effectiveRows = rows.filter((row) => effectiveBatchIds.has(row.batch_id));
  const sources = (Object.keys(sourceDefinitions) as SourceFileKind[]).map((kind) =>
    summarizeSource(kind, batches, effectiveBatches, effectiveRows),
  );
  const sourceByKind = new Map(sources.map((source) => [source.kind, source]));

  const providerAmount = sumRows(
    effectiveRows,
    batchIdsForKind(effectiveBatches, "provider_plan"),
    "agreement",
  );
  const funsAmount = sumRows(
    effectiveRows,
    batchIdsForKind(effectiveBatches, "funs_sent"),
    "agreement",
  );
  const companyAgreementAmount = sumRows(
    effectiveRows,
    batchIdsForKind(effectiveBatches, "company_result"),
    "agreement",
  );
  const companySocialAmount = sumRows(
    effectiveRows,
    batchIdsForKind(effectiveBatches, "company_result"),
    "social_fee",
  );
  const companyTotal = sumRows(
    effectiveRows,
    batchIdsForKind(effectiveBatches, "company_result"),
  );
  const bankTotal = sumRows(
    effectiveRows,
    batchIdsForKind(effectiveBatches, "bank_statement"),
  );

  const comparisons: ReconciliationComparison[] = [
    createComparison({
      id: "provider-to-funs",
      label: "Convenios → FUNS",
      detail: "Confirma que lo recibido de proveedores fue solicitado a Jumbo.",
      leftLabel: "Proveedores",
      rightLabel: "FUNS",
      leftAmount: amountWhenParsed(sourceByKind.get("provider_plan"), providerAmount),
      rightAmount: amountWhenParsed(sourceByKind.get("funs_sent"), funsAmount),
      leftSource: sourceByKind.get("provider_plan"),
      rightSource: sourceByKind.get("funs_sent"),
    }),
    createComparison({
      id: "funs-to-company",
      label: "FUNS → descuentos",
      detail: "La distribución por socio sólo puede ejecutarse con coincidencia exacta.",
      leftLabel: "Solicitado",
      rightLabel: "Informado",
      leftAmount: amountWhenParsed(sourceByKind.get("funs_sent"), funsAmount),
      rightAmount: amountWhenParsed(
        sourceByKind.get("company_result"),
        companyAgreementAmount,
      ),
      leftSource: sourceByKind.get("funs_sent"),
      rightSource: sourceByKind.get("company_result"),
    }),
    {
      id: "social-fee",
      label: "Cuota social",
      detail:
        "El resultado informado queda como referencia hasta cargar y validar la nómina maestra de socios.",
      leftLabel: "Esperado",
      rightLabel: "Informado",
      leftAmount: null,
      rightAmount: amountWhenParsed(
        sourceByKind.get("company_result"),
        companySocialAmount,
      ),
      difference: null,
      status: companySocialAmount > 0 ? "reference-only" : "blocked",
    },
    createComparison({
      id: "company-to-bank",
      label: "Empresa → banco",
      detail: "Verifica que los dos depósitos de Jumbo aparezcan en la cartola.",
      leftLabel: "Empresa",
      rightLabel: "Banco",
      leftAmount: amountWhenParsed(sourceByKind.get("company_result"), companyTotal),
      rightAmount: amountWhenParsed(sourceByKind.get("bank_statement"), bankTotal),
      leftSource: sourceByKind.get("company_result"),
      rightSource: sourceByKind.get("bank_statement"),
    }),
  ];

  const funsSource = sourceByKind.get("funs_sent");
  const companySource = sourceByKind.get("company_result");
  const requestedAgreementAmount = amountWhenParsed(funsSource, funsAmount);
  const reportedAgreementAmount = amountWhenParsed(
    companySource,
    companyAgreementAmount,
  );
  const difference =
    requestedAgreementAmount !== null && reportedAgreementAmount !== null
      ? reportedAgreementAmount - requestedAgreementAmount
      : null;
  const relevantComparison = comparisons.find(
    (comparison) => comparison.id === "funs-to-company",
  );
  const blockers = buildBlockers(sources, batches, relevantComparison?.status);

  return {
    cycles,
    selectedCycle,
    sources,
    comparisons,
    issues: summarizeIssues(effectiveRows),
    requestedAgreementAmount,
    reportedAgreementAmount,
    difference,
    reviewRows: effectiveRows.filter(
      (row) => row.validation_status === "manual_review",
    ).length,
    canRunExactReconciliation: relevantComparison?.status === "exact",
    blockers,
  };
}

function selectEffectiveBatches(
  batches: ReconciliationBatch[],
): ReconciliationBatch[] {
  const activeBatches = batches
    .filter((batch) => batch.status !== "superseded")
    .sort(
      (left, right) =>
        new Date(right.source_files.uploaded_at).getTime() -
        new Date(left.source_files.uploaded_at).getTime(),
    );
  const selected = new Map<string, ReconciliationBatch>();

  for (const batch of activeBatches) {
    const key =
      batch.source_files.kind === "provider_plan"
        ? `provider_plan:${batch.source_files.provider_id ?? "unassigned"}`
        : batch.source_files.kind;

    if (!selected.has(key)) {
      selected.set(key, batch);
    }
  }

  return [...selected.values()];
}

function summarizeSource(
  kind: SourceFileKind,
  allBatches: ReconciliationBatch[],
  effectiveBatches: ReconciliationBatch[],
  rows: ReconciliationStagedRow[],
): ReconciliationSourceSummary {
  const activeFiles = allBatches.filter(
    (batch) =>
      batch.status !== "superseded" && batch.source_files.kind === kind,
  );
  const selectedBatchIds = batchIdsForKind(effectiveBatches, kind);
  const sourceRows = rows.filter((row) => selectedBatchIds.has(row.batch_id));
  const readyRows = sourceRows.filter(
    (row) => row.validation_status === "ready",
  ).length;
  const reviewRows = sourceRows.length - readyRows;
  const status = getSourceStatus(activeFiles.length, sourceRows.length, reviewRows);

  return {
    kind,
    ...sourceDefinitions[kind],
    fileCount: activeFiles.length,
    rowCount: sourceRows.length,
    readyRows,
    reviewRows,
    totalAmount: sourceRows.reduce(
      (total, row) => total + (row.amount ?? 0),
      0,
    ),
    status,
  };
}

function getSourceStatus(
  fileCount: number,
  rowCount: number,
  reviewRows: number,
): ReconciliationSourceStatus {
  if (fileCount === 0) {
    return "missing";
  }
  if (rowCount === 0) {
    return "archived";
  }
  if (reviewRows > 0) {
    return "needs-review";
  }
  return "ready";
}

function amountWhenParsed(
  source: ReconciliationSourceSummary | undefined,
  amount: number,
): number | null {
  return source && source.rowCount > 0 ? amount : null;
}

function batchIdsForKind(
  batches: ReconciliationBatch[],
  kind: SourceFileKind,
): Set<string> {
  return new Set(
    batches
      .filter((batch) => batch.source_files.kind === kind)
      .map((batch) => batch.id),
  );
}

function sumRows(
  rows: ReconciliationStagedRow[],
  batchIds: Set<string>,
  recordType?: ImportRecordType,
): number {
  return rows
    .filter(
      (row) =>
        batchIds.has(row.batch_id) &&
        (recordType === undefined || row.record_type === recordType),
    )
    .reduce((total, row) => total + (row.amount ?? 0), 0);
}

function createComparison(input: {
  id: ReconciliationComparison["id"];
  label: string;
  detail: string;
  leftLabel: string;
  rightLabel: string;
  leftAmount: number | null;
  rightAmount: number | null;
  leftSource: ReconciliationSourceSummary | undefined;
  rightSource: ReconciliationSourceSummary | undefined;
}): ReconciliationComparison {
  const difference =
    input.leftAmount !== null && input.rightAmount !== null
      ? input.rightAmount - input.leftAmount
      : null;
  const status = getComparisonStatus(
    input.leftSource,
    input.rightSource,
    difference,
  );

  return {
    id: input.id,
    label: input.label,
    detail: input.detail,
    leftLabel: input.leftLabel,
    rightLabel: input.rightLabel,
    leftAmount: input.leftAmount,
    rightAmount: input.rightAmount,
    difference,
    status,
  };
}

function getComparisonStatus(
  leftSource: ReconciliationSourceSummary | undefined,
  rightSource: ReconciliationSourceSummary | undefined,
  difference: number | null,
): ComparisonStatus {
  if (
    !leftSource ||
    !rightSource ||
    leftSource.status === "missing" ||
    rightSource.status === "missing" ||
    leftSource.status === "archived" ||
    rightSource.status === "archived" ||
    difference === null
  ) {
    return "blocked";
  }
  if (
    leftSource.status === "needs-review" ||
    rightSource.status === "needs-review"
  ) {
    return "needs-review";
  }
  return difference === 0 ? "exact" : "difference";
}

function summarizeIssues(
  rows: ReconciliationStagedRow[],
): ReconciliationIssueSummary[] {
  const counts = new Map<string, number>();

  for (const row of rows) {
    for (const code of row.issue_codes) {
      counts.set(code, (counts.get(code) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .map(([code, count]) => ({
      code,
      count,
      label: issueLabels[code] ?? code.replace(/_/g, " "),
    }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label));
}

function buildBlockers(
  sources: ReconciliationSourceSummary[],
  batches: ReconciliationBatch[],
  comparisonStatus: ComparisonStatus | undefined,
): string[] {
  const blockers: string[] = [];
  const sourceByKind = new Map(sources.map((source) => [source.kind, source]));
  const funs = sourceByKind.get("funs_sent");
  const company = sourceByKind.get("company_result");

  if (!funs || funs.status === "missing") {
    blockers.push("Falta cargar el FUNS enviado a Jumbo.");
  } else if (funs.status === "archived") {
    blockers.push("El FUNS está archivado, pero sus filas aún no fueron interpretadas.");
  }
  if (!company || company.status === "missing") {
    blockers.push("Falta cargar el resultado mensual entregado por Jumbo.");
  } else if (company.status === "archived") {
    blockers.push(
      "El resultado de Jumbo está archivado, pero sus filas aún no fueron interpretadas.",
    );
  }
  if (
    funs?.status === "needs-review" ||
    company?.status === "needs-review"
  ) {
    blockers.push(
      "Existen filas en revisión manual; no se crearán cuotas ni asignaciones hasta resolverlas.",
    );
  }
  if (comparisonStatus === "difference") {
    blockers.push(
      "El total solicitado no coincide con lo informado; tesorería debe investigar la diferencia.",
    );
  }

  const duplicateSingleton = (
    ["funs_sent", "company_result", "bank_statement"] as SourceFileKind[]
  ).some(
    (kind) =>
      batches.filter(
        (batch) =>
          batch.status !== "superseded" && batch.source_files.kind === kind,
      ).length > 1,
  );
  if (duplicateSingleton) {
    blockers.push(
      "Hay más de un archivo activo para una fuente única; debe definirse cuál reemplaza al anterior.",
    );
  }

  return blockers;
}
