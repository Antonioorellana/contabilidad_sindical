import {
  AlertTriangle,
  BadgeDollarSign,
  CalendarClock,
  ChevronRight,
  CircleDollarSign,
  FileClock,
  Handshake,
  History,
  Landmark,
  LoaderCircle,
  Search,
  ShieldCheck,
  UserRound,
  Users,
} from "lucide-react";
import {
  useEffect,
  useState,
} from "react";
import type { OfficerRole } from "../auth/useAuth";
import {
  loadMemberAccount,
  loadMemberDirectory,
} from "./memberAccountService";
import type {
  MemberAccount,
  MemberDirectoryItem,
  MemberLedgerState,
  MemberStatusFilter,
} from "./types";

interface MemberAccountsPageProps {
  role: OfficerRole;
  searchQuery: string;
  onSearchQueryChange: (search: string) => void;
}

const money = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});

/**
 * Presents a bank-style working account for every union member.
 *
 * @param props Officer role and global member-search state.
 * @returns Searchable directory, verified movements and backed debt balances.
 */
export function MemberAccountsPage({
  role,
  searchQuery,
  onSearchQueryChange,
}: MemberAccountsPageProps) {
  const deferredSearch = useDebouncedValue(searchQuery, 250);
  const [members, setMembers] = useState<MemberDirectoryItem[]>([]);
  const [directoryTotal, setDirectoryTotal] = useState(0);
  const [selectedMemberId, setSelectedMemberId] = useState("");
  const [statusFilter, setStatusFilter] = useState<MemberStatusFilter>("active");
  const [account, setAccount] = useState<MemberAccount | null>(null);
  const [isDirectoryLoading, setIsDirectoryLoading] = useState(true);
  const [isAccountLoading, setIsAccountLoading] = useState(false);
  const [directoryError, setDirectoryError] = useState<string | null>(null);
  const [accountError, setAccountError] = useState<string | null>(null);

  useEffect(() => {
    let isCurrent = true;
    setIsDirectoryLoading(true);
    setDirectoryError(null);

    void loadMemberDirectory(deferredSearch, statusFilter)
      .then(({ members: nextMembers, total }) => {
        if (!isCurrent) {
          return;
        }

        setMembers(nextMembers);
        setDirectoryTotal(total);
        setSelectedMemberId((current) => {
          if (nextMembers.some((member) => member.id === current)) {
            return current;
          }
          return nextMembers[0]?.id ?? "";
        });
      })
      .catch((error: unknown) => {
        if (isCurrent) {
          setMembers([]);
          setDirectoryTotal(0);
          setSelectedMemberId("");
          setDirectoryError(toErrorMessage(error));
        }
      })
      .finally(() => {
        if (isCurrent) {
          setIsDirectoryLoading(false);
        }
      });

    return () => {
      isCurrent = false;
    };
  }, [deferredSearch, statusFilter]);

  useEffect(() => {
    if (!selectedMemberId) {
      setAccount(null);
      return;
    }

    let isCurrent = true;
    setIsAccountLoading(true);
    setAccountError(null);

    void loadMemberAccount(selectedMemberId)
      .then((nextAccount) => {
        if (isCurrent) {
          setAccount(nextAccount);
        }
      })
      .catch((error: unknown) => {
        if (isCurrent) {
          setAccount(null);
          setAccountError(toErrorMessage(error));
        }
      })
      .finally(() => {
        if (isCurrent) {
          setIsAccountLoading(false);
        }
      });

    return () => {
      isCurrent = false;
    };
  }, [selectedMemberId]);

  return (
    <div className="content member-accounts-content">
      <section className="page-heading">
        <div>
          <div className="eyebrow">Consulta operativa</div>
          <h1>Cuentas de socios</h1>
          <p>
            Historial de descuentos, convenios y deuda respaldada por persona.
          </p>
        </div>
        <div className="directory-count glass">
          <Users size={18} />
          <div>
            <strong>{directoryTotal}</strong>
            <span>
              {deferredSearch ? "coincidencias" : translateFilter(statusFilter)}
            </span>
          </div>
        </div>
      </section>

      <section className="member-search-bar glass">
        <Search size={19} />
        <input
          value={searchQuery}
          onChange={(event) => onSearchQueryChange(event.target.value)}
          placeholder="Buscar socio por RUT o nombre"
          autoComplete="off"
          aria-label="Buscar socio por RUT o nombre"
        />
        {isDirectoryLoading ? (
          <LoaderCircle className="spin" size={18} />
        ) : (
          <kbd>⌘ K</kbd>
        )}
        <label className="member-status-filter">
          <span className="sr-only">Filtrar padrón por estado</span>
          <select
            value={statusFilter}
            onChange={(event) =>
              setStatusFilter(event.target.value as MemberStatusFilter)
            }
            aria-label="Filtrar padrón por estado"
          >
            <option value="active">Activos</option>
            <option value="inactive">Inactivos</option>
            <option value="review">Por revisar</option>
            <option value="all">Todos</option>
          </select>
        </label>
      </section>

      {role === "president" ? (
        <div className="readonly-banner">
          <ShieldCheck size={18} />
          Presidencia dispone de consulta completa. Las futuras correcciones de
          cuotas y deudas serán operaciones exclusivas de tesorería.
        </div>
      ) : null}

      {directoryError ? (
        <div className="form-error page-error" role="alert">
          <AlertTriangle size={18} />
          {directoryError}
        </div>
      ) : null}

      <div className="member-account-layout">
        <aside className="panel glass member-directory">
          <div className="section-title">
            <div>
              <div className="eyebrow">Padrón</div>
              <h2>Socios encontrados</h2>
            </div>
            <span className="directory-result-count">{directoryTotal}</span>
          </div>

          <div className="member-directory-list">
            {!isDirectoryLoading && members.length === 0 ? (
              <div className="empty-state compact-empty">
                <UserRound size={27} />
                <strong>No hay coincidencias</strong>
                <span>Revisa el nombre o RUT ingresado.</span>
              </div>
            ) : null}
            {members.map((member) => (
              <button
                className={`member-directory-row ${
                  member.id === selectedMemberId ? "selected" : ""
                }`}
                type="button"
                key={member.id}
                onClick={() => setSelectedMemberId(member.id)}
                aria-pressed={member.id === selectedMemberId}
              >
                <span className="member-avatar">
                  {getInitials(member.full_name)}
                </span>
                <span className="member-directory-copy">
                  <strong>{member.full_name}</strong>
                  <small>
                    {member.rut} · {translateMemberStatus(member.status)}
                  </small>
                </span>
                <ChevronRight size={17} />
              </button>
            ))}
          </div>

          <footer className="member-directory-foot">
            Se muestran hasta 60 resultados. Usa la búsqueda para encontrar otro
            socio.
          </footer>
        </aside>

        <section className="member-account-main">
          {accountError ? (
            <div className="form-error page-error" role="alert">
              <AlertTriangle size={18} />
              {accountError}
            </div>
          ) : null}

          {isAccountLoading ? (
            <section className="panel glass account-loading" aria-live="polite">
              <LoaderCircle className="spin" size={27} />
              <strong>Cargando cuenta del socio</strong>
            </section>
          ) : null}

          {!isAccountLoading && !account ? (
            <section className="panel glass empty-state account-empty">
              <Landmark size={34} />
              <strong>Selecciona un socio</strong>
              <span>Su historial financiero aparecerá en este espacio.</span>
            </section>
          ) : null}

          {!isAccountLoading && account ? (
            <MemberAccountWorkspace account={account} />
          ) : null}
        </section>
      </div>
    </div>
  );
}

