import { supabase } from "../../lib/supabase";
import type { MonthlyCycle } from "../monthly-imports/types";
import { buildReconciliationOverview } from "./reconciliationModel";
import type {
  ReconciliationBatch,
  ReconciliationOverview,
  ReconciliationStagedRow,
} from "./types";

const PAGE_SIZE = 1000;
const MAX_STAGED_ROWS = 5000;

/**
 * Loads the minimal dataset required by the reconciliation workspace.
 *
 * Member names and RUTs are intentionally excluded because this screen only
 * needs financial aggregates and validation codes.
 *
 * @param cycleId Optional cycle selected by the officer.
 * @returns Reconciliation overview calculated from active source files.
 */
export async function loadReconciliationOverview(
  cycleId?: string,
): Promise<ReconciliationOverview> {
  const client = requireSupabase();
  const { data: cyclesData, error: cyclesError } = await client
    .from("monthly_cycles")
    .select("*")
    .order("discount_period", { ascending: false });

  if (cyclesError) {
    throw new Error(`No fue posible cargar los ciclos: ${cyclesError.message}`);
  }

  const cycles = (cyclesData ?? []) as MonthlyCycle[];
  const selectedCycle =
    cycles.find((cycle) => cycle.id === cycleId) ?? cycles[0] ?? null;

  if (!selectedCycle) {
    return buildReconciliationOverview(cycles, cycleId, [], []);
  }

  const { data: batchesData, error: batchesError } = await client
    .from("import_batches")
    .select(`
      id,
      status,
      detected_rows,
      accepted_rows,
      rejected_rows,
      detected_total,
      created_at,
      source_files!inner (
        id,
        original_name,
        kind,
        uploaded_at,
        provider_id,
        cycle_id
      )
    `)
    .eq("source_files.cycle_id", selectedCycle.id)
    .order("created_at", { ascending: false })
    .limit(100);

  if (batchesError) {
    throw new Error(`No fue posible cargar las fuentes: ${batchesError.message}`);
  }

  const batches = (batchesData ?? []) as unknown as ReconciliationBatch[];
  const batchIds = batches.map((batch) => batch.id);
  const rows = await loadStagedRows(batchIds);

  return buildReconciliationOverview(
    cycles,
    selectedCycle.id,
    batches,
    rows,
  );
}

async function loadStagedRows(
  batchIds: string[],
): Promise<ReconciliationStagedRow[]> {
  if (batchIds.length === 0) {
    return [];
  }

  const client = requireSupabase();
  const rows: ReconciliationStagedRow[] = [];

  for (let from = 0; from < MAX_STAGED_ROWS; from += PAGE_SIZE) {
    const { data, error } = await client
      .from("staged_import_rows")
      .select("batch_id,amount,record_type,validation_status,issue_codes")
      .in("batch_id", batchIds)
      .order("created_at", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      throw new Error(
        `No fue posible resumir las filas prevalidadas: ${error.message}`,
      );
    }

    const page = (data ?? []) as ReconciliationStagedRow[];
    rows.push(...page);

    if (page.length < PAGE_SIZE) {
      return rows;
    }
  }

  throw new Error(
    `La conciliación supera el límite seguro de ${MAX_STAGED_ROWS} filas por ciclo.`,
  );
}

function requireSupabase() {
  if (!supabase) {
    throw new Error("Supabase no está configurado.");
  }

  return supabase;
}
