import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  FileSearch,
  LoaderCircle,
  Search,
  ShieldCheck,
} from "lucide-react";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { loadImportReviewPage } from "./importService";
import type {
  ImportBatchSummary,
  ImportRecordTypeFilter,
  ImportReviewStatusFilter,
  StagedImportRow,
} from "./types";

const PAGE_SIZE = 50;

const money = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});

interface ImportReviewPanelProps {
  batches: ImportBatchSummary[];
  selectedBatchId: string;
  search: string;
  onBatchChange: (batchId: string) => void;
  onSearchChange: (search: string) => void;
}

/**
 * Exposes staged import rows for controlled, read-only review.
 *
 * @param props - Available batches and controlled search/selection state.
 * @returns Paginated review table with RUT, name and validation filters.
 */
export function ImportReviewPanel({
  batches,
  selectedBatchId,
  search,
  onBatchChange,
  onSearchChange,
}: ImportReviewPanelProps) {
  const reviewableBatches = useMemo(
    () => batches.filter((batch) => batch.detected_rows > 0),
    [batches],
  );
  const [status, setStatus] = useState<ImportReviewStatusFilter>("all");
  const [recordType, setRecordType] = useState<ImportRecordTypeFilter>("all");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<StagedImportRow[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const deferredSearch = useDeferredValue(search);

  useEffect(() => {
    setPage(1);
  }, [selectedBatchId, deferredSearch, status, recordType]);

  useEffect(() => {
    if (!selectedBatchId) {
      setRows([]);
      setTotal(0);
      return;
    }

    let isCurrentRequest = true;
    setIsLoading(true);
    setError(null);

    void loadImportReviewPage({
      batchId: selectedBatchId,
      search: deferredSearch,
      status,
      recordType,
      page,
      pageSize: PAGE_SIZE,
    })
      .then((result) => {
        if (!isCurrentRequest) {
          return;
        }

        setRows(result.rows);
        setTotal(result.total);
      })
      .catch((caughtError: unknown) => {
        if (!isCurrentRequest) {
          return;
        }

        setRows([]);
        setTotal(0);
        setError(
          caughtError instanceof Error
            ? caughtError.message
            : "No fue posible cargar la revisión.",
        );
      })
      .finally(() => {
        if (isCurrentRequest) {
          setIsLoading(false);
        }
      });

    return () => {
      isCurrentRequest = false;
    };
  }, [deferredSearch, page, recordType, selectedBatchId, status]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const firstVisibleRow = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const lastVisibleRow = Math.min(page * PAGE_SIZE, total);

  return (
    <section className="panel glass review-panel" id="revision-carga">
      <div className="section-title review-heading">
        <div>
          <div className="eyebrow">Datos importados</div>
          <h2>Revisión de carga</h2>
          <p>
            Consulta las filas originales antes de crear cuotas, deudas o
            movimientos contables.
          </p>
        </div>
        {isLoading ? <LoaderCircle className="spin muted" size={21} /> : null}
      </div>

      {reviewableBatches.length === 0 ? (
        <div className="empty-state review-empty">
          <FileSearch size={30} />
          <strong>No hay filas procesadas para revisar</strong>
          <span>Los PDF y archivos XLS antiguos sólo se archivan.</span>
        </div>
      ) : (
        <>
          <div className="review-controls">
            <label className="review-field batch-field">
              <span>Archivo</span>
              <select
                value={selectedBatchId}
                onChange={(event) => onBatchChange(event.target.value)}
              >
                {reviewableBatches.map((batch) => (
                  <option key={batch.id} value={batch.id}>
                    {batch.source_files?.original_name ?? "Archivo protegido"}
                  </option>
                ))}
              </select>
            </label>

            <label className="review-field search-field">
              <span>Buscar socio</span>
              <span className="review-search">
                <Search size={17} />
                <input
                  value={search}
                  onChange={(event) => onSearchChange(event.target.value)}
                  placeholder="RUT o nombre"
                  autoComplete="off"
                />
              </span>
            </label>

            <label className="review-field">
              <span>Validación</span>
              <select
                value={status}
                onChange={(event) =>
                  setStatus(event.target.value as ImportReviewStatusFilter)
                }
              >
                <option value="all">Todas</option>
                <option value="manual_review">Con observaciones</option>
                <option value="ready">Sin observaciones</option>
              </select>
            </label>

            <label className="review-field">
              <span>Tipo</span>
              <select
                value={recordType}
                onChange={(event) =>
                  setRecordType(event.target.value as ImportRecordTypeFilter)
                }
              >
                <option value="all">Todos</option>
                <option value="social_fee">Cuota social</option>
                <option value="agreement">Convenio</option>
                <option value="unknown">Por clasificar</option>
              </select>
            </label>
          </div>

          {error ? (
            <div className="form-error review-error" role="alert">
              <AlertTriangle size={18} />
              {error}
            </div>
          ) : null}

          <div className="review-summary" aria-live="polite">
            <span>
              <strong>{total}</strong> fila{total === 1 ? "" : "s"} encontrada
              {total === 1 ? "" : "s"}
            </span>
            <span>
              Mostrando {firstVisibleRow}–{lastVisibleRow}
            </span>
          </div>

          <div className="review-table-wrap">
            <table className="review-table">
              <thead>
                <tr>
                  <th>Socio</th>
                  <th>Origen</th>
                  <th>Tipo</th>
                  <th className="numeric-cell">Monto</th>
                  <th>Cuota</th>
                  <th>Validación</th>
                </tr>
              </thead>
              <tbody>
                {!isLoading && rows.length === 0 ? (
                  <tr>
                    <td colSpan={6}>
                      <div className="empty-state compact-empty">
                        <FileSearch size={25} />
                        <strong>No hay coincidencias</strong>
                        <span>Prueba otro RUT, nombre o filtro.</span>
                      </div>
                    </td>
                  </tr>
                ) : null}
                {rows.map((row) => (
                  <ImportReviewRow key={row.id} row={row} />
                ))}
              </tbody>
            </table>
          </div>

          <footer className="review-footer">
            <div className="privacy-inline">
              <ShieldCheck size={16} />
              Los nombres de prevalidación se eliminan al vencer su retención.
            </div>
            <div className="pagination">
              <button
                className="icon-button"
                type="button"
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={page <= 1 || isLoading}
              >
                <ChevronLeft size={18} />
                <span className="sr-only">Página anterior</span>
              </button>
              <span>
                Página {page} de {totalPages}
              </span>
              <button
                className="icon-button"
                type="button"
                onClick={() =>
                  setPage((current) => Math.min(totalPages, current + 1))
                }
                disabled={page >= totalPages || isLoading}
              >
                <ChevronRight size={18} />
                <span className="sr-only">Página siguiente</span>
              </button>
            </div>
          </footer>
        </>
      )}
    </section>
  );
}

function ImportReviewRow({ row }: { row: StagedImportRow }) {
  const hasIssues = row.validation_status === "manual_review";

  return (
    <tr>
      <td>
        <strong>{row.source_name ?? "Nombre no informado"}</strong>
        <small>{row.normalized_rut ?? "RUT no informado"}</small>
      </td>
      <td>
        <strong>{row.sheet_name}</strong>
        <small>Fila {row.source_row_number}</small>
      </td>
      <td>{translateRecordType(row.record_type)}</td>
      <td className="numeric-cell">
        {row.amount === null ? "—" : money.format(row.amount)}
      </td>
      <td>{formatInstallment(row)}</td>
      <td>
        <span className={`row-validation ${hasIssues ? "review" : "safe"}`}>
          {hasIssues ? <AlertTriangle size={14} /> : <CheckCircle2 size={14} />}
          {hasIssues ? "Revisar" : "Prevalidada"}
        </span>
        {row.issue_codes.length > 0 ? (
          <small className="issue-copy">
            {row.issue_codes.map(translateIssue).join(" · ")}
          </small>
        ) : null}
      </td>
    </tr>
  );
}

function formatInstallment(row: StagedImportRow): string {
  if (row.installment_number === null && row.installment_count === null) {
    return "—";
  }

  return `${row.installment_number ?? "?"} de ${row.installment_count ?? "?"}`;
}

function translateRecordType(recordType: string): string {
  const labels: Record<string, string> = {
    social_fee: "Cuota social",
    agreement: "Convenio",
    unknown: "Por clasificar",
  };

  return labels[recordType] ?? recordType;
}

function translateIssue(issueCode: string): string {
  const labels: Record<string, string> = {
    missing_rut: "RUT ausente",
    invalid_rut: "RUT inválido",
    member_not_found: "Socio no encontrado",
    missing_amount: "Monto ausente",
    invalid_amount: "Monto inválido",
    missing_or_invalid_amount: "Monto ausente o inválido",
    missing_period: "Periodo ausente",
    invalid_period: "Periodo inválido",
    duplicate_row: "Posible duplicado",
    unknown_record_type: "Tipo por clasificar",
    incomplete_provider_operation: "Operación de convenio incompleta",
  };

  return labels[issueCode] ?? issueCode.replaceAll("_", " ");
}