function MemberAccountWorkspace({ account }: { account: MemberAccount }) {
  return (
    <>
      <section className="member-account-hero">
        <div className="account-hero-top">
          <span className="account-hero-icon">
            <UserRound size={23} />
          </span>
          <span className={`member-state ${account.member.status}`}>
            {translateMemberStatus(account.member.status)}
          </span>
        </div>
        <div className="account-identity">
          <span>Cuenta sindical</span>
          <h2>{account.member.full_name}</h2>
          <strong>RUT {account.member.rut}</strong>
        </div>
        <div className="account-hero-summary">
          <div>
            <span>Movimientos respaldados</span>
            <strong>{account.movements.length}</strong>
          </div>
          <div>
            <span>Convenios registrados</span>
            <strong>{account.operations.length}</strong>
          </div>
          <div>
            <span>Antigüedad registrada</span>
            <strong>
              {account.member.authorized_on
                ? formatDate(account.member.authorized_on)
                : "Pendiente"}
            </strong>
          </div>
        </div>
      </section>

      <section className="account-kpis">
        <AccountMetric
          icon={CircleDollarSign}
          tone="teal"
          label="Cuota social pagada"
          value={money.format(account.socialFeePaid)}
          note="Descontado e informado por Jumbo"
        />
        <AccountMetric
          icon={BadgeDollarSign}
          tone="blue"
          label="Convenios descontados"
          value={money.format(account.agreementsDiscounted)}
          note="Total consolidado ya descontado"
        />
        <AccountMetric
          icon={AlertTriangle}
          tone={account.overdueDebt && account.overdueDebt > 0 ? "amber" : "teal"}
          label="Deuda vencida"
          value={formatBackedBalance(account.overdueDebt)}
          note={
            account.hasCanonicalDebtData
              ? "Cuotas marcadas como no descontadas"
              : "Faltan operaciones de proveedores"
          }
        />
        <AccountMetric
          icon={CalendarClock}
          tone="blue"
          label="Próximas cuotas"
          value={formatBackedBalance(account.upcomingInstallments)}
          note={
            account.hasCanonicalDebtData
              ? "Programadas o enviadas a descuento"
              : "Aún no existe calendario de cuotas"
          }
        />
      </section>

      {!account.hasCanonicalDebtData ? (
        <section className="account-data-warning">
          <FileClock size={20} />
          <div>
            <strong>Historial disponible; deuda todavía no calculable</strong>
            <span>
              Jumbo informó lo descontado, pero falta cargar FUNS y planillas
              normalizadas para separar cada convenio, cuota pendiente y saldo.
            </span>
          </div>
        </section>
      ) : null}

      <div className="account-detail-grid">
        <section className="panel glass account-movements-panel">
          <div className="section-title">
            <div>
              <div className="eyebrow">Cartola individual</div>
              <h2>Historial de cobros y pagos</h2>
            </div>
            <History size={20} className="section-icon" />
          </div>

          <div className="account-movement-head">
            <span>Periodo</span>
            <span>Movimiento</span>
            <span>Estado</span>
            <span>Monto</span>
          </div>
          <div className="account-movement-list">
            {account.movements.length === 0 ? (
              <div className="empty-state compact-empty">
                <History size={26} />
                <strong>Sin movimientos asociados</strong>
                <span>La próxima carga vinculada aparecerá aquí.</span>
              </div>
            ) : null}
            {account.movements.map((movement) => (
              <article className="account-movement-row" key={movement.id}>
                <div className="movement-period">
                  <strong>
                    {movement.period
                      ? formatPeriod(movement.period)
                      : "Sin periodo"}
                  </strong>
                  <small>
                    {movement.collectionPeriod
                      ? `Recaudación ${formatPeriod(movement.collectionPeriod)}`
                      : "Origen archivado"}
                  </small>
                </div>
                <div className="movement-copy">
                  <strong>{movement.label}</strong>
                  <small>{movement.detail}</small>
                </div>
                <span className={`movement-state ${movement.state}`}>
                  {translateMovementState(movement.state)}
                </span>
                <strong className="movement-amount">
                  {money.format(movement.amount)}
                </strong>
              </article>
            ))}
          </div>
        </section>

        <aside className="panel glass account-agreements-panel">
          <div className="section-title">
            <div>
              <div className="eyebrow">Créditos y convenios</div>
              <h2>Operaciones vigentes</h2>
            </div>
            <Handshake size={20} className="section-icon" />
          </div>

          {account.operations.length === 0 ? (
            <div className="empty-state account-operation-empty">
              <Handshake size={28} />
              <strong>Sin operaciones detalladas</strong>
              <span>
                No significa deuda cero: aún faltan planillas normalizadas.
              </span>
            </div>
          ) : (
            <div className="account-operation-list">
              {account.operations.map((operation) => (
                <article className="account-operation-card" key={operation.id}>
                  <div>
                    <strong>{operation.providerName}</strong>
                    <span>{translateOperationStatus(operation.status)}</span>
                  </div>
                  <dl>
                    <div>
                      <dt>Total</dt>
                      <dd>{money.format(operation.totalAmount)}</dd>
                    </div>
                    <div>
                      <dt>Pagado</dt>
                      <dd>{money.format(operation.paidAmount)}</dd>
                    </div>
                    <div>
                      <dt>Cuotas</dt>
                      <dd>
                        {operation.paidInstallments}/{operation.installmentCount}
                      </dd>
                    </div>
                  </dl>
                </article>
              ))}
            </div>
          )}
        </aside>
      </div>
    </>
  );
}

