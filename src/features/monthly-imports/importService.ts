import { supabase } from "../../lib/supabase";
import {
  getFileExtension,
  sanitizeFileName,
  validateImportFile,
} from "./fileIntegrity";
import type {
  ImportBatchSummary,
  ImportReviewPage,
  ImportReviewQuery,
  MemberRosterPreview,
  MemberRosterSyncResult,
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

interface ExistingUpload {
  sourceFileId: string;
  batchId: string;
  batchStatus: string;
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
      superseded_at,
      superseded_reason,
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
 * Previews the exact effect of using one Jumbo result as the active roster.
 *
 * @param importBatchId Processed company-result batch.
 * @returns Counts that must be reviewed before applying the roster.
 */
export async function previewMemberRosterSync(
  importBatchId: string,
): Promise<MemberRosterPreview> {
  const client = requireSupabase();
  const { data, error } = await client.rpc("preview_member_roster_sync", {
    p_import_batch_id: importBatchId,
  });

  if (error) {
    throw new Error(`No fue posible preparar el padrón: ${error.message}`);
  }

  const preview = Array.isArray(data) ? data[0] : data;
  if (!preview) {
    throw new Error("La carga no contiene una nómina social válida.");
  }

  return preview as MemberRosterPreview;
}

/**
 * Applies a previously reviewed roster preview with an optimistic safety check.
 *
 * @param importBatchId Processed company-result batch.
 * @param expectedInactivatedMembers Count confirmed by the treasurer.
 * @returns Auditable roster synchronization record.
 */
export async function applyMemberRosterSync(
  importBatchId: string,
  expectedInactivatedMembers: number,
): Promise<MemberRosterSyncResult> {
  const client = requireSupabase();
  const { data, error } = await client.rpc("apply_member_roster_sync", {
    p_import_batch_id: importBatchId,
    p_expected_inactivated_members: expectedInactivatedMembers,
  });

  if (error) {
    throw new Error(`No fue posible actualizar el padrón: ${error.message}`);
  }

  if (!data) {
    throw new Error("La base de datos no confirmó la actualización del padrón.");
  }

  return data as MemberRosterSyncResult;
}

/**
 * Excludes a source batch from calculations while preserving its immutable evidence.
 *
 * @param importBatchId Batch to supersede.
 * @param reason Human-authored audit reason.
 */
export async function supersedeImportBatch(
  importBatchId: string,
  reason: string,
): Promise<void> {
  const client = requireSupabase();
  const normalizedReason = reason.trim();
  if (normalizedReason.length < 5 || normalizedReason.length > 500) {
    throw new Error("Indica un motivo de entre 5 y 500 caracteres.");
  }

  const { error } = await client.rpc("supersede_import_batch", {
    p_import_batch_id: importBatchId,
    p_reason: normalizedReason,
  });

  if (error) {
    throw new Error(`No fue posible descartar la carga: ${error.message}`);
  }
}

/**
 * Loads one page of prevalidated rows without creating accounting records.
 *
 * @param reviewQuery - Batch, search terms, filters and pagination boundaries.
 * @returns Matching staged rows and their exact total.
 */
export async function loadImportReviewPage(
  reviewQuery: ImportReviewQuery,
): Promise<ImportReviewPage> {
  const client = requireSupabase();
  const page = Math.max(1, Math.trunc(reviewQuery.page));
  const pageSize = Math.min(100, Math.max(10, Math.trunc(reviewQuery.pageSize)));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let rowsQuery = client
    .from("staged_import_rows")
    .select(
      `
        id,
        sheet_name,
        source_row_number,
        source_name,
        normalized_rut,
        amount,
        installment_number,
        installment_count,
        record_type,
        validation_status,
        issue_codes
      `,
      { count: "exact" },
    )
    .eq("batch_id", reviewQuery.batchId)
    .order("sheet_name", { ascending: true })
    .order("source_row_number", { ascending: true })
    .range(from, to);

  if (reviewQuery.status !== "all") {
    rowsQuery = rowsQuery.eq("validation_status", reviewQuery.status);
  }

  if (reviewQuery.recordType !== "all") {
    rowsQuery = rowsQuery.eq("record_type", reviewQuery.recordType);
  }

  const searchFilter = buildImportReviewSearchFilter(reviewQuery.search);
  if (searchFilter) {
    rowsQuery = rowsQuery.or(searchFilter);
  }

  const { data, error, count } = await rowsQuery;
  if (error) {
    throw new Error(`No fue posible consultar las filas: ${error.message}`);
  }

  return {
    rows: data ?? [],
    total: count ?? 0,
    page,
    pageSize,
  };
}

/**
 * Builds a safe PostgREST OR filter for a Chilean RUT or member name.
 *
 * @param rawSearch - User-provided search text.
 * @returns A filter expression or an empty string when no searchable text remains.
 */
export function buildImportReviewSearchFilter(rawSearch: string): string {
  const normalizedText = rawSearch
    .normalize("NFKC")
    .trim()
    .slice(0, 80);

  if (!normalizedText) {
    return "";
  }

  const filters: string[] = [];
  const safeName = normalizedText
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (safeName) {
    filters.push(`source_name.ilike.%${safeName}%`);
  }

  const compactRut = normalizedText
    .toUpperCase()
    .replace(/[^0-9K]/g, "");

  if (compactRut.length >= 2) {
    const normalizedRut = `${compactRut.slice(0, -1)}-${compactRut.slice(-1)}`;
    filters.push(`normalized_rut.ilike.%${compactRut}%`);
    filters.push(`normalized_rut.ilike.%${normalizedRut}%`);
  }

  return filters.join(",");
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

  const sha256 = request.sha256;
  if (!/^[a-f0-9]{64}$/.test(sha256)) {
    throw new Error("La huella de integridad del archivo no es válida.");
  }

  const providerSegment = request.providerId ?? "general";
  const storagePath = [
    request.cycle.discount_period,
    request.kind,
    providerSegment,
    `${sha256}-${sanitizeFileName(request.file.name)}`,
  ].join("/");
  const mediaType = request.file.type || inferMediaType(request.file.name);

  const existingUpload = await findExistingUpload(client, request, sha256);
  if (existingUpload) {
    return stageParsedRows(client, request, existingUpload);
  }

  await storeOriginal(client, storagePath, request.file, mediaType, request, sha256);

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
    const concurrentUpload = await findExistingUpload(client, request, sha256);
    if (concurrentUpload) {
      return stageParsedRows(client, request, concurrentUpload);
    }

    await client.storage.from(PRIVATE_BUCKET).remove([storagePath]);
    throw new Error(`El archivo no pudo registrarse: ${registrationError.message}`);
  }

  const registration = Array.isArray(registrationData)
    ? registrationData[0]
    : registrationData;
  const sourceFileId = registration?.source_file_id as string | undefined;
  const batchId = registration?.import_batch_id as string | undefined;

  if (!sourceFileId || !batchId) {
    const recoveredUpload = await findExistingUpload(client, request, sha256);
    if (recoveredUpload) {
      return stageParsedRows(client, request, recoveredUpload);
    }

    await client.storage.from(PRIVATE_BUCKET).remove([storagePath]);
    throw new Error("La base de datos no devolvió los identificadores de la carga.");
  }

  return stageParsedRows(client, request, {
    sourceFileId,
    batchId,
    batchStatus: "uploaded",
  });
}

async function storeOriginal(
  client: ReturnType<typeof requireSupabase>,
  storagePath: string,
  file: File,
  mediaType: string,
  request: UploadRequest,
  sha256: string,
): Promise<void> {
  const upload = () =>
    client.storage.from(PRIVATE_BUCKET).upload(storagePath, file, {
      contentType: mediaType,
      upsert: false,
    });

  const { error: uploadError } = await upload();
  if (!uploadError) {
    return;
  }

  if (!isStorageConflict(uploadError)) {
    throw new Error(`No fue posible guardar el original: ${uploadError.message}`);
  }

  const registeredUpload = await findExistingUpload(client, request, sha256);
  if (registeredUpload) {
    return;
  }

  const { error: cleanupError } = await client.storage
    .from(PRIVATE_BUCKET)
    .remove([storagePath]);

  if (cleanupError) {
    throw new Error(
      "Existe una carga incompleta del mismo archivo y no fue posible recuperarla automáticamente.",
    );
  }

  const { error: retryError } = await upload();
  if (retryError) {
    throw new Error(`No fue posible guardar el original: ${retryError.message}`);
  }
}

async function findExistingUpload(
  client: ReturnType<typeof requireSupabase>,
  request: UploadRequest,
  sha256: string,
): Promise<ExistingUpload | null> {
  let sourceQuery = client
    .from("source_files")
    .select("id")
    .eq("cycle_id", request.cycle.id)
    .eq("kind", request.kind)
    .eq("sha256", sha256);

  sourceQuery = request.providerId
    ? sourceQuery.eq("provider_id", request.providerId)
    : sourceQuery.is("provider_id", null);

  const { data: sourceFile, error: sourceError } = await sourceQuery.maybeSingle();
  if (sourceError) {
    throw new Error(`No fue posible revisar cargas anteriores: ${sourceError.message}`);
  }
  if (!sourceFile) {
    return null;
  }

  const { data: batch, error: batchError } = await client
    .from("import_batches")
    .select("id,status")
    .eq("source_file_id", sourceFile.id)
    .maybeSingle();

  if (batchError) {
    throw new Error(`No fue posible revisar la prevalidación existente: ${batchError.message}`);
  }
  if (!batch) {
    throw new Error(
      "El original ya está registrado, pero su prevalidación requiere reparación manual.",
    );
  }

  return {
    sourceFileId: sourceFile.id,
    batchId: batch.id,
    batchStatus: batch.status,
  };
}

async function stageParsedRows(
  client: ReturnType<typeof requireSupabase>,
  request: UploadRequest,
  upload: ExistingUpload,
): Promise<UploadResult> {
  if (!request.parsed.canProcess) {
    return {
      sourceFileId: upload.sourceFileId,
      batchId: upload.batchId,
      archivedOnly: true,
    };
  }

  if (
    upload.batchStatus === "processed" ||
    upload.batchStatus === "superseded"
  ) {
    return {
      sourceFileId: upload.sourceFileId,
      batchId: upload.batchId,
      archivedOnly: false,
    };
  }

  if (upload.batchStatus === "processing") {
    throw new Error(
      "Este archivo ya se está prevalidando. Espera unos segundos y actualiza la pantalla.",
    );
  }

  if (upload.batchStatus !== "uploaded" && upload.batchStatus !== "failed") {
    throw new Error("La carga existente tiene un estado que requiere revisión manual.");
  }

  const { error: ingestError } = await client.rpc("ingest_staged_import_rows", {
    p_import_batch_id: upload.batchId,
    p_rows: request.parsed.rows,
  });

  if (ingestError) {
    throw new Error(
      `El original quedó protegido, pero sus filas no pudieron procesarse: ${ingestError.message}`,
    );
  }

  return {
    sourceFileId: upload.sourceFileId,
    batchId: upload.batchId,
    archivedOnly: false,
  };
}

export function isStorageConflict(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const storageError = error as { message?: unknown; statusCode?: unknown };
  const statusCode = Number(storageError.statusCode);
  const message =
    typeof storageError.message === "string"
      ? storageError.message.toLowerCase()
      : "";

  return (
    statusCode === 409 ||
    message.includes("already exists") ||
    message.includes("duplicate")
  );
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
