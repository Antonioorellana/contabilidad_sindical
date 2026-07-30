import {
  AlertTriangle,
  Archive,
  CalendarDays,
  CheckCircle2,
  FileSpreadsheet,
  ListFilter,
  LoaderCircle,
  LockKeyhole,
  Plus,
  Upload,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { OfficerRole } from "../auth/useAuth";
import { ImportReviewPanel } from "./ImportReviewPanel";
import { createMonthlyCycle, loadMonthlyContext } from "./importService";
import type {
  ImportBatchSummary,
  MonthlyCycle,
  Provider,
} from "./types";
import { UploadDialog } from "./UploadDialog";

interface MonthlyImportsPageProps {
  role: OfficerRole;
  openUploadSignal: number;
  searchQuery: string;
  onSearchQueryChange: (search: string) => void;
}

const money = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});

/**
 * Displays accounting cycles, immutable source files and staging results.
 *
 * @param props - Active officer role and external upload-open signal.
 * @returns Functional monthly import workspace.
 */
export function MonthlyImportsPage({
  role,
  openUploadSignal,
  searchQuery,
  onSearchQueryChange,
}: MonthlyImportsPageProps) {
  const [cycles, setCycles] = useState<MonthlyCycle[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [batches, setBatches] = useState<ImportBatchSummary[]>([]);
  const [selectedCycleId, setSelectedCycleId] = useState("");
  const [selectedBatchId, setSelectedBatchId] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isCreatingCycle, setIsCreatingCycle] = useState(false);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [newPeriod, setNewPeriod] = useState("2026-07");
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (cycleId?: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const context = await loadMonthlyContext(cycleId);
      setCycles(context.cycles);
      setProviders(context.providers);
      setBatches(context.batches);
      setSelectedCycleId((current) => current || context.cycles[0]?.id || "");
      setSelectedBatchId((current) => {
        const remainsAvailable = context.batches.some(
          (batch) => batch.id === current && batch.detected_rows > 0,
        );
        return remainsAvailable
          ? current
          : context.batches.find((batch) => batch.detected_rows > 0)?.id ?? "";
      });
    } catch (caughtError) {
      setError(toErrorMessage(caughtError));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh(selectedCycleId || undefined);
  }, [refresh, selectedCycleId]);

  useEffect(() => {
    if (openUploadSignal > 0 && selectedCycleId && role === "treasurer") {
      setIsUploadOpen(true);
    }
  }, [openUploadSignal, role, selectedCycleId]);

  const createCycle = async () => {
    if (isCreatingCycle || role !== "treasurer") {
      return;
    }

    setIsCreatingCycle(true);
    setError(null);
    try {
      const cycle = await createMonthlyCycle(`${newPeriod}-01`);
      setSelectedCycleId(cycle.id);
      await refresh(cycle.id);
    } catch (caughtError) {
      setError(toErrorMessage(caughtError));
    } finally {
      setIsCreatingCycle(false);
    }
  };

  const selectedCycle = cycles.find((cycle) => cycle.id === selectedCycleId) ?? null;
  const reviewRows = batches.reduce((total, batch) => total + batch.rejected_rows, 0);
  const readyRows = batches.reduce((total, batch) => total + batch.accepted_rows, 0);
  const detectedTotal = batches.reduce(
    (total, batch) => total + (batch.detected_total ?? 0),
    0,
  );
  const openBatchReview = (batchId: string) => {
    setSelectedBatchId(batchId);
    window.requestAnimationFrame(() => {
      document
        .getElementById("revision-carga")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  return (
    <div className="content imports-content">
      <section className="page-heading">
        <div>
          <div className="eyebrow">Ingreso controlado</div>
          <h1>Cargas mensuales</h1>
          <p>
            Originales privados, validación previa y diferencias visibles antes de
            contabilizar.
          </p>
        </div>
        <button
          className="primary-button"
          type="button"
          onClick={() => setIsUploadOpen(true)}
          disabled={!selectedCycle || role !== "treasurer"}
        >
          <Upload size={18} />
          Nueva carga
        </button>
      </section>

      {role !== "treasurer" ? (
        <div className="readonly-banner">
          <LockKeyhole size={18} />
          Presidencia puede consultar la evidencia. La carga operativa corresponde
          exclusivamente a tesorería.
        </div>
      ) : null}

      <section className="cycle-toolbar glass">
        <label>
          <span>Ciclo de descuento</span>
          <select
            value={selectedCycleId}
            onChange={(event) => setSelectedCycleId(event.target.value)}
            disabled={isLoading || cycles.length === 0}
          >
            {cycles.length === 0 ? <option value="">Sin ciclos creados</option> : null}
            {cycles.map((cycle) => (
              <option key={cycle.id} value={cycle.id}>
                {formatPeriod(cycle.discount_period)}
                {cycle.is_pilot ? " · marcha blanca" : ""}
              </option>
            ))}
          </select>
        </label>

        {role === "treasurer" ? (
          <div className="create-cycle">
            <label>
              <span>Nuevo periodo</span>
              <input
                type="month"
                min="2026-07"
                value={newPeriod}
                onChange={(event) => setNewPeriod(event.target.value)}
              />
            </label>
            <button
              className="secondary-button"
              type="button"
              onClick={() => void createCycle()}
              disabled={isCreatingCycle}
            >
              {isCreatingCycle ? <LoaderCircle className="spin" size={17} /> : <Plus size={17} />}
              Crear ciclo
            </button>
          </div>
        ) : null}
      </section>

      {selectedCycle ? (
        <section className="cycle-contract glass">
          <div>
            <CalendarDays size={19} />
            <span>Proveedores</span>
            <strong>{formatDeadline(selectedCycle.provider_deadline)}</strong>
          </div>
          <div>
            <CalendarDays size={19} />
            <span>FUNS a Jumbo</span>
            <strong>{formatDeadline(selectedCycle.employer_deadline)}</strong>
          </div>
          <div>
            <CalendarDays size={19} />
            <span>Depósito esperado</span>
            <strong>{formatDate(selectedCycle.expected_deposit_deadline)}</strong>
          </div>
          <div>
            <CheckCircle2 size={19} />
            <span>Estado</span>
            <strong>{translateCycleStatus(selectedCycle.status)}</strong>
          </div>
        </section>
      ) : null}

      <section className="import-kpis">
        <article className="kpi-card glass">
          <span className="icon-well blue"><FileSpreadsheet size={20} /></span>
          <span className="kpi-label">Filas detectadas</span>
          <strong>{readyRows + reviewRows}</strong>
          <span className="kpi-note">{readyRows} listas para etapa posterior</span>
        </article>
        <article className="kpi-card glass">
          <span className="icon-well amber"><AlertTriangle size={20} /></span>
          <span className="kpi-label">Revisión manual</span>
          <strong>{reviewRows}</strong>
          <span className="kpi-note">Nunca se distribuyen diferencias arbitrariamente</span>
        </article>
        <article className="kpi-card glass">
          <span className="icon-well teal"><Archive size={20} /></span>
          <span className="kpi-label">Monto sólo detectado</span>
          <strong className="money">{money.format(detectedTotal)}</strong>
          <span className="kpi-note">No equivale a un ingreso contabilizado</span>
        </article>
      </section>

      {error ? (
        <div className="form-error page-error" role="alert">
          <AlertTriangle size={18} />
          {error}
        </div>
      ) : null}

      <section className="panel glass imports-panel">
        <div className="section-title">
          <div>
            <div className="eyebrow">Trazabilidad</div>
            <h2>Archivos del ciclo</h2>
          </div>
          {isLoading ? <LoaderCircle className="spin muted" size={20} /> : null}
        </div>

        {batches.length === 0 && !isLoading ? (
          <div className="empty-state">
            <Archive size={30} />
            <strong>Aún no hay documentos en este ciclo</strong>
            <span>La primera carga conservará nombre, fecha, responsable y SHA‑256.</span>
          </div>
        ) : (
          <div className="import-list">
            {batches.map((batch) => (
              <ImportBatchRow
                key={batch.id}
                batch={batch}
                isSelected={batch.id === selectedBatchId}
                onReview={openBatchReview}
              />
            ))}
          </div>
        )}
      </section>

      <ImportReviewPanel
        batches={batches}
        selectedBatchId={selectedBatchId}
        search={searchQuery}
        onBatchChange={setSelectedBatchId}
        onSearchChange={onSearchQueryChange}
      />

      {isUploadOpen && selectedCycle ? (
        <UploadDialog
          cycle={selectedCycle}
          providers={providers}
          onClose={() => setIsUploadOpen(false)}
          onCompleted={() => refresh(selectedCycle.id)}
        />
      ) : null}
    </div>
  );
}

function ImportBatchRow({
  batch,
  isSelected,
  onReview,
}: {
  batch: ImportBatchSummary;
  isSelected: boolean;
  onReview: (batchId: string) => void;
}) {
  const source = batch.source_files;
  const archivedOnly = batch.status === "uploaded" && batch.detected_rows === 0;

  return (
    <article className={`import-row ${isSelected ? "selected" : ""}`}>
      <span className={`file-icon ${batch.rejected_rows > 0 ? "warning" : ""}`}>
        {archivedOnly ? <Archive size={18} /> : <FileSpreadsheet size={18} />}
      </span>
      <div className="import-file-copy">
        <strong>{source?.original_name ?? "Archivo protegido"}</strong>
        <small>
          {source ? translateKind(source.kind) : "Documento"} · SHA {source?.sha256.slice(0, 8)}…
        </small>
      </div>
      <div className="import-metric">
        <span>Filas</span>
        <strong>{batch.detected_rows || "—"}</strong>
      </div>
      <div className="import-metric">
        <span>Revisión</span>
        <strong className={batch.rejected_rows > 0 ? "warning-text" : ""}>
          {batch.rejected_rows}
        </strong>
      </div>
      <div className="batch-actions">
        <span className={`batch-status ${batch.rejected_rows > 0 ? "review" : "safe"}`}>
          {archivedOnly
            ? "Archivado"
            : batch.rejected_rows > 0
              ? "Revisión manual"
              : "Prevalidado"}
        </span>
        {!archivedOnly ? (
          <button
            className="review-link"
            type="button"
            onClick={() => onReview(batch.id)}
          >
            <ListFilter size={15} />
            Ver filas
          </button>
        ) : null}
      </div>
    </article>
  );
}

function formatPeriod(value: string): string {
  return new Intl.DateTimeFormat("es-CL", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("es-CL", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}

function formatDeadline(value: string): string {
  return new Intl.DateTimeFormat("es-CL", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function translateCycleStatus(status: string): string {
  const labels: Record<string, string> = {
    draft: "Borrador",
    submitted: "FUNS enviado",
    awaiting_company: "Esperando empresa",
    reconciling: "Conciliando",
    manual_review: "Revisión manual",
    ready_to_close: "Listo para cierre",
    closed: "Cerrado",
  };
  return labels[status] ?? status;
}

function translateKind(kind: string): string {
  const labels: Record<string, string> = {
    provider_plan: "Convenio",
    funs_sent: "FUNS enviado",
    company_result: "Resultado empresa",
    bank_statement: "Cartola",
  };
  return labels[kind] ?? "Documento";
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Ocurrió un error inesperado.";
}
