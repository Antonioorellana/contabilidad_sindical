import type {
  ImportRecordType,
  ImportValidationStatus,
  MonthlyCycle,
  SourceFileKind,
} from "../monthly-imports/types";

export type ReconciliationSourceStatus =
  | "missing"
  | "archived"
  | "needs-review"
  | "ready";

export type ComparisonStatus =
  | "blocked"
  | "needs-review"
  | "exact"
  | "difference"
  | "reference-only";

export interface ReconciliationBatch {
  id: string;
  status: string;
  detected_rows: number;
  accepted_rows: number;
  rejected_rows: number;
  detected_total: number | null;
  created_at: string;
  source_files: {
    id: string;
    original_name: string;
    kind: SourceFileKind;
    uploaded_at: string;
    provider_id: string | null;
  };
}

export interface ReconciliationStagedRow {
  batch_id: string;
  amount: number | null;
  record_type: ImportRecordType;
  validation_status: ImportValidationStatus;
  issue_codes: string[];
}

export interface ReconciliationSourceSummary {
  kind: SourceFileKind;
  label: string;
  description: string;
  fileCount: number;
  rowCount: number;
  readyRows: number;
  reviewRows: number;
  totalAmount: number;
  status: ReconciliationSourceStatus;
}

export interface ReconciliationComparison {
  id: "provider-to-funs" | "funs-to-company" | "social-fee" | "company-to-bank";
  label: string;
  detail: string;
  leftLabel: string;
  rightLabel: string;
  leftAmount: number | null;
  rightAmount: number | null;
  difference: number | null;
  status: ComparisonStatus;
}

export interface ReconciliationIssueSummary {
  code: string;
  label: string;
  count: number;
}

export interface ReconciliationOverview {
  cycles: MonthlyCycle[];
  selectedCycle: MonthlyCycle | null;
  sources: ReconciliationSourceSummary[];
  comparisons: ReconciliationComparison[];
  issues: ReconciliationIssueSummary[];
  requestedAgreementAmount: number | null;
  reportedAgreementAmount: number | null;
  difference: number | null;
  reviewRows: number;
  canRunExactReconciliation: boolean;
  blockers: string[];
}
