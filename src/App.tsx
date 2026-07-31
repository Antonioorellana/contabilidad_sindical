import { useEffect, useRef, useState, type ComponentType } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpRight,
  Building2,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleDollarSign,
  Clock3,
  Cloud,
  FileCheck2,
  FileClock,
  FileSpreadsheet,
  FolderLock,
  Handshake,
  LayoutDashboard,
  LogOut,
  Menu,
  ReceiptText,
  Search,
  Settings,
  ShieldCheck,
  Upload,
  Users,
  WalletCards,
  X,
} from "lucide-react";
import { AuthGate } from "./features/auth/AuthGate";
import type { AuthenticatedOfficer } from "./features/auth/useAuth";
import { MemberAccountsPage } from "./features/member-accounts/MemberAccountsPage";
import { MonthlyImportsPage } from "./features/monthly-imports/MonthlyImportsPage";
import { ReconciliationPage } from "./features/reconciliation/ReconciliationPage";
import { supabase } from "./lib/supabase";

type Icon = ComponentType<{ size?: number; strokeWidth?: number }>;
type Tone = "blue" | "teal" | "amber" | "rose";

const money = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});

const navigation: Array<{ label: string; icon: Icon }> = [
  { label: "Inicio", icon: LayoutDashboard },
  { label: "Cargas mensuales", icon: ArrowDownToLine },
  { label: "Cuentas de socios", icon: Users },
  { label: "Conciliación", icon: ShieldCheck },
  { label: "Convenios", icon: Handshake },
  { label: "Ingresos y egresos", icon: WalletCards },
  { label: "Cierres", icon: FileCheck2 },
  { label: "Documentos", icon: FolderLock },
  { label: "Auditoría", icon: Activity },
];

const kpis: Array<{
  label: string;
  value: string;
  note: string;
  icon: Icon;
  tone: Tone;
}> = [
  {
    label: "Saldo de apertura",
    value: money.format(18_426_380),
    note: "Cartola al 30 de junio",
    icon: Building2,
    tone: "blue",
  },
  {
    label: "Cuotas esperadas",
    value: money.format(2_800_000),
    note: "350 socios × $8.000",
    icon: Users,
    tone: "teal",
  },
  {
    label: "Convenios solicitados",
    value: money.format(6_485_000),
    note: "Periodo julio 2026",
    icon: CircleDollarSign,
    tone: "blue",
  },
  {
    label: "Diferencias por revisar",
    value: "7",
    note: "Requieren resolución manual",
    icon: AlertTriangle,
    tone: "amber",
  },
];

const reconciliation = [
  { name: "Cuota social", expected: 2_800_000, reported: null },
  { name: "CAPUAL", expected: 3_210_000, reported: null },
  { name: "Clínica Rimo", expected: 1_825_000, reported: null },
  { name: "Óptica Joval", expected: 1_450_000, reported: null },
];

const alerts = [
  { count: 3, title: "Montos no coinciden", detail: "Diferencia entre FUNS y proveedor", tone: "rose" },
  { count: 2, title: "RUT no encontrados", detail: "Registros sin socio asociado", tone: "amber" },
  { count: 1, title: "Cuota duplicada", detail: "Operación detectada dos veces", tone: "amber" },
  { count: 1, title: "Depósito por asociar", detail: "Movimiento pendiente de conciliar", tone: "blue" },
] satisfies Array<{ count: number; title: string; detail: string; tone: Tone }>;

const activities = [
  {
    file: "FUNS JUMBO Copiapó.xlsx",
    detail: "Carga verificada · huella 2df8…91a3",
    time: "Hoy, 09:42",
  },
  {
    file: "descuento julio_corregido.xlsx",
    detail: "Clínica Rimo · 46 registros",
    time: "Ayer, 17:18",
  },
  {
    file: "Cartola junio 2026.pdf",
    detail: "Saldo de apertura registrado",
    time: "Ayer, 12:05",
  },
];

function App() {
  return (
    <AuthGate>
      {(officer) => <Application officer={officer} />}
    </AuthGate>
  );
}

