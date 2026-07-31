import { supabase } from "../../lib/supabase";
import { buildMemberAccount } from "./memberAccountModel";
import type {
  MemberAccount,
  MemberAgreementOperation,
  MemberDirectoryItem,
  MemberDirectoryPage,
  MemberStagedMovement,
} from "./types";

const DIRECTORY_LIMIT = 60;

/**
 * Loads a bounded officer-only member directory.
 *
 * @param rawSearch Optional RUT or name fragment.
 * @returns Matching count and up to 60 members ordered by name.
 */
export async function loadMemberDirectory(
  rawSearch: string,
): Promise<MemberDirectoryPage> {
  const client = requireSupabase();
  let query = client
    .from("members")
    .select("id,rut,full_name,status,authorized_on,inactive_on", {
      count: "exact",
    })
    .order("full_name", { ascending: true })
    .limit(DIRECTORY_LIMIT);
  const searchFilter = buildMemberSearchFilter(rawSearch);

  if (searchFilter) {
    query = query.or(searchFilter);
  }

  const { count, data, error } = await query;
  if (error) {
    throw new Error(`No fue posible buscar socios: ${error.message}`);
  }

  return {
    members: (data ?? []) as MemberDirectoryItem[],
    total: count ?? 0,
  };
}

/**
 * Loads the complete working account for one member.
 *
 * @param memberId Persistent member identifier.
 * @returns Imported payroll evidence and canonical agreement balances.
 */
export async function loadMemberAccount(
  memberId: string,
): Promise<MemberAccount> {
  const client = requireSupabase();
  const [memberResult, movementsResult, operationsResult] = await Promise.all([
    client
      .from("members")
      .select("id,rut,full_name,status,authorized_on,inactive_on")
      .eq("id", memberId)
      .single(),
    client
      .from("staged_import_rows")
      .select(`
        id,
        amount,
        record_type,
        category,
        validation_status,
        issue_codes,
        import_batches!inner (
          source_files!inner (
            kind,
            uploaded_at,
            providers (legal_name),
            monthly_cycles (discount_period, collection_period)
          )
        )
      `)
      .eq("member_id", memberId)
      .order("created_at", { ascending: false })
      .limit(500),
    client
      .from("agreement_operations")
      .select(`
        id,
        purchased_on,
        total_amount,
        installment_count,
        status,
        providers!inner (legal_name),
        installments (
          id,
          installment_number,
          discount_period,
          amount,
          status
        )
      `)
      .eq("member_id", memberId)
      .order("purchased_on", { ascending: false }),
  ]);

  const error =
    memberResult.error ?? movementsResult.error ?? operationsResult.error;
  if (error) {
    throw new Error(`No fue posible cargar la cuenta del socio: ${error.message}`);
  }

  return buildMemberAccount(
    memberResult.data as MemberDirectoryItem,
    (movementsResult.data ?? []) as unknown as MemberStagedMovement[],
    (operationsResult.data ?? []) as unknown as MemberAgreementOperation[],
  );
}

/**
 * Builds a PostgREST-safe name/RUT filter.
 *
 * @param rawSearch Untrusted search input.
 * @returns OR expression with unsupported punctuation removed.
 */
export function buildMemberSearchFilter(rawSearch: string): string {
  const normalized = rawSearch.normalize("NFKC").trim().slice(0, 80);
  if (!normalized) {
    return "";
  }

  const filters: string[] = [];
  const safeName = normalized
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (safeName) {
    filters.push(`full_name.ilike.%${safeName}%`);
  }

  const compactRut = normalized.toUpperCase().replace(/[^0-9K]/g, "");
  if (compactRut.length >= 2) {
    const formattedRut = `${compactRut.slice(0, -1)}-${compactRut.slice(-1)}`;
    filters.push(`rut.ilike.%${compactRut}%`);
    filters.push(`rut.ilike.%${formattedRut}%`);
  }

  return filters.join(",");
}

function requireSupabase() {
  if (!supabase) {
    throw new Error("Supabase no está configurado.");
  }

  return supabase;
}
