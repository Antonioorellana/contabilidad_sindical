export type ReconciliationDecision =
  | {
      kind: "automatic";
      requestedAmount: number;
      reportedAmount: number;
      difference: 0;
      installmentIds: string[];
    }
  | {
      kind: "manual-review";
      requestedAmount: number;
      reportedAmount: number | null;
      difference: number | null;
      reason: "missing-company-result" | "amount-mismatch";
    };

export interface RequestedInstallment {
  id: string;
  amount: number;
}

/**
 * Determines whether a consolidated company result can be distributed.
 *
 * No proportional or heuristic distribution is allowed: the result is
 * automatic only when the company total exactly matches the complete set of
 * requested installments.
 *
 * @param installments Installments included in the payroll request.
 * @param reportedAmount Consolidated amount returned by the employer.
 * @returns An automatic decision or a manual-review alert.
 * @throws {RangeError} When an installment or result contains an invalid CLP amount.
 */
export function decideReconciliation(
  installments: RequestedInstallment[],
  reportedAmount: number | null,
): ReconciliationDecision {
  if (
    installments.some(
      ({ amount }) => !Number.isSafeInteger(amount) || amount <= 0,
    )
  ) {
    throw new RangeError(
      "Todas las cuotas deben ser montos CLP enteros y positivos.",
    );
  }

  if (
    reportedAmount !== null &&
    (!Number.isSafeInteger(reportedAmount) || reportedAmount < 0)
  ) {
    throw new RangeError(
      "El monto informado debe ser un entero CLP no negativo.",
    );
  }

  const requestedAmount = installments.reduce(
    (total, installment) => total + installment.amount,
    0,
  );

  if (reportedAmount === null) {
    return {
      kind: "manual-review",
      requestedAmount,
      reportedAmount,
      difference: null,
      reason: "missing-company-result",
    };
  }

  const difference = reportedAmount - requestedAmount;
  if (difference !== 0) {
    return {
      kind: "manual-review",
      requestedAmount,
      reportedAmount,
      difference,
      reason: "amount-mismatch",
    };
  }

  return {
    kind: "automatic",
    requestedAmount,
    reportedAmount,
    difference: 0,
    installmentIds: installments.map(({ id }) => id),
  };
}
