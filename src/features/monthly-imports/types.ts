export type SourceFileKind =
  | "provider_plan"
  | "funs_sent"
  | "company_result"
  | "bank_statement";

export type ImportRecordType = "social_fee" | "agreement" | "unknown";
export type ImportValidationStatus = "ready" | "manual_review";
export type ImportReviewStatusFilter = "all" | ImportValidationStatus;
export type ImportRecordTypeFilter = "all" | ImportRecordType;

export interface MonthlyCycle {
  id: string;
  discount_period: string;
  collection_period: string;
  provider_deadline: string;
  employer_deadline: string;
  expected_deposit_deadline: string;
  status: string;
  is_pilot: boolean;
}

export interface Provider {
  id: string;
  legal_name: string;
  rut: string;
}

export interface ImportBatchSummary {
  id: string;
  status: string;
  detected_rows: number;
  accepted_rows: number;
  rejected_rows: number;
  detected_total: number | null;
  error_summary: Array<{ code: string; count: number }>;
  processed_at: string | null;
  superseded_at: string | null;
  superseded_reason: string | null;
  source_files: {
    id: string;
    original_name: string;
    kind: SourceFileKind;
    uploaded_at: string;
    sha256: string;
    provider_id: string | null;
  } | null;
}

export interface MemberRosterPreview {
  import_batch_id: string;
  source_file_name: string;
  discount_period: string;
  roster_rows: number;
  new_members: number;
  reactivated_members: number;
  renamed_members: number;
  inactivated_members: number;
  already_applied: boolean;
}

export interface MemberRosterSyncResult {
  id: string;
  import_batch_id: string;
  discount_period: string;
  roster_rows: number;
  new_members: number;
  reactivated_members: number;
  renamed_members: number;
  inactivated_members: number;
  synced_at: string;
}

export interface StagedImportRow {
  id: string;
  sheet_name: string;
  source_row_number: number;
  source_name: string | null;
  normalized_rut: string | null;
  amount: number | null;
  installment_number: number | null;
  installment_count: number | null;
  record_type: ImportRecordType;
  validation_status: ImportValidationStatus;
  issue_codes: string[];
}

export interface ImportReviewQuery {
  batchId: string;
  search: string;
  status: ImportReviewStatusFilter;
  recordType: ImportRecordTypeFilter;
  page: number;
  pageSize: number;
}

export interface ImportReviewPage {
  rows: StagedImportRow[];
  total: number;
  page: number;
  pageSize: number;
}

export interface StagedImportRowInput {
  sheetName: string;
  rowNumber: number;
  rut: string | null;
  name: string | null;
  amount: number | null;
  totalAmount: number | null;
  installmentNumber: number | null;
  installmentCount: number | null;
  discountPeriod: string | null;
  recordType: ImportRecordType;
  category: string | null;
  reference: string | null;
  issues: string[];
}

export interface ParsedImportFile {
  rows: StagedImportRowInput[];
  sheetCount: number;
  detectedTotal: number;
  canProcess: boolean;
  notice: string | null;
}

export interface UploadRequest {
  cycle: MonthlyCycle;
  providerId: string | null;
  kind: SourceFileKind;
  file: File;
  sha256: string;
  parsed: ParsedImportFile;
}

export interface UploadResult {
  sourceFileId: string;
  batchId: string;
  archivedOnly: boolean;
}
