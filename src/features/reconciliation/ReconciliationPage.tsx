import {
  AlertTriangle,
  Archive,
  ArrowRight,
  Building2,
  CheckCircle2,
  CircleDollarSign,
  FileSearch,
  FileSpreadsheet,
  LoaderCircle,
  LockKeyhole,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Upload,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { OfficerRole } from "../auth/useAuth";
import { loadReconciliationOverview } from "./reconciliationService";
import type {
  ComparisonStatus,
  ReconciliationOverview,
  ReconciliationSourceStatus,
} from "./types";

interface ReconciliationPageProps {
  role: OfficerRole;
  onOpenImports: () => void;
}

const money = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});

/**
 * Displays the reconciliation readiness of one monthly accounting cycle.
 *
 * @param props Officer role and navigation callback to the upload workspace.
 * @returns Data-backed reconciliation workspace with no financial mutations.
 */
export function ReconciliationPage({
  role,
  onOpenImports,
}: ReconciliationPageProps) {
  const [overview, setOverview] = useState<ReconciliationOverview | null>(null);
  const [selectedCycleId, setSelectedCycleId] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestSequence = useRef(0);

  const refresh = useCallback(async (cycleId?: string) => {
    const requestId = requestSequence.current + 1;
    requestSequence.current = requestId;
    setIsLoading(true);
    setError(null);

    try {
      const nextOverview = await loadReconciliationOverview(cycleId);
      if (requestSequence.current !== requestId) {
        return;
      }
      setOverview(nextOverview);
      setSelectedCycleId(nextOverview.selectedCycle?.id ?? "");
    } catch (caughtError) {
      if (requestSequence.current === requestId) {
        setError(toErrorMessage(caughtError));
      }
    } finally {
      if (requestSequence.current === requestId) {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void refresh();
    return () => {
      requestSequence.current += 1;
    };
  }, [refresh]);

  const hasCycle = Boolean(overview?.selectedCycle);

  return (
    <div className="content reconciliation-content">
      <section className="page-heading">
        <div>
          <div className="eyebrow">Cruce contable controlado</div>
          <h1>Conciliación mensual</h1>
          <p>
            Desde proveedores hasta banco, con bloqueo automático ante cualquier
            diferencia.
          </p>
        </div>
        <button
          className="secondary-action-button"
          type="button"
          onClick={() => void refresh(selectedCycleId || undefined)}
          disabled={isLoading}
        >
          {isLoading ? (
            <LoaderCircle className="spin" size={17} />
          ) : (
            <RefreshCw size={17} />
          )}
          Actualizar
        </button>
      </section>

      {role !== "treasurer" ? (
        <div className="readonly-banner">
          <LockKeyhole size={18} />
          Presidencia consulta el cruce y sus evidencias. La resolución operativa
          corresponde a tesorería y siempre deja trazabilidad.
        </div>
      ) : null}

      <section className="cycle-toolbar glass reconciliation-toolbar">
        <label>
          <span>Ciclo de descuento</span>
          <select
            value={selectedCycleId}
            onChange={(event) => {
              const cycleId = event.target.value;
              setSelectedCycleId(cycleId);
              void refresh(cycleId);
            }}
            disabled={isLoading || !overview?.cycles.length}
          >
            {!overview?.cycles.length ? (
              <option value="">Sin ciclos creados</option>
            ) : null}
            {overview?.cycles.map((cycle) => (
              <option key={cycle.id} value={cycle.id}>
                {formatPeriod(cycle.discount_period)}
                {cycle.is_pilot ? " · marcha blanca" : ""}
              </option>
            ))}
          </select>
        </label>
        <div className="reconciliation-period-copy">
          <span>Recaudación</span>
          <strong>
            {overview?.selectedCycle
              ? formatPeriod(overview.selectedCycle.collection_period)
              : "—"}
          </strong>
        </div>
        <button
          className="primary-button compact-button"
          type="button"
          onClick={onOpenImports}
        >
          <Upload size={17} />
          Ir a cargas
        </button>
      </section>

      {error ? (
        <div className="form-error page-error" role="alert">
          <AlertTriangle size={18} />
          {error}
        </div>
      ) : null}

      {!hasCycle && !isLoading ? (
        <section className="panel glass empty-state reconciliation-empty">
          <FileSpreadsheet size={32} />
          <strong>Primero debes crear un ciclo mensual</strong>
          <span>La conciliación no puede existir sin un periodo contable definido.</span>
          <button
            className="primary-button compact-button"
            type="button"
            onClick={onOpenImports}
          >
            Ir a cargas mensuales
          </button>
        </section>
      ) : null}

      {hasCycle && overview ? (
        <>
          <ReconciliationGate overview={overview} onOpenImports={onOpenImports} />

          <section className="reconciliation-kpis">
            <MetricCard
              icon={FileSpreadsheet}
              tone="blue"
              label="Convenios solicitados"
              value={formatNullableMoney(overview.requestedAgreementAmount)}
              note="Total FUNS interpretado"
            />
            <MetricCard
              icon={Building2}
              tone="teal"
              label="Convenios informados"
              value={formatNullableMoney(overview.reportedAgreementAmount)}
              note="Resultado consolidado de Jumbo"
            />
            <MetricCard
              icon={CircleDollarSign}
              tone={overview.difference === 0 ? "teal" : "amber"}
              label="Diferencia"
              value={formatDifference(overview.difference)}
              note="Debe ser exactamente $0"
            />
            <MetricCard
              icon={ShieldAlert}
              tone={overview.reviewRows > 0 ? "amber" : "teal"}
              label="Filas en revisión"
              value={String(overview.reviewRows)}
              note="Sin asientos ni distribución"
            />
          </section>

          <section className="source-pipeline glass">
            <div className="section-title">
              <div>
                <div className="eyebrow">Evidencia de origen</div>
                <h2>Cadena del ciclo</h2>
              </div>
              <span className="progress-copy">
                {overview.sources.filter((source) => source.status === "ready").length}
                {" de "}
                {overview.sources.length} fuentes listas
              </span>
            </div>
            <div className="source-grid">
              {overview.sources.map((source, index) => (
                <div className={`source-card ${source.status}`} key={source.kind}>
                  <div className="source-card-heading">
                    <SourceStatusIcon status={source.status} />
                    <span className={`source-status ${source.status}`}>
                      {translateSourceStatus(source.status)}
                    </span>
                  </div>
                  <strong>{source.label}</strong>
                  <small>{source.description}</small>
                  <div className="source-metrics">
                    <span>{source.fileCount} archivo(s)</span>
                    <span>{source.rowCount} fila(s)</span>
                  </div>
                  {index < overview.sources.length - 1 ? (
                    <ArrowRight className="source-arrow" size={18} />
                  ) : null}
                </div>
              ))}
            </div>
          </section>

          <div className="reconciliation-layout">
            <section className="panel glass comparison-panel">
              <div className="section-title">
                <div>
                  <div className="eyebrow">Controles exactos</div>
                  <h2>Cruces del periodo</h2>
                </div>
                <ShieldCheck size={20} className="section-icon" />
              </div>
              <div className="comparison-list">
                {overview.comparisons.map((comparison) => (
                  <article className="comparison-row" key={comparison.id}>
                    <div className="comparison-copy">
                      <strong>{comparison.label}</strong>
                      <small>{comparison.detail}</small>
                    </div>
                    <ComparisonAmount
                      label={comparison.leftLabel}
                      value={comparison.leftAmount}
                    />
                    <ArrowRight className="comparison-arrow" size={17} />
                    <ComparisonAmount
                      label={comparison.rightLabel}
                      value={comparison.rightAmount}
                    />
                    <ComparisonBadge status={comparison.status} />
                  </article>
                ))}
              </div>
              <div className="table-note reconciliation-note">
                <ShieldCheck size={17} />
                Coincidir el total no basta para contabilizar: cada RUT y cada
                cuota también deben quedar asociados sin ambigüedad.
              </div>
            </section>

            <aside className="panel glass reconciliation-review-panel">
              <div className="section-title">
                <div>
                  <div className="eyebrow">Revisión manual</div>
                  <h2>Observaciones detectadas</h2>
                </div>
                <span className="alert-count">{overview.reviewRows}</span>
              </div>
              {overview.issues.length > 0 ? (
                <div className="issue-summary-list">
                  {overview.issues.slice(0, 6).map((issue) => (
                    <div className="issue-summary-row" key={issue.code}>
                      <span>{issue.count}</span>
                      <div>
                        <strong>{issue.label}</strong>
                        <small>No se corrige automáticamente</small>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="compact-safe-state">
                  <CheckCircle2 size={24} />
                  <strong>Sin observaciones locales</strong>
                  <span>Aún se validarán las reglas de negocio del cruce.</span>
                </div>
              )}
              <button
                className="secondary-button"
                type="button"
                onClick={onOpenImports}
              >
                <FileSearch size={17} />
                Revisar filas de origen
              </button>
            </aside>
          </div>
        </>
      ) : null}
    </div>
  );
}

function ReconciliationGate({
  overview,
  onOpenImports,
}: {
  overview: ReconciliationOverview;
  onOpenImports: () => void;
}) {
  if (overview.canRunExactReconciliation) {
    return (
      <section className="reconciliation-gate ready">
        <CheckCircle2 size={23} />
        <div>
          <strong>Cruce exacto disponible</strong>
          <span>
            Los totales coinciden. La asignación definitiva deberá conservar
            evidencia por socio y cuota.
          </span>
        </div>
      </section>
    );
  }

  return (
    <section className="reconciliation-gate blocked">
      <ShieldAlert size={23} />
      <div>
        <strong>Conciliación automática bloqueada</strong>
        <ul>
          {overview.blockers.length > 0 ? (
            overview.blockers.map((blocker) => <li key={blocker}>{blocker}</li>)
          ) : (
            <li>El ciclo todavía no cumple las condiciones del cruce exacto.</li>
          )}
        </ul>
      </div>
      <button type="button" onClick={onOpenImports}>
        Completar evidencia
      </button>
    </section>
  );
}

function MetricCard({
  icon: Icon,
  tone,
  label,
  value,
  note,
}: {
  icon: typeof FileSpreadsheet;
  tone: "blue" | "teal" | "amber";
  label: string;
  value: string;
  note: string;
}) {
  return (
    <article className="kpi-card glass">
      <span className={`icon-well ${tone}`}>
        <Icon size={20} />
      </span>
      <span className="kpi-label">{label}</span>
      <strong className="money">{value}</strong>
      <span className="kpi-note">{note}</span>
    </article>
  );
}

function SourceStatusIcon({ status }: { status: ReconciliationSourceStatus }) {
  if (status === "ready") {
    return <CheckCircle2 size={18} />;
  }
  if (status === "archived") {
    return <Archive size={18} />;
  }
  if (status === "needs-review") {
    return <AlertTriangle size={18} />;
  }
  return <FileSpreadsheet size={18} />;
}

function ComparisonAmount({
  label,
  value,
}: {
  label: string;
  value: number | null;
}) {
  return (
    <div className="comparison-amount">
      <span>{label}</span>
      <strong>{formatNullableMoney(value)}</strong>
    </div>
  );
}

function ComparisonBadge({ status }: { status: ComparisonStatus }) {
  const labels: Record<ComparisonStatus, string> = {
    blocked: "Falta evidencia",
    "needs-review": "Revisión manual",
    exact: "Coincide",
    difference: "Con diferencia",
    "reference-only": "Sólo referencia",
  };

  return <span className={`comparison-status ${status}`}>{labels[status]}</span>;
}

function translateSourceStatus(status: ReconciliationSourceStatus): string {
  const labels: Record<ReconciliationSourceStatus, string> = {
    missing: "Falta cargar",
    archived: "Sólo archivado",
    "needs-review": "Requiere revisión",
    ready: "Prevalidado",
  };

  return labels[status];
}

function formatNullableMoney(value: number | null): string {
  return value === null ? "—" : money.format(value);
}

function formatDifference(value: number | null): string {
  if (value === null) {
    return "—";
  }
  if (value === 0) {
    return money.format(0);
  }
  return `${value > 0 ? "+" : "−"}${money.format(Math.abs(value))}`;
}

function formatPeriod(value: string): string {
  const [year, month] = value.split("-").map(Number);
  if (!year || !month) {
    return value;
  }

  const formatted = new Intl.DateTimeFormat("es-CL", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, 1)));

  return formatted[0].toUpperCase() + formatted.slice(1);
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "No fue posible cargar la conciliación.";
}
