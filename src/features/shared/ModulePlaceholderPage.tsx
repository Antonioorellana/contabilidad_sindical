import { Construction, ShieldCheck } from "lucide-react";

interface ModulePlaceholderPageProps {
  title: string;
  description: string;
}

/**
 * Makes unfinished modules explicit so no demonstration data is mistaken for reality.
 *
 * @param props Module title and its next operational milestone.
 * @returns Honest empty state with no synthetic records.
 */
export function ModulePlaceholderPage({
  title,
  description,
}: ModulePlaceholderPageProps) {
  return (
    <div className="content placeholder-content">
      <section className="page-heading">
        <div>
          <div className="eyebrow">Módulo sin datos operativos</div>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
      </section>
      <section className="panel glass empty-state module-placeholder">
        <Construction size={36} />
        <strong>Este módulo todavía no está habilitado</strong>
        <span>
          No se mostrarán cifras de ejemplo. Se activará cuando exista su flujo,
          validación y trazabilidad completos.
        </span>
        <div className="privacy-inline">
          <ShieldCheck size={17} />
          Los datos reales no se simulan ni se completan automáticamente.
        </div>
      </section>
    </div>
  );
}
