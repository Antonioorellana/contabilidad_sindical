import {
  AlertTriangle,
  Archive,
  ArrowRight,
  Building2,
  CalendarDays,
  Check,
  CircleDollarSign,
  FileSpreadsheet,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
  Upload,
  Users,
} from "lucide-react";
import { useCallback, useEffect, useState, type ComponentType } from "react";
import type { OfficerRole } from "../auth/useAuth";
import type { ReconciliationSourceStatus } from "../reconciliation/types";
import { loadDashboardSnapshot } from "./dashboardService";
import type { DashboardSnapshot } from "./types";

interface DashboardPageProps {
  role: OfficerRole;
  onOpenImports: (openUpload: boolean) => void;
  onOpenReconciliation: () => void;
}

type Icon = ComponentType<{ size?: number; strokeWidth?: number }>;
type Tone = "blue" | "teal" | "amber";

const money = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});

/**
 * Presents the latest persisted accounting evidence without demo values.
 *
 * @param props Officer role and navigation callbacks.
 * @returns Supabase-backed operational dashboard.
 */
export function DashboardPage({
  role,
  onOpenImports,
  onOpenReconciliation,
}: DashboardPageProps) {
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      setSnapshot(await loadDashboardSnapshot());
    } catch (caughtError) {
      setError(toErrorMessage(caughtError));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const readySources =
    snapshot?.sources.filter((source) => source.status === "ready").length ?? 0;
  const cycle = snapshot?.cycle ?? null;

  return (
    <div className="content dashboard-content">
      <section className="page-heading">
        <div>
          <div className="eyebrow">Resumen con datos reales</div>
          <h1>Estado contable</h1>
          <p>
            Sólo se muestran registros persistidos y evidencia cargada al sistema.
          </p>
        </div>
        <div className="heading-actions">
          <button
            className="secondary-action-button"
            type="button"
            onClick={() => void refresh()}
            disabled={isLoading}
          >
            {isLoading ? (
              <LoaderCircle className="spin" size={17} />
            ) : (
              <RefreshCw size={17} />
            )}
            Actualizar
          </button>
          <button
            className="primary-button"
            type="button"
            onClick={() => onOpenImports(true)}
            disabled={role !== "treasurer"}
          >
            <Upload size={18} />
            Cargar archivo
          </button>
        </div>
      </section>

      {error ? (
        <div className="form-error page-error" role="alert">
          <AlertTriangle size={18} />
          {error}
        </div>
      ) : null}

      {!cycle && !isLoading ? (
        <section className="panel glass empty-state dashboard-empty">
          <Archive size={32} />
          <strong>No existe un ciclo mensual cargado</strong>
          <span>Crea el periodo y carga sus documentos para comenzar.</span>
          <button
            className="primary-button compact-button"
            type="button"
            onClick={() => onOpenImports(false)}
          >
            Ir a cargas mensuales
          </button>
        </section>
      ) : null}

      {cycle && snapshot ? (
        <>
          <section className="period-bar glass">
            <div className="period-select">
              <CalendarDays size={20} />
              <div>
                <span>Periodo de descuento</span>
                <strong>{formatPeriod(cycle.discount_period)}</strong>
              </div>
            </div>
            <div className="divider" />
            <div className="period-select">
              <Building2 size={20} />
              <div>
                <span>Recaudación</span>
                <strong>{formatPeriod(cycle.collection_period)}</strong>
              </div>
            </div>
            <span className="pilot-pill">
              {cycle.is_pilot ? "Marcha blanca" : translateCycleStatus(cycle.status)}
            </span>
          </section>

          <section className="process glass">
            <div className="section-title">
              <div>
                <span className="eyebrow">Evidencia del ciclo</span>
                <h2>Fuentes disponibles</h2>
              </div>
              <span className="progress-copy">
                {readySources} de {snapshot.sources.length} fuentes listas
              </span>
            </div>
            <div className="steps dashboard-steps">
              {snapshot.sources.map((source) => (
                <SourceStep
                  key={source.kind}
                  title={source.label}
                  detail={describeSource(source.status, source.rowCount)}
                  state={source.status}
                />
              ))}
            </div>
          </section>

          <section className="kpi-grid">
            <MetricCard
              icon={Users}
              tone="teal"
              label="Socios activos"
              value={String(snapshot.activeMemberCount)}
              note="Padrón actualmente vigente"
            />
            <MetricCard
              icon={CircleDollarSign}
              tone="blue"
              label="Cuota social informada"
              value={formatNullableMoney(snapshot.socialFeeAmount)}
              note="Resultado efectivo entregado por Jumbo"
            />
            <MetricCard
              icon={FileSpreadsheet}
              tone="blue"
              label="Convenios informados"
              value={formatNullableMoney(snapshot.agreementAmount)}
              note="Total consolidado del resultado empresa"
            />
            <MetricCard
              icon={AlertTriangle}
              tone={snapshot.reviewRows > 0 ? "amber" : "teal"}
              label="Filas por revisar"
              value={String(snapshot.reviewRows)}
              note="No generan cuotas ni asientos"
            />
          </section>

          <div className="dashboard-grid">
            <section className="panel glass reconciliation">
              <div className="section-title">
                <div>
                  <span className="eyebrow">Estado del ciclo</span>
                  <h2>Bloqueos y pendientes reales</h2>
                </div>
                <button
                  className="text-button"
                  type="button"
                  onClick={onOpenReconciliation}
                >
                  Ver conciliación <ArrowRight size={16} />
                </button>
              </div>
              {snapshot.blockers.length === 0 ? (
                <div className="compact-safe-state dashboard-safe-state">
                  <ShieldCheck size={28} />
                  <strong>No hay bloqueos detectados en este ciclo</strong>
                  <span>Los cruces exactos pueden continuar en Conciliación.</span>
                </div>
              ) : (
                <div className="dashboard-blockers">
                  {snapshot.blockers.map((blocker) => (
                    <div className="dashboard-blocker" key={blocker}>
                      <AlertTriangle size={18} />
                      <span>{blocker}</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="table-note">
                <ShieldCheck size={17} />
                Una diferencia queda bloqueada para revisión manual; nunca se distribuye
                de forma arbitraria.
              </div>
            </section>

            <section className="panel glass alerts">
              <div className="section-title">
                <div>
                  <span className="eyebrow">Validación</span>
                  <h2>Observaciones de filas</h2>
                </div>
                <span className="alert-count">{snapshot.reviewRows}</span>
              </div>
              {snapshot.issues.length === 0 ? (
                <div className="compact-safe-state dashboard-issue-empty">
                  <Check size={25} />
                  <strong>Sin observaciones en las fuentes activas</strong>
                </div>
              ) : (
                <div className="alert-list">
                  {snapshot.issues.map((issue) => (
                    <button
                      className="alert-row"
                      key={issue.code}
                      type="button"
                      onClick={() => onOpenImports(false)}
                    >
                      <span className="alert-number amber">{issue.count}</span>
                      <span className="alert-copy">
                        <strong>{issue.label}</strong>
                        <small>Revisar filas de la carga</small>
                      </span>
                      <ArrowRight size={17} />
                    </button>
                  ))}
                </div>
              )}
            </section>

            <section className="panel glass activity-panel dashboard-activity">
              <div className="section-title">
                <div>
                  <span className="eyebrow">Trazabilidad</span>
                  <h2>Cargas recientes</h2>
                </div>
                <button
                  className="text-button"
                  type="button"
                  onClick={() => onOpenImports(false)}
                >
                  Ver cargas
                </button>
              </div>
              {snapshot.activities.length === 0 ? (
                <div className="empty-state compact-empty">
                  <Archive size={28} />
                  <strong>No hay archivos registrados</strong>
                </div>
              ) : (
                <div className="activity-list">
                  {snapshot.activities.map((activity) => (
                    <div className="activity-row" key={activity.id}>
                      <span className="file-icon"><FileSpreadsheet size={18} /></span>
                      <div>
                        <strong>{activity.fileName}</strong>
                        <small>
                          {translateSourceKind(activity.kind)} · {activity.detectedRows} filas
                          {activity.reviewRows > 0
                            ? ` · ${activity.reviewRows} por revisar`
                            : ""}
                          {activity.status === "superseded" ? " · descartado" : ""}
                        </small>
                      </div>
                      <time>{formatDateTime(activity.uploadedAt)}</time>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        </>
      ) : null}
    </div>
  );
}

function MetricCard({
  icon: MetricIcon,
  tone,
  label,
  value,
  note,
}: {
  icon: Icon;
  tone: Tone;
  label: string;
  value: string;
  note: string;
}) {
  return (
    <article className="kpi-card glass">
      <span className={`icon-well ${tone}`}><MetricIcon size={20} /></span>
      <span className="kpi-label">{label}</span>
      <strong className="money">{value}</strong>
      <span className="kpi-note">{note}</span>
    </article>
  );
}

function SourceStep({
  title,
  detail,
  state,
}: {
  title: string;
  detail: string;
  state: ReconciliationSourceStatus;
}) {
  const stepState = state === "ready" ? "done" : state === "needs-review" ? "current" : "pending";

  return (
    <div className={`process-step ${stepState}`}>
      <span className="step-icon">
        {state === "ready" ? <Check size={19} /> : <FileSpreadsheet size={19} />}
      </span>
      <div><strong>{title}</strong><span>{detail}</span></div>
    </div>
  );
}

function describeSource(status: ReconciliationSourceStatus, rows: number): string {
  if (status === "missing") return "Sin cargar";
  if (status === "archived") return "Archivado, sin interpretar";
  if (status === "needs-review") return `${rows} filas · revisar`;
  return `${rows} filas listas`;
}

function formatNullableMoney(value: number | null): string {
  return value === null ? "Sin datos" : money.format(value);
}

function formatPeriod(value: string): string {
  return new Intl.DateTimeFormat("es-CL", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}

function formatDateTime(value: string): string {
  if (!value) return "Sin fecha";
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

function translateSourceKind(kind: string): string {
  const labels: Record<string, string> = {
    provider_plan: "Convenio",
    funs_sent: "FUNS enviado",
    company_result: "Resultado empresa",
    bank_statement: "Cartola bancaria",
  };
  return labels[kind] ?? "Documento";
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Ocurrió un error inesperado.";
}
