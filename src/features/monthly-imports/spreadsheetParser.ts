import type {
  ImportRecordType,
  ParsedImportFile,
  SourceFileKind,
  StagedImportRowInput,
} from "./types";
import { getFileExtension } from "./fileIntegrity";

type Cell = string | number | boolean | Date | null;
type Sheet = { sheet: string; data: Cell[][] };

interface ColumnIndexes {
  rut: number;
  name: number | null;
  amount: number;
  totalAmount: number | null;
  installmentNumber: number | null;
  installmentCount: number | null;
  discountPeriod: number | null;
  category: number | null;
  reference: number | null;
}

const HEADER_SCAN_LIMIT = 25;
const MAX_IMPORT_ROWS = 5000;

const columnAliases: Record<keyof ColumnIndexes, string[]> = {
  rut: ["rut", "rut socio", "rut trabajador"],
  name: ["nombre", "nombres", "nombre socio", "trabajador", "nombre trabajador"],
  amount: ["monto", "monto cuota", "cuota a pagar", "valor cuota", "monto descuento"],
  totalAmount: ["monto total", "total compra", "valor total"],
  installmentNumber: ["numero cuota", "nro cuota", "cuota numero", "cuota actual"],
  installmentCount: ["cantidad cuotas", "numero de cuotas", "nro de cuotas", "cuotas"],
  discountPeriod: ["periodo descuento", "periodo de descuento", "periodo", "mes descuento"],
  category: ["item", "cobro", "convenio", "tipo descuento", "categoria"],
  reference: ["folio", "referencia", "numero operacion", "id operacion"],
};

const agreementPattern = /\b(capual|clinica|rimo|optica|joval|convenio)\b/;
const socialFeePattern = /\b(cuota social|cuota sind|sindicato|jumbo)\b/;

/**
 * Reads and normalizes an import file without modifying the original.
 *
 * @param file - XLSX, CSV, legacy XLS or PDF source file.
 * @param kind - Business meaning selected by the treasurer.
 * @returns Normalized rows or an archive-only notice.
 */
export async function parseImportFile(
  file: File,
  kind: SourceFileKind,
): Promise<ParsedImportFile> {
  const extension = getFileExtension(file.name);

  if (extension === "xls") {
    return archiveOnly(
      "El formato XLS antiguo se archivará íntegro, pero requiere revisión manual durante la marcha blanca.",
    );
  }

  if (extension === "pdf") {
    return archiveOnly(
      "El PDF se archivará como respaldo. Esta etapa todavía no extrae movimientos bancarios desde PDF.",
    );
  }

  const sheets = extension === "csv"
    ? [{ sheet: "CSV", data: parseCsv(await file.text()) }]
    : await readXlsx(file);

  const rows: StagedImportRowInput[] = [];

  for (const sheet of sheets) {
    const parsedRows = normalizeSheet(sheet, kind);
    rows.push(...parsedRows);

    if (rows.length > MAX_IMPORT_ROWS) {
      throw new Error(`La planilla supera el máximo de ${MAX_IMPORT_ROWS} filas.`);
    }
  }

  if (rows.length === 0) {
    throw new Error("No se encontraron hojas con columnas RUT y monto reconocibles.");
  }

  return {
    rows,
    sheetCount: sheets.length,
    detectedTotal: rows.reduce((total, row) => total + (row.amount ?? 0), 0),
    canProcess: true,
    notice: null,
  };
}

async function readXlsx(file: File): Promise<Sheet[]> {
  // The parser is loaded only after the user selects XLSX, keeping the initial
  // accounting dashboard small.
  const { default: readXlsxFile } = await import("read-excel-file/browser");
  const sheets = await readXlsxFile(file);

  return sheets.map(({ sheet, data }) => ({
    sheet,
    data: data as Cell[][],
  }));
}

function normalizeSheet(
  sheet: Sheet,
  kind: SourceFileKind,
): StagedImportRowInput[] {
  const header = findHeader(sheet.data);
  if (!header) {
    return [];
  }

  const rows: StagedImportRowInput[] = [];
  for (let index = header.rowIndex + 1; index < sheet.data.length; index += 1) {
    const sourceRow = sheet.data[index];
    if (isEmptyRow(sourceRow)) {
      continue;
    }

    const rut = toText(sourceRow[header.columns.rut]);
    const amount = toIntegerMoney(sourceRow[header.columns.amount]);
    const category = valueAt(sourceRow, header.columns.category);
    const recordType = classifyRecordType(kind, category, amount);
    const issues: string[] = [];

    if (!rut) {
      issues.push("missing_rut");
    }
    if (amount === null) {
      issues.push("missing_or_invalid_amount");
    }
    if (recordType === "unknown") {
      issues.push("unknown_record_type");
    }

    rows.push({
      sheetName: sheet.sheet,
      rowNumber: index + 1,
      rut,
      name: valueAt(sourceRow, header.columns.name),
      amount,
      totalAmount: toIntegerMoney(cellAt(sourceRow, header.columns.totalAmount)),
      installmentNumber: toPositiveInteger(cellAt(sourceRow, header.columns.installmentNumber)),
      installmentCount: toPositiveInteger(cellAt(sourceRow, header.columns.installmentCount)),
      discountPeriod: toDiscountPeriod(cellAt(sourceRow, header.columns.discountPeriod)),
      recordType,
      category,
      reference: valueAt(sourceRow, header.columns.reference),
      issues,
    });
  }

  return rows;
}