function Application({ officer }: { officer: AuthenticatedOfficer }) {
  const [active, setActive] = useState("Inicio");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [openUploadSignal, setOpenUploadSignal] = useState(0);
  const [importSearch, setImportSearch] = useState("");
  const [memberSearch, setMemberSearch] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const initials = officer.displayName
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
  const roleLabel = officer.role === "treasurer" ? "Tesorería" : "Presidencia";

  useEffect(() => {
    const focusSearch = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setActive("Cuentas de socios");
        searchInputRef.current?.focus();
      }
    };

    window.addEventListener("keydown", focusSearch);
    return () => window.removeEventListener("keydown", focusSearch);
  }, []);

  return (
    <div className="app-shell">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />

      <aside className={`sidebar glass ${sidebarOpen ? "sidebar-open" : ""}`}>
        <div className="brand">
          <img src="/app-icon-192.png" alt="" className="brand-icon" />
          <div>
            <strong>Control sindical</strong>
            <span>Gestión financiera</span>
          </div>
          <button className="icon-button sidebar-close" onClick={() => setSidebarOpen(false)}>
            <X size={20} />
            <span className="sr-only">Cerrar menú</span>
          </button>
        </div>

        <nav aria-label="Navegación principal">
          {navigation.map(({ label, icon: NavIcon }) => (
            <button
              key={label}
              className={`nav-item ${active === label ? "active" : ""}`}
              onClick={() => {
                setActive(label);
                setSidebarOpen(false);
              }}
            >
              <NavIcon size={19} strokeWidth={2.1} />
              <span>{label}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <button className="nav-item" onClick={() => setActive("Configuración")}>
            <Settings size={19} />
            <span>Configuración</span>
          </button>
          <div className="backup-mini">
            <Cloud size={18} />
            <div>
              <strong>Respaldo protegido</strong>
              <span>Drive · hace 2 días</span>
            </div>
          </div>
        </div>
      </aside>

      {sidebarOpen && <button className="mobile-scrim" onClick={() => setSidebarOpen(false)} />}

      <main className="main">
        <header className="topbar">
          <button className="icon-button menu-button" onClick={() => setSidebarOpen(true)}>
            <Menu size={22} />
            <span className="sr-only">Abrir menú</span>
          </button>
          <div className="search">
            <Search size={18} />
            <input
              ref={searchInputRef}
              aria-label="Buscar socio por RUT o nombre"
              placeholder="Buscar socio por RUT o nombre"
              value={memberSearch}
              onChange={(event) => {
                setMemberSearch(event.target.value);
                setActive("Cuentas de socios");
              }}
            />
            <kbd>⌘ K</kbd>
          </div>
          <div className="top-actions">
            <div className="connection-status">
              <span />
              Sesión protegida
            </div>
            <button
              className="profile"
              aria-label={`Cerrar sesión de ${officer.displayName}`}
              onClick={() => void supabase?.auth.signOut()}
              title="Cerrar sesión"
            >
              <span>{initials}</span>
              <div><strong>{officer.displayName}</strong><small>{roleLabel}</small></div>
              <LogOut size={16} />
            </button>
          </div>
        </header>

        {active === "Cargas mensuales" ? (
          <MonthlyImportsPage
            role={officer.role}
            openUploadSignal={openUploadSignal}
            searchQuery={importSearch}
            onSearchQueryChange={setImportSearch}
          />
        ) : active === "Cuentas de socios" ? (
          <MemberAccountsPage
            role={officer.role}
            searchQuery={memberSearch}
            onSearchQueryChange={setMemberSearch}
          />
        ) : active === "Conciliación" ? (
          <ReconciliationPage
            role={officer.role}
            onOpenImports={() => setActive("Cargas mensuales")}
          />
        ) : (
          <div className="content">
          <section className="page-heading">
            <div>
              <div className="eyebrow">Resumen operativo</div>
              <h1>Buenos días, {roleLabel}</h1>
              <p>Todo lo necesario para completar el ciclo mensual, en un solo lugar.</p>
            </div>
            <button
              className="primary-button"
              onClick={() => {
                setActive("Cargas mensuales");
                setOpenUploadSignal((current) => current + 1);
              }}
              disabled={officer.role !== "treasurer"}
            >
              <Upload size={18} />
              Cargar archivos
            </button>
          </section>

          <section className="period-bar glass">
            <div className="period-select">
              <CalendarDays size={20} />
              <div>
                <span>Periodo de descuento</span>
                <strong>Julio 2026</strong>
              </div>
              <ChevronDown size={17} />
            </div>
            <div className="divider" />
            <div className="period-select">
              <ArrowUpRight size={20} />
              <div>
                <span>Recaudación estimada</span>
                <strong>Agosto 2026</strong>
              </div>
            </div>
            <span className="pilot-pill">Marcha blanca · Mes 1 de 2</span>
          </section>

          <section className="process glass">
            <div className="section-title">
              <div>
                <span className="eyebrow">Flujo mensual</span>
                <h2>Avance del periodo</h2>
              </div>
              <span className="progress-copy">2 de 4 etapas completadas</span>
            </div>
            <div className="steps">
              <ProcessStep icon={Handshake} title="Proveedores" detail="3 de 3 recibidos" state="done" />
              <ProcessStep icon={FileSpreadsheet} title="FUNS" detail="Enviado a empresa" state="done" />
              <ProcessStep icon={FileClock} title="Empresa" detail="Esperando resultado" state="current" />
              <ProcessStep icon={Building2} title="Banco" detail="Conciliación pendiente" state="pending" />
            </div>
          </section>

          <section className="kpi-grid">
            {kpis.map(({ label, value, note, icon: KpiIcon, tone }) => (
              <article className="kpi-card glass" key={label}>
                <span className={`icon-well ${tone}`}><KpiIcon size={20} /></span>
                <span className="kpi-label">{label}</span>
                <strong className="money">{value}</strong>
                <span className="kpi-note">{note}</span>
              </article>
            ))}
          </section>

          <div className="dashboard-grid">
            <section className="panel glass reconciliation">
              <div className="section-title">
                <div>
                  <span className="eyebrow">Cruce automático</span>
                  <h2>Conciliación del periodo</h2>
                </div>
                <button
                  className="text-button"
                  onClick={() => setActive("Conciliación")}
                >
                  Ver detalle <ArrowUpRight size={16} />
                </button>
              </div>
              <div className="table-head">
                <span>Concepto</span><span>Solicitado</span><span>Informado</span><span>Estado</span>
              </div>
              {reconciliation.map((row) => (
                <div className="reconciliation-row" key={row.name}>
                  <div className="concept"><span className="concept-mark" />{row.name}</div>
                  <strong className="money">{money.format(row.expected)}</strong>
                  <span className="muted">—</span>
                  <span className="status waiting"><Clock3 size={14} /> Esperando archivo</span>
                </div>
              ))}
              <div className="table-note">
                <ShieldCheck size={17} />
                La distribución automática se ejecutará solo si el total informado coincide exactamente.
              </div>
            </section>

            <section className="panel glass alerts">
              <div className="section-title">
                <div>
                  <span className="eyebrow">Centro de revisión</span>
                  <h2>Alertas que requieren acción</h2>
                </div>
                <span className="alert-count">7</span>
              </div>
              <div className="alert-list">
                {alerts.map((alert) => (
                  <button className="alert-row" key={alert.title}>
                    <span className={`alert-number ${alert.tone}`}>{alert.count}</span>
                    <span className="alert-copy">
                      <strong>{alert.title}</strong>
                      <small>{alert.detail}</small>
                    </span>
                    <ArrowUpRight size={17} />
                  </button>
                ))}
              </div>
              <button className="secondary-button">Revisar todas las alertas</button>
            </section>

            <section className="panel glass activity-panel">
              <div className="section-title">
                <div>
                  <span className="eyebrow">Trazabilidad</span>
                  <h2>Actividad reciente</h2>
                </div>
                <button className="text-button">Ver auditoría</button>
              </div>
              <div className="activity-list">
                {activities.map((item) => (
                  <div className="activity-row" key={item.file}>
                    <span className="file-icon"><ReceiptText size={18} /></span>
                    <div><strong>{item.file}</strong><small>{item.detail}</small></div>
                    <time>{item.time}</time>
                  </div>
                ))}
              </div>
            </section>

            <section className="deadline-card">
              <div className="deadline-top">
                <span className="icon-well amber"><Clock3 size={21} /></span>
                <span className="deadline-state">Próximo vencimiento</span>
              </div>
              <span className="deadline-date">09 JUL</span>
              <h2>Envío de FUNS</h2>
              <p>Hasta las 12:00 horas</p>
              <div className="countdown">
                <strong>3</strong><span>días restantes</span>
              </div>
              <div className="deadline-foot"><CheckCircle2 size={17} /> Archivo preparado y validado</div>
            </section>
          </div>
          </div>
        )}
      </main>
    </div>
  );
}

function ProcessStep({
  icon: StepIcon,
  title,
  detail,
  state,
}: {
  icon: Icon;
  title: string;
  detail: string;
  state: "done" | "current" | "pending";
}) {
  return (
    <div className={`process-step ${state}`}>
      <span className="step-icon">{state === "done" ? <Check size={19} /> : <StepIcon size={19} />}</span>
      <div><strong>{title}</strong><span>{detail}</span></div>
    </div>
  );
}

export default App;
