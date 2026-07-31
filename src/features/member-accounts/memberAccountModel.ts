import type {
  MemberAccount,
  MemberAgreementOperation,
  MemberDirectoryItem,
  MemberLedgerMovement,
  MemberOperationSummary,
  MemberStagedMovement,
} from "./types";

const paidInstallmentStatuses = new Set(["discounted", "provider_paid"]);
const upcomingInstallmentStatuses = new Set(["scheduled", "submitted"]);

/**
 * Builds one bank-style member account without inferring unproven debt.
 *
 * Company-result rows prove payroll deductions. Outstanding debt is exposed
 * only when canonical agreement operations and installments exist.
 *
 * @param member Persistent member master record.
 * @param stagedMovements Imported evidence associated by normalized RUT.
 * @param agreementOperations Canonical provider operations, when available.
 * @returns Member totals, operation balances and chronological movements.
 */
export function buildMemberAccount(
  member: MemberDirectoryItem,
  stagedMovements: MemberStagedMovement[],
  agreementOperations: MemberAgreementOperation[],
): MemberAccount {
  const movements = stagedMovements
    .map(toLedgerMovement)
    .filter((movement): movement is MemberLedgerMovement => movement !== null)
    .sort((left, right) => {
      const periodComparison = (right.period ?? "").localeCompare(left.period ?? "");
      return periodComparison || right.id.localeCompare(left.id);
    });
  const operations = agreementOperations.map(summarizeOperation);
  const socialFeePaid = sumCompanyResults(
    stagedMovements,
    "social_fee",
  );
  const agreementsDiscounted = sumCompanyResults(
    stagedMovements,
    "agreement",
  );
  const hasCanonicalDebtData = operations.length > 0;

  return {
    member,
    movements,
    operations,
    socialFeePaid,
    agreementsDiscounted,
    overdueDebt: hasCanonicalDebtData
      ? operations.reduce(
          (total, operation) => total + operation.overdueAmount,
          0,
        )
      : null,
    upcomingInstallments: hasCanonicalDebtData
      ? operations.reduce(
          (total, operation) => total + operation.upcomingAmount,
          0,
        )
      : null,
    hasCanonicalDebtData,
  };
}

function toLedgerMovement(
  row: MemberStagedMovement,
): MemberLedgerMovement | null {
  if (row.amount === null) {
    return null;
  }

  const source = row.import_batches.source_files;
  const cycle = source.monthly_cycles;
  const isManualReview = row.validation_status === "manual_review";
  const common = {
    id: row.id,
    period: cycle?.discount_period ?? null,
    collectionPeriod: cycle?.collection_period ?? null,
    amount: row.amount,
    sourceKind: source.kind,
  };

  if (source.kind === "company_result") {
    return {
      ...common,
      label:
        row.record_type === "social_fee"
          ? "Cuota social descontada"
          : row.record_type === "agreement"
            ? "Convenios descontados por Jumbo"
            : "Descuento informado por Jumbo",
      detail:
        row.record_type === "agreement"
          ? "Monto consolidado; el proveedor se asignará con FUNS y planillas."
          : row.category ?? "Resultado mensual de la empresa",
      state: isManualReview ? "manual-review" : "discounted",
    };
  }

  if (source.kind === "funs_sent") {
    return {
      ...common,
      label: "Cobro enviado a Jumbo",
      detail: row.category ?? "Solicitud incluida en FUNS",
      state: isManualReview ? "manual-review" : "requested",
    };
  }

  if (source.kind === "provider_plan") {
    return {
      ...common,
      label: source.providers?.legal_name ?? "Cobro informado por proveedor",
      detail: row.category ?? "Cuota recibida para revisión",
      state: isManualReview ? "manual-review" : "provider-reported",
    };
  }

  return null;
}

function summarizeOperation(
  operation: MemberAgreementOperation,
): MemberOperationSummary {
  const paidInstallments = operation.installments.filter((installment) =>
    paidInstallmentStatuses.has(installment.status),
  );
  const overdueInstallments = operation.installments.filter(
    (installment) => installment.status === "not_discounted",
  );
  const upcomingInstallments = operation.installments.filter((installment) =>
    upcomingInstallmentStatuses.has(installment.status),
  );

  return {
    id: operation.id,
    providerName: operation.providers.legal_name,
    purchasedOn: operation.purchased_on,
    totalAmount: operation.total_amount,
    paidAmount: sumInstallments(paidInstallments),
    overdueAmount: sumInstallments(overdueInstallments),
    upcomingAmount: sumInstallments(upcomingInstallments),
    installmentCount: operation.installment_count,
    paidInstallments: paidInstallments.length,
    status: operation.status,
  };
}

function sumCompanyResults(
  rows: MemberStagedMovement[],
  recordType: "social_fee" | "agreement",
): number {
  return rows
    .filter(
      (row) =>
        row.import_batches.source_files.kind === "company_result" &&
        row.record_type === recordType &&
        row.validation_status === "ready",
    )
    .reduce((total, row) => total + (row.amount ?? 0), 0);
}

function sumInstallments(
  installments: MemberAgreementOperation["installments"],
): number {
  return installments.reduce(
    (total, installment) => total + installment.amount,
    0,
  );
}