function findHeader(data: Cell[][]): { rowIndex: number; columns: ColumnIndexes } | null {
  const scanLength = Math.min(data.length, HEADER_SCAN_LIMIT);

  for (let rowIndex = 0; rowIndex < scanLength; rowIndex += 1) {
    const normalizedHeaders = data[rowIndex].map((cell) => normalizeLabel(toText(cell) ?? ""));
    const rut = findColumn(normalizedHeaders, columnAliases.rut);
    const amount = findColumn(normalizedHeaders, columnAliases.amount);

    if (rut === null || amount === null) {
      continue;
    }

    return {
      rowIndex,
      columns: {
        rut,
        amount,
        name: findColumn(normalizedHeaders, columnAliases.name),
        totalAmount: findColumn(normalizedHeaders, columnAliases.totalAmount),
        installmentNumber: findColumn(normalizedHeaders, columnAliases.installmentNumber),
        installmentCount: findColumn(normalizedHeaders, columnAliases.installmentCount),
        discountPeriod: findColumn(normalizedHeaders, columnAliases.discountPeriod),
        category: findColumn(normalizedHeaders, columnAliases.category),
        reference: findColumn(normalizedHeaders, columnAliases.reference),
      },
    };
  }

  return null;
}

function findColumn(headers: string[], aliases: string[]): number | null {
  const normalizedAliases = new Set(aliases.map(normalizeLabel));
  const index = headers.findIndex((header) => normalizedAliases.has(header));
  return index >= 0 ? index : null;
}

function classifyRecordType(
  kind: SourceFileKind,
  category: string | null,
  amount: number | null,
): ImportRecordType {
  if (kind === "provider_plan" || kind === "funs_sent") {
    return "agreement";
  }

  if (kind !== "company_result" || !category) {
    return "unknown";
  }

  const normalizedCategory = normalizeLabel(category);
  if (agreementPattern.test(normalizedCategory) || normalizedCategory.includes("cuota extra")) {
    return "agreement";
  }
  if (amount === 8000 && socialFeePattern.test(normalizedCategory)) {
    return "social_fee";
  }

  return "unknown";
}

function toIntegerMoney(cell: Cell | undefined): number | null {
  if (typeof cell === "number") {
    return Number.isSafeInteger(cell) && cell >= 0 ? cell : null;
  }

  const value = toText(cell);
  if (!value) {
    return null;
  }

  const compact = value.replace(/[$\s]/g, "");
  const groupedInteger = /^-?\d{1,3}([.,]\d{3})+$/.test(compact);
  const plainInteger = /^-?\d+$/.test(compact);

  if (!groupedInteger && !plainInteger) {
    return null;
  }

  const parsed = Number(compact.replace(/[.,]/g, ""));
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function toPositiveInteger(cell: Cell | undefined): number | null {
  const value = typeof cell === "number" ? cell : Number(toText(cell));
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

function toDiscountPeriod(cell: Cell | undefined): string | null {
  if (cell instanceof Date && !Number.isNaN(cell.getTime())) {
    return `${cell.getFullYear()}-${String(cell.getMonth() + 1).padStart(2, "0")}-01`;
  }

  const value = toText(cell);
  if (!value) {
    return null;
  }

  const yearMonth = value.match(/^(\d{4})[-/](\d{1,2})/);
  if (yearMonth) {
    return `${yearMonth[1]}-${yearMonth[2].padStart(2, "0")}-01`;
  }

  const monthYear = value.match(/^(\d{1,2})[-/](\d{4})$/);
  if (monthYear) {
    return `${monthYear[2]}-${monthYear[1].padStart(2, "0")}-01`;
  }

  return null;
}

function parseCsv(content: string): Cell[][] {
  const normalizedContent = content.replace(/^\uFEFF/, "");
  const delimiter = detectCsvDelimiter(normalizedContent);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < normalizedContent.length; index += 1) {
    const character = normalizedContent[index];
    const nextCharacter = normalizedContent[index + 1];

    if (character === '"') {
      if (quoted && nextCharacter === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }

    if (character === delimiter && !quoted) {
      row.push(field);
      field = "";
      continue;
    }

    if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && nextCharacter === "\n") {
        index += 1;
      }
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      continue;
    }

    field += character;
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

function detectCsvDelimiter(content: string): "," | ";" {
  const firstLine = content.split(/\r?\n/, 1)[0] ?? "";
  return countOutsideQuotes(firstLine, ";") > countOutsideQuotes(firstLine, ",")
    ? ";"
    : ",";
}

function countOutsideQuotes(value: string, target: string): number {
  let count = 0;
  let quoted = false;

  for (const character of value) {
    if (character === '"') {
      quoted = !quoted;
    } else if (character === target && !quoted) {
      count += 1;
    }
  }

  return count;
}

function normalizeLabel(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

function toText(cell: Cell | undefined): string | null {
  if (cell === null || cell === undefined) {
    return null;
  }
  if (cell instanceof Date) {
    return cell.toISOString();
  }
  return String(cell).trim() || null;
}

function valueAt(row: Cell[], index: number | null): string | null {
  return index === null ? null : toText(row[index]);
}

function cellAt(row: Cell[], index: number | null): Cell | undefined {
  return index === null ? undefined : row[index];
}

function isEmptyRow(row: Cell[]): boolean {
  return row.every((cell) => cell === null || String(cell).trim() === "");
}

function archiveOnly(notice: string): ParsedImportFile {
  return {
    rows: [],
    sheetCount: 0,
    detectedTotal: 0,
    canProcess: false,
    notice,
  };
}
