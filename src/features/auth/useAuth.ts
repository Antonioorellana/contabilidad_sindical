import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../../lib/supabase";

export type OfficerRole = "president" | "treasurer";

export interface AuthenticatedOfficer {
  id: string;
  displayName: string;
  email: string;
  role: OfficerRole;
}

interface AuthState {
  isLoading: boolean;
  session: Session | null;
  officer: AuthenticatedOfficer | null;
  error: string | null;
}

const initialState: AuthState = {
  isLoading: true,
  session: null,
  officer: null,
  error: null,
};

/**
 * Resolves the browser session and the active union office assignment.
 *
 * @returns Current authentication and authorization state.
 */
export function useAuth(): AuthState {
  const [state, setState] = useState<AuthState>(initialState);

  useEffect(() => {
    if (!supabase) {
      setState({
        isLoading: false,
        session: null,
        officer: null,
        error: "Supabase no está configurado.",
      });
      return undefined;
    }

    const client = supabase;
    let isCurrent = true;
    let resolutionId = 0;
    const pendingResolutions = new Set<ReturnType<typeof setTimeout>>();

    const resolveOfficer = async (session: Session | null) => {
      const currentResolutionId = ++resolutionId;

      if (!session) {
        if (isCurrent && currentResolutionId === resolutionId) {
          setState({
            isLoading: false,
            session: null,
            officer: null,
            error: null,
          });
        }
        return;
      }

      const today = new Date().toISOString().slice(0, 10);
      const [profileResult, assignmentsResult] = await Promise.all([
        client
          .from("profiles")
          .select("display_name,is_active")
          .eq("id", session.user.id)
          .maybeSingle(),
        client
          .from("office_assignments")
          .select("role,starts_on,ends_on")
          .eq("user_id", session.user.id)
          .lte("starts_on", today)
          .or(`ends_on.is.null,ends_on.gte.${today}`),
      ]);

      if (!isCurrent || currentResolutionId !== resolutionId) {
        return;
      }

      const queryError = profileResult.error ?? assignmentsResult.error;
      if (queryError) {
        setState({
          isLoading: false,
          session,
          officer: null,
          error: "No fue posible verificar el cargo activo.",
        });
        return;
      }

      const assignments = assignmentsResult.data ?? [];
      const role = assignments.some(({ role: assignedRole }) => assignedRole === "treasurer")
        ? "treasurer"
        : assignments.some(({ role: assignedRole }) => assignedRole === "president")
          ? "president"
          : null;

      if (!profileResult.data?.is_active || !role) {
        setState({
          isLoading: false,
          session,
          officer: null,
          error: "La cuenta no tiene un cargo contable activo.",
        });
        return;
      }

      setState({
        isLoading: false,
        session,
        officer: {
          id: session.user.id,
          displayName: profileResult.data.display_name,
          email: session.user.email ?? "",
          role,
        },
        error: null,
      });
    };

    void client.auth.getSession().then(({ data, error }) => {
      if (error && isCurrent) {
        setState({
          isLoading: false,
          session: null,
          officer: null,
          error: "No fue posible recuperar la sesión.",
        });
        return;
      }

      void resolveOfficer(data.session);
    });

    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, session) => {
      // Supabase holds an authentication lock while this callback runs.
      // Defer database queries so the sign-in transaction can finish first.
      const timeout = setTimeout(() => {
        pendingResolutions.delete(timeout);
        void resolveOfficer(session);
      }, 0);
      pendingResolutions.add(timeout);
    });

    return () => {
      isCurrent = false;
      pendingResolutions.forEach(clearTimeout);
      pendingResolutions.clear();
      subscription.unsubscribe();
    };
  }, []);

  return state;
}
