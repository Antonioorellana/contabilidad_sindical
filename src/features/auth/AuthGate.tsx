import { useState, type FormEvent, type ReactNode } from "react";
import { KeyRound, LoaderCircle, LogOut, Mail, ShieldCheck } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { useAuth, type AuthenticatedOfficer } from "./useAuth";

interface AuthGateProps {
  children: (officer: AuthenticatedOfficer) => ReactNode;
}

/**
 * Restricts the accounting interface to pre-created active officer accounts.
 *
 * @param props - Render callback for the authenticated application.
 * @returns Authentication screen or the protected application.
 */
export function AuthGate({ children }: AuthGateProps) {
  const auth = useAuth();
  const [email, setEmail] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const requestAccessLink = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supabase || isSending) {
      return;
    }

    setIsSending(true);
    setMessage(null);

    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: {
        shouldCreateUser: false,
        emailRedirectTo: window.location.origin,
      },
    });

    setIsSending(false);
    setMessage(
      error
        ? "La cuenta no existe o no fue posible enviar el enlace."
        : "Revisa tu correo. El enlace de acceso vence automáticamente.",
    );
  };

  if (auth.isLoading) {
    return (
      <div className="auth-layout">
        <div className="auth-card glass auth-loading" role="status">
          <LoaderCircle className="spin" size={30} />
          <strong>Verificando acceso seguro</strong>
        </div>
      </div>
    );
  }

  if (auth.officer) {
    return <>{children(auth.officer)}</>;
  }

  if (auth.session) {
    return (
      <div className="auth-layout">
        <section className="auth-card glass">
          <img src="/app-icon-192.png" alt="" className="auth-icon" />
          <div className="eyebrow">Acceso restringido</div>
          <h1>Cuenta sin autorización contable</h1>
          <p>{auth.error}</p>
          <p className="auth-detail">
            Un usuario de Supabase no basta: también debe existir un perfil activo
            y un cargo vigente de presidencia o tesorería.
          </p>
          <button
            className="secondary-button"
            type="button"
            onClick={() => void supabase?.auth.signOut()}
          >
            <LogOut size={17} />
            Cerrar sesión
          </button>
        </section>
      </div>
    );
  }

  return (
    <div className="auth-layout">
      <section className="auth-card glass">
        <img src="/app-icon-192.png" alt="" className="auth-icon" />
        <div className="eyebrow">Control sindical</div>
        <h1>Contabilidad protegida</h1>
        <p>
          Acceso exclusivo para presidencia y tesorería. No existe registro
          público de cuentas.
        </p>

        <form className="auth-form" onSubmit={requestAccessLink}>
          <label htmlFor="officer-email">Correo autorizado</label>
          <div className="field-with-icon">
            <Mail size={18} />
            <input
              id="officer-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="nombre@correo.cl"
              required
            />
          </div>
          <button className="primary-button" type="submit" disabled={isSending}>
            {isSending ? <LoaderCircle className="spin" size={18} /> : <KeyRound size={18} />}
            Enviar enlace seguro
          </button>
        </form>

        {message ? <div className="auth-message" role="status">{message}</div> : null}

        <div className="privacy-note">
          <ShieldCheck size={17} />
          El enlace no crea usuarios nuevos y la autorización se valida nuevamente
          en la base de datos.
        </div>
      </section>
    </div>
  );
}
