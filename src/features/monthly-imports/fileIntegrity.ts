const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;

const ALLOWED_EXTENSIONS = new Set(["xlsx", "csv", "xls", "pdf"]);

export interface MaterializedImportFile {
  file: File;
  sha256: string;
}

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
  return calculateBytesSha256(bytes);
}

/**
 * Copies a selected file into browser-owned memory before any lazy parsing or
 * network request can invalidate a cloud-provider file reference.
 *
 * @param sourceFile - File reference returned by the operating-system picker.
 * @returns Durable in-memory file and the SHA-256 of the captured bytes.
 * @throws Error when the browser cannot acquire the complete file contents.
 */
export async function materializeImportFile(
  sourceFile: File,
): Promise<MaterializedImportFile> {
  validateImportFile(sourceFile);

  let bytes: ArrayBuffer;
  try {
    bytes = await sourceFile.arrayBuffer();
  } catch (error) {
    throw new Error(getFileReadErrorMessage(error), { cause: error });
  }

  if (bytes.byteLength !== sourceFile.size) {
    throw new Error(
      "El archivo no terminó de descargarse desde OneDrive. Guárdalo localmente y selecciónalo nuevamente.",
    );
  }

  return {
    file: new File([bytes], sourceFile.name, {
      type: sourceFile.type,
      lastModified: sourceFile.lastModified,
    }),
    sha256: await calculateBytesSha256(bytes),
  };
}

/**
 * Detects browser and macOS file-provider read failures without exposing raw
 * platform messages to the user.
 *
 * @param error - Error raised while acquiring file bytes.
 * @returns Localized recovery guidance.
 */
export function getFileReadErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  const name = error instanceof Error ? error.name.toLowerCase() : "";
  const isUnavailableReference =
    name.includes("notreadable") ||
    name.includes("security") ||
    message.includes("could not be read") ||
    message.includes("permission") ||
    message.includes("reference to a file");

  return isUnavailableReference
    ? "El navegador perdió acceso al archivo de OneDrive. Descárgalo o marca “Mantener siempre en este dispositivo” y vuelve a seleccionarlo."
    : "No fue posible leer el archivo completo. Vuelve a seleccionarlo desde una carpeta local.";
}

async function calculateBytesSha256(bytes: ArrayBuffer): Promise<string> {
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
