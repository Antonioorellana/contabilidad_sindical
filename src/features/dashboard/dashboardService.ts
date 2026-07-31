import { supabase } from "../../lib/supabase";
import { loadReconciliationOverview } from "../reconciliation/reconciliationService";
import type { DashboardActivity, DashboardSnapshot } from "./types";

/**
 * Loads the operational dashboard exclusively from persisted Supabase data.
 *
 * @returns Current roster, latest cycle, source coverage and recent evidence.
 */
export async function loadDashboardSnapshot(): Promise<DashboardSnapshot> {
  const client = requireSupabase();
  const [memberResult, overview, activityResult] = await Promise.all([
    client
      .from("members")
      .select("id", { count: "exact", head: true })
      .eq("status", "active"),
    loadReconciliationOverview(),
    client
      .from("import_batches")
      .select(`
        id,
        status,
        detected_rows,
        rejected_rows,
        source_files!inner (
          original_name,
          kind,
          uploaded_at
        )
      `)
      .order("created_at", { ascending: false })
      .limit(8),
  ]);

  const error = memberResult.error ?? activityResult.error;
  if (error) {
    throw new Error(`No fue posible cargar el resumen real: ${error.message}`);
  }

  const socialFeeComparison = overview.comparisons.find(
    (comparison) => comparison.id === "social-fee",
  );

  return {
    cycle: overview.selectedCycle,
    activeMemberCount: memberResult.count ?? 0,
    socialFeeAmount: socialFeeComparison?.rightAmount ?? null,
    agreementAmount: overview.reportedAgreementAmount,
    reviewRows: overview.reviewRows,
    sources: overview.sources,
    issues: overview.issues,
    blockers: overview.blockers,
    activities: (activityResult.data ?? []).map((row) => {
      const source = Array.isArray(row.source_files)
        ? row.source_files[0]
        : row.source_files;

      return {
        id: row.id,
        fileName: source?.original_name ?? "Archivo protegido",
        kind: source?.kind ?? "other",
        status: row.status,
        uploadedAt: source?.uploaded_at ?? "",
        detectedRows: row.detected_rows,
        reviewRows: row.rejected_rows,
      } satisfies DashboardActivity;
    }),
  };
}

function requireSupabase() {
  if (!supabase) {
    throw new Error("Supabase no está configurado.");
  }

  return supabase;
}