function AccountMetric({
  icon: Icon,
  tone,
  label,
  value,
  note,
}: {
  icon: typeof CircleDollarSign;
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

function translateMemberStatus(status: MemberDirectoryItem["status"]): string {
  const labels: Record<MemberDirectoryItem["status"], string> = {
    active: "Activo",
    inactive: "Inactivo",
    review: "Por revisar",
  };
  return labels[status];
}

function translateMovementState(state: MemberLedgerState): string {
  const labels: Record<MemberLedgerState, string> = {
    "provider-reported": "Informado",
    requested: "Solicitado",
    discounted: "Descontado",
    "manual-review": "Por revisar",
  };
  return labels[state];
}

function translateFilter(filter: MemberStatusFilter): string {
  const labels: Record<MemberStatusFilter, string> = {
    active: "socios activos",
    inactive: "socios inactivos",
    review: "socios por revisar",
    all: "socios registrados",
  };
  return labels[filter];
}

function translateOperationStatus(
  status: MemberAccount["operations"][number]["status"],
): string {
  const labels: Record<
    MemberAccount["operations"][number]["status"],
    string
  > = {
    pending: "Pendiente",
    active: "Vigente",
    completed: "Pagado",
    cancelled: "Anulado",
    union_assumed: "Asumido por sindicato",
  };
  return labels[status];
}

function formatBackedBalance(value: number | null): string {
  return value === null ? "Sin respaldo" : money.format(value);
}

function formatPeriod(value: string): string {
  const [year, month] = value.split("-").map(Number);
  if (!year || !month) {
    return value;
  }
  return new Intl.DateTimeFormat("es-CL", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, 1)));
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("es-CL", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "No fue posible cargar las cuentas de socios.";
}

function useDebouncedValue(value: string, delay: number): string {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => window.clearTimeout(timeoutId);
  }, [delay, value]);

  return debouncedValue;
}
