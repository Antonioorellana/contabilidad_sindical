import { describe, expect, it } from "vitest";
import { buildMemberAccount } from "./memberAccountModel";
import { buildMemberSearchFilter } from "./memberAccountService";
import type {
  MemberAgreementOperation,
  MemberDirectoryItem,
  MemberStagedMovement,
} from "./types";

const member: MemberDirectoryItem = {
  id: "member-one",
  rut: "12345678-5",
  full_name: "Persona de Prueba",
  status: "active",
  authorized_on: null,
  inactive_on: null,
};

describe("buildMemberAccount", () => {
  it("muestra descuentos respaldados sin inventar una deuda", () => {
    const account = buildMemberAccount(
      member,
      [
        createMovement("social", "social_fee", 8_000),
        createMovement("agreement", "agreement", 30_000),
      ],
      [],
    );

    expect(account.socialFeePaid).toBe(8_000);
    expect(account.agreementsDiscounted).toBe(30_000);
    expect(account.overdueDebt).toBeNull();
    expect(account.upcomingInstallments).toBeNull();
    expect(account.hasCanonicalDebtData).toBe(false);
  });

  it("calcula deuda sólo desde cuotas canónicas no descontadas", () => {
    const operation: MemberAgreementOperation = {
      id: "operation-one",
      purchased_on: "2026-07-01",
      total_amount: 60_000,
      installment_count: 3,
      status: "active",
      providers: { legal_name: "Proveedor de prueba" },
      installments: [
        {
          id: "installment-one",
          installment_number: 1,
          discount_period: "2026-07-01",
          amount: 20_000,
          status: "discounted",
        },
        {
          id: "installment-two",
          installment_number: 2,
          discount_period: "2026-08-01",
          amount: 20_000,
          status: "not_discounted",
        },
        {
          id: "installment-three",
          installment_number: 3,
          discount_period: "2026-09-01",
          amount: 20_000,
          status: "scheduled",
        },
      ],
    };

    const account = buildMemberAccount(member, [], [operation]);

    expect(account.overdueDebt).toBe(20_000);
    expect(account.upcomingInstallments).toBe(20_000);
    expect(account.operations[0]).toMatchObject({
      paidAmount: 20_000,
      overdueAmount: 20_000,
      upcomingAmount: 20_000,
      paidInstallments: 1,
    });
  });

  it("no suma filas que todavía están en revisión manual", () => {
    const movement = createMovement("review", "social_fee", 8_000);
    movement.validation_status = "manual_review";

    const account = buildMemberAccount(member, [movement], []);

    expect(account.socialFeePaid).toBe(0);
    expect(account.movements[0].state).toBe("manual-review");
  });
});

describe("buildMemberSearchFilter", () => {
  it("elimina puntuación peligrosa y conserva búsqueda por RUT", () => {
    const filter = buildMemberSearchFilter("12.345.678-5),status.eq.inactive");

    expect(filter).toContain("full_name.ilike");
    expect(filter).toContain("rut.ilike");
    expect(filter).not.toContain("status.eq");
    expect(filter).not.toContain(")");
  });
});

function createMovement(
  id: string,
  recordType: MemberStagedMovement["record_type"],
  amount: number,
): MemberStagedMovement {
  return {
    id,
    amount,
    record_type: recordType,
    category:
      recordType === "social_fee"
        ? "Cuota Sind. Jumbo Copiapó"
        : "Cuota Extra Sind. Jumbo Adm. N",
    validation_status: "ready",
    issue_codes: [],
    import_batches: {
      source_files: {
        kind: "company_result",
        uploaded_at: "2026-08-03T10:00:00Z",
        providers: null,
        monthly_cycles: {
          discount_period: "2026-07-01",
          collection_period: "2026-08-01",
        },
      },
    },
  };
}
