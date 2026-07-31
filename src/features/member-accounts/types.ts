import type {
  ImportRecordType,
  ImportValidationStatus,
  SourceFileKind,
} from "../monthly-imports/types";

export interface MemberDirectoryItem {
  id: string;
  rut: string;
  full_name: string;
  status: "active" | "inactive" | "review";
  authorized_on: string | null;
  inactive_on: string | null;
}

export interface MemberStagedMovement {
  id: string;
  amount: number | null;
  record_type: ImportRecordType;
  category: string | null;
  validation_status: ImportValidationStatus;
  issue_codes: string[];
  import_batches: {
    source_files: {
      kind: SourceFileKind;
      uploaded_at: string;
      providers: { legal_name: string } | null;
      monthly_cycles: {
        discount_period: string;
        collection_period: string;
      } | null;
    };
  };
}

export interface MemberInstallment {
  id: string;
  installment_number: number;
  discount_period: string;
  amount: number;
  status:
    | "scheduled"
    | "submitted"
    | "discounted"
    | "not_discounted"
    | "provider_paid"
    | "union_assumed"
    | "cancelled";
}

export interface MemberAgreementOperation {
  id: string;
  purchased_on: string;
  total_amount: number;
  installment_count: number;
  status: "pending" | "active" | "completed" | "cancelled" | "union_assumed";
  providers: { legal_name: string };
  installments: MemberInstallment[];
}

export type MemberLedgerState =
  | "provider-reported"
  | "requested"
  | "discounted"
  | "manual-review";

export interface MemberLedgerMovement {
  id: string;
  period: string | null;
  collectionPeriod: string | null;
  label: string;
  detail: string;
  amount: number;
  state: MemberLedgerState;
  sourceKind: SourceFileKind;
}

export interface MemberOperationSummary {
  id: string;
  providerName: string;
  purchasedOn: string;
  totalAmount: number;
  paidAmount: number;
  overdueAmount: number;
  upcomingAmount: number;
  installmentCount: number;
  paidInstallments: number;
  status: MemberAgreementOperation["status"];
}

export interface MemberAccount {
  member: MemberDirectoryItem;
  movements: MemberLedgerMovement[];
  operations: MemberOperationSummary[];
  socialFeePaid: number;
  agreementsDiscounted: number;
  overdueDebt: number | null;
  upcomingInstallments: number | null;
  hasCanonicalDebtData: boolean;
}
