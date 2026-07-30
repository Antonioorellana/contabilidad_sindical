const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;

const ALLOWED_EXTENSIONS = new Set(["xlsx", "csv", "xls", "pdf"]);

/**
 * Validates the local file before reading or uploading it.
 *
 * @param file - User-selected source document.
 * @throws Error when the file type or size is outside the pilot contract.
 */
export function validateImportFile(file: File): void {
  const extension = getFileExtension(file.name);

  if (!ALLOWED_EXTENSIONS.has(extension)) {
    throw new Error("Formato no permitido. Usa XLSX, CSV, XLS o PDF.");
  }

  if (file.size < 1) {
    throw new Error("El archivo está vacío.");
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw new Error("El archivo supera el máximo de 25 MB.");
  }
}

/**
 * Calculates a hexadecimal SHA-256 fingerprint using the browser crypto API.
 *
 * @param file - File whose integrity will be recorded.
 * @returns Lowercase hexadecimal SHA-256 digest.
 */
export async function calculateSha256(file: File): Promise<string> {
  const bytes = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", bytes);

  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

/**
 * Produces a storage-safe file name while retaining its extension.
 *
 * @param fileName - Original local file name.
 * @returns Sanitized file name suitable for a private object path.
 */
export function sanitizeFileName(fileName: string): string {
  const normalized = fileName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[.-]+|[.-]+$/g, "");

  return normalized.slice(0, 160) || "archivo";
}

/**
 * Returns the lowercase extension without the leading period.
 *
 * @param fileName - File name to inspect.
 * @returns Extension or an empty string.
 */
export function getFileExtension(fileName: string): string {
  return fileName.split(".").pop()?.toLowerCase() ?? "";
}
