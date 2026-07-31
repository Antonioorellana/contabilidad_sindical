import { useEffect, useRef, useState, type ComponentType } from "react";
import {
  Activity,
  ArrowDownToLine,
  FileCheck2,
  FolderLock,
  Handshake,
  LayoutDashboard,
  LogOut,
  Menu,
  Search,
  Settings,
  ShieldCheck,
  Users,
  WalletCards,
  X,
} from "lucide-react";
import { AuthGate } from "./features/auth/AuthGate";
import type { AuthenticatedOfficer } from "./features/auth/useAuth";
import { DashboardPage } from "./features/dashboard/DashboardPage";
import { MemberAccountsPage } from "./features/member-accounts/MemberAccountsPage";
import { MonthlyImportsPage } from "./features/monthly-imports/MonthlyImportsPage";
import { ReconciliationPage } from "./features/reconciliation/ReconciliationPage";
import { ModulePlaceholderPage } from "./features/shared/ModulePlaceholderPage";
import { supabase } from "./lib/supabase";

type Icon = ComponentType<{ size?: number; strokeWidth?: number }>;

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

const pendingModules: Record<string, string> = {
  Convenios:
    "Aquí se administrarán las operaciones, cuotas, excepciones y pagos de cada proveedor.",
  "Ingresos y egresos":
    "Aquí se registrarán movimientos bancarios con aprobación separada entre tesorería y presidencia.",
  Cierres:
    "Aquí se preparará el expediente mensual y el acta para la comisión revisora de cuentas.",
  Documentos:
    "Aquí se consultarán comprobantes, certificados y expedientes respaldados.",
  Auditoría:
    "Aquí se visualizará el historial de cambios sin exponer datos personales innecesarios.",
  Configuración:
    "Aquí se definirán los datos legales del sindicato, reglas y responsables autorizados.",
};

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
        window.requestAnimationFrame(() => searchInputRef.current?.focus());
      }
    };

    window.addEventListener("keydown", focusSearch);
    return () => window.removeEventListener("keydown", focusSearch);
  }, []);

  const openImports = (openUpload: boolean) => {
    setActive("Cargas mensuales");
    if (openUpload) {
      setOpenUploadSignal((current) => current + 1);
    }
  };

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
          <button
            className="icon-button sidebar-close"
            type="button"
            onClick={() => setSidebarOpen(false)}
          >
            <X size={20} />
            <span className="sr-only">Cerrar menú</span>
          </button>
        </div>

        <nav aria-label="Navegación principal">
          {navigation.map(({ label, icon: NavIcon }) => (
            <button
              key={label}
              className={`nav-item ${active === label ? "active" : ""}`}
              type="button"
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
          <button
            className={`nav-item ${active === "Configuración" ? "active" : ""}`}
            type="button"
            onClick={() => setActive("Configuración")}
          >
            <Settings size={19} />
            <span>Configuración</span>
          </button>
          <div className="data-source-mini">
            <ShieldCheck size={18} />
            <div>
              <strong>Datos reales</strong>
              <span>Sin cifras demostrativas</span>
            </div>
          </div>
        </div>
      </aside>

      {sidebarOpen ? (
        <button
          className="mobile-scrim"
          type="button"
          onClick={() => setSidebarOpen(false)}
          aria-label="Cerrar menú"
        />
      ) : null}

      <main className="main">
        <header className="topbar">
          <button
            className="icon-button menu-button"
            type="button"
            onClick={() => setSidebarOpen(true)}
          >
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
              type="button"
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

        {active === "Inicio" ? (
          <DashboardPage
            role={officer.role}
            onOpenImports={openImports}
            onOpenReconciliation={() => setActive("Conciliación")}
          />
        ) : active === "Cargas mensuales" ? (
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
            onOpenImports={() => openImports(false)}
          />
        ) : (
          <ModulePlaceholderPage
            title={active}
            description={pendingModules[active] ?? "Módulo pendiente de implementación."}
          />
        )}
      </main>
    </div>
  );
}

export default App;
