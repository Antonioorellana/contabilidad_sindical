import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  FileSpreadsheet,
  LoaderCircle,
  ShieldCheck,
  Upload,
  X,
} from "lucide-react";
import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { parseImportFile } from "./spreadsheetParser";
import { uploadMonthlyFile } from "./importService";
import { validateImportFile } from "./fileIntegrity";
import type {
  MonthlyCycle,
  ParsedImportFile,
  Provider,
  SourceFileKind,
} from "./types";

interface UploadDialogProps {
  cycle: MonthlyCycle;
  providers: Provider[];
  initialKind?: SourceFileKind;
  onClose: () => void;
  onCompleted: () => Promise<void>;
}

const sourceKinds: Array<{
  value: SourceFileKind;
  label: string;
  detail: string;
}> = [
  {
    value: "provider_plan",
    label: "Planilla de convenio",
    detail: "CAPUAL, Clínica Rimo u Óptica",
  },
  {
    value: "funs_sent",
    label: "FUNS enviado",
    detail: "Copia de los descuentos enviados a Jumbo",
  },
  {
    value: "company_result",
    label: "Resultado empresa",
    detail: "Cuota social y descuentos efectivamente realizados",
  },
  {
    value: "bank_statement",
    label: "Cartola bancaria",
    detail: "Respaldo de Scotiabank",
  },
];

/**
 * Validates, previews and registers one immutable monthly source file.
 *
 * @param props - Active cycle, providers and completion callbacks.
 * @returns Modal upload workflow.
 */
export function UploadDialog({
  cycle,
  providers,
  initialKind = "company_result",
  onClose,
  onCompleted,
}: UploadDialogProps) {
  const [kind, setKind] = useState<SourceFileKind>(initialKind);
  const [providerId, setProviderId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<ParsedImportFile | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isUploading) {
        onClose();
      }
    };

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [isUploading, onClose]);

  const inspectFile = async (selectedFile: File, selectedKind: SourceFileKind) => {
    setIsParsing(true);
    setError(null);
    setParsed(null);

    try {
      validateImportFile(selectedFile);
      setParsed(await parseImportFile(selectedFile, selectedKind));
    } catch (caughtError) {
      setError(toErrorMessage(caughtError));
    } finally {
      setIsParsing(false);
    }
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0] ?? null;
    setFile(selectedFile);
    if (selectedFile) {
      void inspectFile(selectedFile, kind);
    }
  };

  const handleKindChange = (nextKind: SourceFileKind) => {
    setKind(nextKind);
    if (nextKind !== "provider_plan") {
      setProviderId("");
    }
    if (file) {
      void inspectFile(file, nextKind);
    }
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!file || !parsed || isUploading) {
      return;
    }

    setIsUploading(true);
    setError(null);

    try {
      await uploadMonthlyFile({
        cycle,
        providerId: kind === "provider_plan" ? providerId || null : null,
        kind,
        file,
        parsed,
      });
      await onCompleted();
      onClose();
    } catch (caughtError) {
      setError(toErrorMessage(caughtError));
    } finally {
      setIsUploading(false);
    }
  };

  const localReviewCount = parsed?.rows.filter((row) => row.issues.length > 0).length ?? 0;

  return (
    <div className="modal-layer">
      <button
        className="modal-scrim"
        type="button"
        aria-label="Cerrar carga"
        onClick={isUploading ? undefined : onClose}
      />
      <section
        className="upload-modal import-modal glass"
        role="dialog"
        aria-modal="true"
        aria-labelledby="upload-title"
      >
        <div className="modal-heading">
          <div>
            <div className="eyebrow">Periodo {formatPeriod(cycle.discount_period)}</div>
            <h2 id="upload-title">Cargar documento mensual</h2>
          </div>
          <button
            className="icon-button"
            type="button"
            onClick={onClose}
            disabled={isUploading}
          >
            <X size={19} />
            <span className="sr-only">Cerrar</span>
          </button>
        </div>

        <form className="import-form" onSubmit={submit}>
          <fieldset className="kind-grid">
            <legend>Tipo de documento</legend>
            {sourceKinds.map((sourceKind) => (
              <label
                key={sourceKind.value}
                className={`kind-option ${kind === sourceKind.value ? "selected" : ""}`}
              >
                <input
                  type="radio"
                  name="source-kind"
                  value={sourceKind.value}
                  checked={kind === sourceKind.value}
                  onChange={() => handleKindChange(sourceKind.value)}
                  disabled={isUploading}
                />
                <span>
                  <strong>{sourceKind.label}</strong>
                  <small>{sourceKind.detail}</small>
                </span>
              </label>
            ))}
          </fieldset>

          {kind === "provider_plan" ? (
            <label className="form-field">
              <span>Convenio que envía la planilla</span>
              <select
                value={providerId}
                onChange={(event) => setProviderId(event.target.value)}
                required
                disabled={isUploading || providers.length === 0}
              >
                <option value="">Seleccionar convenio</option>
                {providers.map((provider) => (
                  <option key={provider.id} value={provider.id}>
                    {provider.legal_name} · {provider.rut}
                  </option>
                ))}
              </select>
              {providers.length === 0 ? (
                <small className="field-warning">
                  Primero deben registrarse el RUT y los datos bancarios del proveedor.
                </small>
              ) : null}
            </label>
          ) : null}

          <label className="file-drop">
            <input
              type="file"
              accept=".xlsx,.csv,.xls,.pdf"
              onChange={handleFileChange}
              disabled={isUploading}
            />
            <span className="file-drop-icon">
              {isParsing ? <LoaderCircle className="spin" size={25} /> : <Upload size={25} />}
            </span>
            <strong>{file ? file.name : "Seleccionar archivo original"}</strong>
            <small>XLSX y CSV se analizan · XLS y PDF se archivan · máximo 25 MB</small>
          </label>

          {parsed ? (
            <div className={`file-preview ${parsed.canProcess ? "" : "archive-only"}`}>
              {parsed.canProcess ? <FileSpreadsheet size={20} /> : <Archive size={20} />}
              <div>
                <strong>
                  {parsed.canProcess
                    ? `${parsed.rows.length} filas detectadas en ${parsed.sheetCount} hoja(s)`
                    : "Archivo listo para resguardo"}
                </strong>
                <small>
                  {parsed.notice ??
                    `${localReviewCount} observación(es) locales; la base validará además los socios.`}
                </small>
              </div>
              {parsed.canProcess && localReviewCount === 0 ? (
                <CheckCircle2 className="preview-ok" size={20} />
              ) : (
                <AlertTriangle className="preview-warning" size={20} />
              )}
            </div>
          ) : null}

          {error ? (
            <div className="form-error" role="alert">
              <AlertTriangle size={17} />
              {error}
            </div>
          ) : null}

          <div className="privacy-note">
            <ShieldCheck size={17} />
            Se guardará el original privado con huella SHA‑256. Ninguna fila crea
            asientos, cuotas o deudas hasta superar la revisión correspondiente.
          </div>

          <div className="modal-actions">
            <button
              className="secondary-button"
              type="button"
              onClick={onClose}
              disabled={isUploading}
            >
              Cancelar
            </button>
            <button
              className="primary-button"
              type="submit"
              disabled={
                !file ||
                !parsed ||
                isParsing ||
                isUploading ||
                (kind === "provider_plan" && !providerId)
              }
            >
              {isUploading ? <LoaderCircle className="spin" size={18} /> : <Upload size={18} />}
              {isUploading ? "Protegiendo archivo…" : "Guardar y prevalidar"}
            </button>
          </div>
        </form>
      </section>
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
