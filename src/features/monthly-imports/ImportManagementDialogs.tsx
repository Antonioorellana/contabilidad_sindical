import {
  AlertTriangle,
  CheckCircle2,
  LoaderCircle,
  ShieldCheck,
  UserRoundCheck,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import {
  applyMemberRosterSync,
  previewMemberRosterSync,
  supersedeImportBatch,
} from "./importService";
import type { ImportBatchSummary, MemberRosterPreview } from "./types";

interface ManagementDialogProps {
  batch: ImportBatchSummary;
  onClose: () => void;
  onCompleted: () => Promise<void> | void;
}

/**
 * Confirms exclusion of a batch while retaining its immutable source evidence.
 */
export function SupersedeImportDialog({
  batch,
  onClose,
  onCompleted,
}: ManagementDialogProps) {
  const [reason, setReason] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (isSaving) return;
    setIsSaving(true);
    setError(null);

    try {
      await supersedeImportBatch(batch.id, reason);
      await onCompleted();
      onClose();
    } catch (caughtError) {
      setError(toErrorMessage(caughtError));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="modal-layer" role="presentation">
      <button className="modal-scrim" type="button" onClick={onClose} aria-label="Cerrar" />
      <section className="upload-modal glass management-modal" role="dialog" aria-modal="true" aria-labelledby="discard-title">
        <div className="modal-heading">
          <div>
            <div className="eyebrow">Exclusión auditable</div>
            <h2 id="discard-title">Descartar esta carga</h2>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Cerrar">
            <X size={20} />
          </button>
        </div>
        <p>
          <strong>{batch.source_files?.original_name}</strong> dejará de participar en
          cálculos y conciliaciones. El original, su huella y sus filas se conservarán.
        </p>
        <label className="management-field">
          <span>Motivo obligatorio</span>
          <textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={500}
            placeholder="Ej.: archivo duplicado; se utilizará la versión corregida."
            autoFocus
          />
          <small>{reason.trim().length}/500 caracteres</small>
        </label>
        {error ? <div className="form-error" role="alert"><AlertTriangle size={17} />{error}</div> : null}
        <div className="privacy-note">
          <ShieldCheck size={17} />
          Esta acción no borra evidencia contable y queda registrada con usuario, fecha y motivo.
        </div>
        <div className="modal-actions">
          <button className="secondary-button" type="button" onClick={onClose}>Cancelar</button>
          <button
            className="danger-button"
            type="button"
            onClick={() => void submit()}
            disabled={isSaving || reason.trim().length < 5}
          >
            {isSaving ? <LoaderCircle className="spin" size={17} /> : <AlertTriangle size={17} />}
            Descartar del cálculo
          </button>
        </div>
      </section>
    </div>
  );
}

/**
 * Previews and applies the employer's social-fee sheet as the active roster.
 */
export function RosterSyncDialog({
  batch,
  onClose,
  onCompleted,
}: ManagementDialogProps) {
  const [preview, setPreview] = useState<MemberRosterPreview | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isCurrent = true;
    setIsLoading(true);

    void previewMemberRosterSync(batch.id)
      .then((nextPreview) => {
        if (isCurrent) setPreview(nextPreview);
      })
      .catch((caughtError: unknown) => {
        if (isCurrent) setError(toErrorMessage(caughtError));
      })
      .finally(() => {
        if (isCurrent) setIsLoading(false);
      });

    return () => {
      isCurrent = false;
    };
  }, [batch.id]);

  const apply = async () => {
    if (!preview || !confirmed || isSaving) return;
    setIsSaving(true);
    setError(null);

    try {
      await applyMemberRosterSync(batch.id, preview.inactivated_members);
      await onCompleted();
      onClose();
    } catch (caughtError) {
      setError(toErrorMessage(caughtError));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="modal-layer" role="presentation">
      <button className="modal-scrim" type="button" onClick={onClose} aria-label="Cerrar" />
      <section className="upload-modal glass management-modal roster-modal" role="dialog" aria-modal="true" aria-labelledby="roster-title">
        <div className="modal-heading">
          <div>
            <div className="eyebrow">Padrón oficial del periodo</div>
            <h2 id="roster-title">Actualizar socios desde Jumbo</h2>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Cerrar">
            <X size={20} />
          </button>
        </div>
        <p>
          La hoja de cuotas sociales de <strong>{batch.source_files?.original_name}</strong>
          será la nómina activa del periodo. Revisa el impacto antes de confirmar.
        </p>

        {isLoading ? (
          <div className="management-loading"><LoaderCircle className="spin" size={25} />Preparando vista previa…</div>
        ) : null}

        {preview ? (
          <>
            <div className="roster-impact-grid">
              <Impact label="Socios en la nómina" value={preview.roster_rows} />
              <Impact label="Nuevos" value={preview.new_members} />
              <Impact label="Reactivados" value={preview.reactivated_members} />
              <Impact label="Nombres actualizados" value={preview.renamed_members} />
              <Impact
                label="Quedarán inactivos"
                value={preview.inactivated_members}
                warning={preview.inactivated_members > 0}
              />
            </div>

            {preview.already_applied ? (
              <div className="readonly-banner roster-applied">
                <CheckCircle2 size={18} />
                Esta carga ya fue aplicada al padrón. No se ejecutará nuevamente.
              </div>
            ) : (
              <label className="confirmation-check">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(event) => setConfirmed(event.target.checked)}
                />
                <span>
                  Confirmo que revisé la nómina y que {preview.inactivated_members} socio(s)
                  ausentes quedarán inactivos desde {formatPeriod(preview.discount_period)}.
                </span>
              </label>
            )}
          </>
        ) : null}

        {error ? <div className="form-error" role="alert"><AlertTriangle size={17} />{error}</div> : null}
        <div className="privacy-note">
          <ShieldCheck size={17} />
          La fecha histórica de ingreso no se inventa: los socios nuevos quedan con antigüedad pendiente de respaldo.
        </div>
        <div className="modal-actions">
          <button className="secondary-button" type="button" onClick={onClose}>Cancelar</button>
          <button
            className="primary-button"
            type="button"
            onClick={() => void apply()}
            disabled={!preview || preview.already_applied || !confirmed || isSaving}
          >
            {isSaving ? <LoaderCircle className="spin" size={17} /> : <UserRoundCheck size={17} />}
            Aplicar padrón real
          </button>
        </div>
      </section>
    </div>
  );
}

function Impact({ label, value, warning = false }: { label: string; value: number; warning?: boolean }) {
  return (
    <div className={`roster-impact ${warning ? "warning" : ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function formatPeriod(value: string): string {
  return new Intl.DateTimeFormat("es-CL", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Ocurrió un error inesperado.";
}
