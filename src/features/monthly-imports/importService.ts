import { supabase } from "../../lib/supabase";
import {
  calculateSha256,
  getFileExtension,
  sanitizeFileName,
  validateImportFile,
} from "./fileIntegrity";
import type {
  ImportBatchSummary,
  MonthlyCycle,
  Provider,
  UploadRequest,
  UploadResult,
} from "./types";

const PRIVATE_BUCKET = "accounting-private";

interface MonthlyContext {
  cycles: MonthlyCycle[];
  providers: Provider[];
  batches: ImportBatchSummary[];
}

/**
 * Loads the monthly import screen data in parallel.
 *
 * @param cycleId - Optional cycle used to restrict batch history.
 * @returns Cycles, active providers and recent imports.
 */
export async function loadMonthlyContext(cycleId?: string): Promise<MonthlyContext> {
  const client = requireSupabase();

  let batchesQuery = client
    .from("import_batches")
    .select(`
      id,
      status,
      detected_rows,
      accepted_rows,
      rejected_rows,
      detected_total,
      error_summary,
      processed_at,
      source_files!inner (
        id,
        original_name,
        kind,
        uploaded_at,
        sha256,
        provider_id,
        cycle_id
      )
    `)
    .order("created_at", { ascending: false })
    .limit(20);

  if (cycleId) {
    batchesQuery = batchesQuery.eq("source_files.cycle_id", cycleId);
  }

  const [cyclesResult, providersResult, batchesResult] = await Promise.all([
    client
      .from("monthly_cycles")
      .select("*")
      .order("discount_period", { ascending: false }),
    client
      .from("providers")
      .select("id,legal_name,rut")
      .eq("is_active", true)
      .order("legal_name"),
    batchesQuery,
  ]);

  const error = cyclesResult.error ?? providersResult.error ?? batchesResult.error;
  if (error) {
    throw new Error(error.message);
  }

  return {
    cycles: (cyclesResult.data ?? []) as MonthlyCycle[],
    providers: (providersResult.data ?? []) as Provider[],
    batches: (batchesResult.data ?? []) as unknown as ImportBatchSummary[],
  };
}

/**
 * Creates a monthly cycle whose collection occurs the following month.
 *
 * @param discountPeriod - First day of the discount month, YYYY-MM-01.
 * @returns Newly created cycle.
 */
export async function createMonthlyCycle(discountPeriod: string): Promise<MonthlyCycle> {
  const client = requireSupabase();
  const [year, month] = discountPeriod.split("-").map(Number);

  if (!year || !month || month < 1 || month > 12 || !discountPeriod.endsWith("-01")) {
    throw new Error("El periodo debe ser el primer día de un mes válido.");
  }

  const discountMonthIndex = month - 1;
  const collectionDate = new Date(year, discountMonthIndex + 1, 1);
  const providerDeadline = new Date(year, discountMonthIndex, 7, 23, 59, 59);
  const employerDeadline = new Date(year, discountMonthIndex, 9, 12, 0, 0);
  const expectedDeposit = new Date(year, discountMonthIndex + 1, 5);
  const toDate = (date: Date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
      date.getDate(),
    ).padStart(2, "0")}`;

  const { data, error } = await client
    .from("monthly_cycles")
    .insert({
      discount_period: discountPeriod,
      collection_period: toDate(collectionDate),
      provider_deadline: providerDeadline.toISOString(),
      employer_deadline: employerDeadline.toISOString(),
      expected_deposit_deadline: toDate(expectedDeposit),
      status: "draft",
      is_pilot: discountPeriod === "2026-07-01" || discountPeriod === "2026-08-01",
    })
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data as MonthlyCycle;
}

/**
 * Uploads the immutable original, registers its SHA-256 and stages parsed rows.
 *
 * @param request - Validated business and file metadata.
 * @returns Identifiers for the registered source file and import batch.
 */
export async function uploadMonthlyFile(request: UploadRequest): Promise<UploadResult> {
  const client = requireSupabase();
  validateImportFile(request.file);

  if (request.kind === "provider_plan" && !request.providerId) {
    throw new Error("Selecciona el convenio que envió la planilla.");
  }

  const sha256 = await calculateSha256(request.file);
  const providerSegment = request.providerId ?? "general";
  const storagePath = [
    request.cycle.discount_period,
    request.kind,
    providerSegment,
    `${sha256}-${sanitizeFileName(request.file.name)}`,
  ].join("/");
  const mediaType = request.file.type || inferMediaType(request.file.name);

  const { error: uploadError } = await client.storage
    .from(PRIVATE_BUCKET)
    .upload(storagePath, request.file, {
      contentType: mediaType,
      upsert: false,
    });

  if (uploadError) {
    throw new Error(`No fue posible guardar el original: ${uploadError.message}`);
  }

  const { data: registrationData, error: registrationError } = await client.rpc(
    "register_monthly_source_file",
    {
      p_cycle_id: request.cycle.id,
      p_provider_id: request.providerId,
      p_kind: request.kind,
      p_original_name: request.file.name,
      p_storage_path: storagePath,
      p_media_type: mediaType,
      p_size_bytes: request.file.size,
      p_sha256: sha256,
    },
  );

  if (registrationError) {
    await client.storage.from(PRIVATE_BUCKET).remove([storagePath]);
    throw new Error(`El archivo no pudo registrarse: ${registrationError.message}`);
  }

  const registration = Array.isArray(registrationData)
    ? registrationData[0]
    : registrationData;
  const sourceFileId = registration?.source_file_id as string | undefined;
  const batchId = registration?.import_batch_id as string | undefined;

  if (!sourceFileId || !batchId) {
    throw new Error("La base de datos no devolvió los identificadores de la carga.");
  }

  if (!request.parsed.canProcess) {
    return {
      sourceFileId,
      batchId,
      archivedOnly: true,
    };
  }

  const { error: ingestError } = await client.rpc("ingest_staged_import_rows", {
    p_import_batch_id: batchId,
    p_rows: request.parsed.rows,
  });

  if (ingestError) {
    throw new Error(
      `El original quedó protegido, pero sus filas no pudieron procesarse: ${ingestError.message}`,
    );
  }

  return {
    sourceFileId,
    batchId,
    archivedOnly: false,
  };
}

function requireSupabase() {
  if (!supabase) {
    throw new Error("Supabase no está configurado.");
  }

  return supabase;
}

function inferMediaType(fileName: string): string {
  const extension = getFileExtension(fileName);
  const mediaTypes: Record<string, string> = {
    csv: "text/csv",
    pdf: "application/pdf",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  };

  return mediaTypes[extension] ?? "application/octet-stream";
}
