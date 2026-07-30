export type SourceFileKind =
  | "provider_plan"
  | "funs_sent"
  | "company_result"
  | "bank_statement";

export type ImportRecordType = "social_fee" | "agreement" | "unknown";

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
  source_files: {
    id: string;
    original_name: string;
    kind: SourceFileKind;
    uploaded_at: string;
    sha256: string;
    provider_id: string | null;
  } | null;
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
  parsed: ParsedImportFile;
}

export interface UploadResult {
  sourceFileId: string;
  batchId: string;
  archivedOnly: boolean;
}
