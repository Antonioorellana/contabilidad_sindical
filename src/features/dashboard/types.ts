import type { MonthlyCycle } from "../monthly-imports/types";
import type {
  ReconciliationIssueSummary,
  ReconciliationSourceSummary,
} from "../reconciliation/types";

export interface DashboardActivity {
  id: string;
  fileName: string;
  kind: string;
  status: string;
  uploadedAt: string;
  detectedRows: number;
  reviewRows: number;
}

export interface DashboardSnapshot {
  cycle: MonthlyCycle | null;
  activeMemberCount: number;
  socialFeeAmount: number | null;
  agreementAmount: number | null;
  reviewRows: number;
  sources: ReconciliationSourceSummary[];
  issues: ReconciliationIssueSummary[];
  blockers: string[];
  activities: DashboardActivity[];
}
