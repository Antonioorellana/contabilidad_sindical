begin;

create extension if not exists pgcrypto;

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create type public.app_role as enum (
  'president',
  'treasurer',
  'secretary',
  'member'
);

create type public.member_status as enum (
  'active',
  'inactive',
  'review'
);

create type public.cycle_status as enum (
  'draft',
  'submitted',
  'awaiting_company',
  'reconciling',
  'manual_review',
  'ready_to_close',
  'closed'
);

create type public.source_file_kind as enum (
  'provider_plan',
  'funs_sent',
  'company_result',
  'bank_statement',
  'bank_receipt',
  'review_record',
  'other'
);

create type public.import_status as enum (
  'uploaded',
  'processing',
  'processed',
  'failed',
  'superseded'
);

create type public.operation_status as enum (
  'pending',
  'active',
  'completed',
  'cancelled',
  'union_assumed'
);

create type public.installment_status as enum (
  'scheduled',
  'submitted',
  'discounted',
  'not_discounted',
  'provider_paid',
  'union_assumed',
  'cancelled'
);

create type public.request_status as enum (
  'draft',
  'included_in_funs',
  'sent',
  'matched',
  'manual_review'
);

create type public.reconciliation_status as enum (
  'pending',
  'automatic',
  'manual_review',
  'resolved'
);

create type public.alert_severity as enum (
  'info',
  'warning',
  'critical'
);

create type public.alert_status as enum (
  'open',
  'resolved',
  'dismissed'
);

create type public.financial_direction as enum (
  'income',
  'expense'
);

create type public.approval_status as enum (
  'draft',
  'pending_approval',
  'approved',
  'rejected',
  'executed',
  'reversed'
);

create type public.provider_payment_timing as enum (
  'before_collection',
  'after_collection'
);

create type public.debt_responsibility as enum (
  'provider',
  'member',
  'union'
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete restrict,
  display_name text not null check (char_length(trim(display_name)) between 2 and 120),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.office_assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete restrict,
  role public.app_role not null,
  starts_on date not null,
  ends_on date,
  created_at timestamptz not null default now(),
  constraint office_assignment_valid_period
    check (ends_on is null or ends_on >= starts_on),
  constraint office_assignment_unique_start
    unique (user_id, role, starts_on)
);

create index office_assignments_active_idx
  on public.office_assignments (user_id, role, starts_on, ends_on);

create table public.union_settings (
  id uuid primary key default gen_random_uuid(),
  legal_name text not null check (char_length(trim(legal_name)) between 3 and 180),
  rut text not null unique,
  rsu text not null unique,
  accounting_starts_on date not null default date '2026-07-01',
  bank_name text not null default 'Scotiabank',
  bank_account_label text not null default 'Cuenta corriente sindical',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.members (
  id uuid primary key default gen_random_uuid(),
  rut text not null unique,
  full_name text not null check (char_length(trim(full_name)) between 3 and 180),
  status public.member_status not null default 'review',
  authorized_on date,
  inactive_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint member_dates_consistent
    check (
      inactive_on is null
      or authorized_on is null
      or inactive_on >= authorized_on
    )
);

create index members_status_idx on public.members (status);

create table public.providers (
  id uuid primary key default gen_random_uuid(),
  legal_name text not null unique,
  rut text not null unique,
  bank_name text,
  bank_account_type text,
  bank_account_number text,
  bank_account_holder text,
  payment_timing public.provider_payment_timing not null,
  debt_after_termination public.debt_responsibility not null,
  maximum_operation_amount bigint
    check (maximum_operation_amount is null or maximum_operation_amount > 0),
  maximum_installments smallint
    check (maximum_installments is null or maximum_installments > 0),
  maximum_installment_amount bigint
    check (maximum_installment_amount is null or maximum_installment_amount > 0),
  allows_family boolean not null default false,
  requires_full_payment_before_new boolean not null default true,
  allows_exceptions boolean not null default true,
  additional_rules jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.monthly_cycles (
  id uuid primary key default gen_random_uuid(),
  discount_period date not null unique,
  collection_period date not null unique,
  provider_deadline timestamptz not null,
  employer_deadline timestamptz not null,
  expected_deposit_deadline date not null,
  status public.cycle_status not null default 'draft',
  is_pilot boolean not null default false,
  created_by uuid not null default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint monthly_cycle_first_day
    check (
      extract(day from discount_period) = 1
      and extract(day from collection_period) = 1
    ),
  constraint monthly_cycle_collection_next_month
    check (
      collection_period =
      (discount_period + interval '1 month')::date
    )
);

create table public.source_files (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid references public.monthly_cycles(id) on delete restrict,
  provider_id uuid references public.providers(id) on delete restrict,
  kind public.source_file_kind not null,
  original_name text not null,
  storage_path text not null unique,
  media_type text not null,
  size_bytes bigint not null check (size_bytes > 0),
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  uploaded_by uuid not null default auth.uid() references public.profiles(id),
  uploaded_at timestamptz not null default now(),
  constraint source_file_provider_required
    check (
      kind <> 'provider_plan'
      or provider_id is not null
    ),
  constraint source_file_unique_content_per_cycle
    unique nulls not distinct (cycle_id, kind, provider_id, sha256)
);

create index source_files_cycle_kind_idx
  on public.source_files (cycle_id, kind);

create table public.import_batches (
  id uuid primary key default gen_random_uuid(),
  source_file_id uuid not null unique references public.source_files(id) on delete restrict,
  status public.import_status not null default 'uploaded',
  detected_rows integer not null default 0 check (detected_rows >= 0),
  accepted_rows integer not null default 0 check (accepted_rows >= 0),
  rejected_rows integer not null default 0 check (rejected_rows >= 0),
  detected_total bigint check (detected_total is null or detected_total >= 0),
  error_summary jsonb not null default '[]'::jsonb,
  processed_by uuid references public.profiles(id) on delete restrict,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint import_batch_row_counts
    check (accepted_rows + rejected_rows <= detected_rows)
);

create table public.agreement_operations (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete restrict,
  provider_id uuid not null references public.providers(id) on delete restrict,
  source_file_id uuid references public.source_files(id) on delete restrict,
  provider_reference text,
  purchased_on date not null,
  total_amount bigint not null check (total_amount > 0),
  installment_count smallint not null check (installment_count > 0),
  status public.operation_status not null default 'pending',
  exception_requested boolean not null default false,
  exception_reason text,
  exception_proposed_by uuid references public.profiles(id) on delete restrict,
  exception_approved_by uuid references public.profiles(id) on delete restrict,
  exception_approved_at timestamptz,
  created_by uuid not null default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint agreement_operation_exception_complete
    check (
      exception_approved_by is null
      or (
        exception_requested
        and exception_reason is not null
        and exception_proposed_by is not null
        and exception_approved_at is not null
        and exception_approved_by <> exception_proposed_by
      )
    )
);

create index agreement_operations_member_status_idx
  on public.agreement_operations (member_id, status);

create table public.installments (
  id uuid primary key default gen_random_uuid(),
  operation_id uuid not null references public.agreement_operations(id) on delete restrict,
  installment_number smallint not null check (installment_number > 0),
  discount_period date not null check (extract(day from discount_period) = 1),
  amount bigint not null check (amount > 0),
  status public.installment_status not null default 'scheduled',
  submitted_at timestamptz,
  discounted_at timestamptz,
  provider_paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (operation_id, installment_number)
);

create index installments_period_status_idx
  on public.installments (discount_period, status);

create table public.payroll_requests (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references public.monthly_cycles(id) on delete restrict,
  member_id uuid not null references public.members(id) on delete restrict,
  funs_source_file_id uuid references public.source_files(id) on delete restrict,
  requested_amount bigint not null check (requested_amount > 0),
  status public.request_status not null default 'draft',
  created_by uuid not null default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cycle_id, member_id)
);

create table public.payroll_request_items (
  id uuid primary key default gen_random_uuid(),
  payroll_request_id uuid not null references public.payroll_requests(id) on delete restrict,
  installment_id uuid not null references public.installments(id) on delete restrict,
  amount bigint not null check (amount > 0),
  created_at timestamptz not null default now(),
  unique (payroll_request_id, installment_id)
);

create table public.company_results (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references public.monthly_cycles(id) on delete restrict,
  member_id uuid not null references public.members(id) on delete restrict,
  source_file_id uuid not null references public.source_files(id) on delete restrict,
  reported_amount bigint not null check (reported_amount >= 0),
  source_row_number integer not null check (source_row_number > 0),
  created_at timestamptz not null default now(),
  unique (cycle_id, member_id)
);

create table public.reconciliations (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references public.monthly_cycles(id) on delete restrict,
  member_id uuid not null references public.members(id) on delete restrict,
  payroll_request_id uuid references public.payroll_requests(id) on delete restrict,
  company_result_id uuid references public.company_results(id) on delete restrict,
  requested_amount bigint not null check (requested_amount >= 0),
  reported_amount bigint check (reported_amount is null or reported_amount >= 0),
  difference bigint generated always as (
    case
      when reported_amount is null then null
      else reported_amount - requested_amount
    end
  ) stored,
  status public.reconciliation_status not null default 'pending',
  resolution_reason text,
  resolved_by uuid references public.profiles(id) on delete restrict,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cycle_id, member_id),
  constraint reconciliation_resolution_complete
    check (
      status <> 'resolved'
      or (
        resolution_reason is not null
        and resolved_by is not null
        and resolved_at is not null
      )
    ),
  constraint automatic_reconciliation_exact
    check (
      status <> 'automatic'
      or (
        reported_amount is not null
        and reported_amount = requested_amount
      )
    )
);

create table public.reconciliation_allocations (
  id uuid primary key default gen_random_uuid(),
  reconciliation_id uuid not null references public.reconciliations(id) on delete restrict,
  installment_id uuid not null references public.installments(id) on delete restrict,
  allocated_amount bigint not null check (allocated_amount > 0),
  created_at timestamptz not null default now(),
  unique (reconciliation_id, installment_id)
);

create table public.alerts (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid references public.monthly_cycles(id) on delete restrict,
  severity public.alert_severity not null,
  code text not null,
  title text not null,
  entity_type text,
  entity_id uuid,
  details jsonb not null default '{}'::jsonb,
  status public.alert_status not null default 'open',
  resolved_by uuid references public.profiles(id) on delete restrict,
  resolved_at timestamptz,
  resolution_note text,
  created_at timestamptz not null default now(),
  constraint alert_resolution_complete
    check (
      status = 'open'
      or (
        resolved_by is not null
        and resolved_at is not null
        and resolution_note is not null
      )
    )
);

create index alerts_open_cycle_idx
  on public.alerts (cycle_id, severity)
  where status = 'open';

create table public.bank_movements (
  id uuid primary key default gen_random_uuid(),
  source_file_id uuid not null references public.source_files(id) on delete restrict,
  posted_on date not null,
  direction public.financial_direction not null,
  amount bigint not null check (amount > 0),
  bank_document_number text,
  description text not null,
  bank_fingerprint text not null unique,
  reconciled_at timestamptz,
  created_at timestamptz not null default now()
);

create index bank_movements_posted_idx
  on public.bank_movements (posted_on, direction);

create table public.financial_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  direction public.financial_direction not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.financial_transactions (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid references public.monthly_cycles(id) on delete restrict,
  category_id uuid not null references public.financial_categories(id) on delete restrict,
  bank_movement_id uuid unique references public.bank_movements(id) on delete restrict,
  supporting_file_id uuid references public.source_files(id) on delete restrict,
  direction public.financial_direction not null,
  occurred_on date not null,
  description text not null check (char_length(trim(description)) >= 3),
  amount bigint not null check (amount > 0),
  status public.approval_status not null default 'draft',
  created_by uuid not null default auth.uid() references public.profiles(id),
  submitted_at timestamptz,
  reviewed_by uuid references public.profiles(id) on delete restrict,
  reviewed_at timestamptz,
  review_note text,
  reversed_transaction_id uuid references public.financial_transactions(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint financial_transaction_separation
    check (reviewed_by is null or reviewed_by <> created_by),
  constraint financial_transaction_review_complete
    check (
      status not in ('approved', 'rejected', 'executed', 'reversed')
      or (
        reviewed_by is not null
        and reviewed_at is not null
      )
    )
);

create table public.provider_payments (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references public.monthly_cycles(id) on delete restrict,
  provider_id uuid not null references public.providers(id) on delete restrict,
  bank_movement_id uuid unique references public.bank_movements(id) on delete restrict,
  bank_receipt_file_id uuid references public.source_files(id) on delete restrict,
  amount bigint not null check (amount > 0),
  status public.approval_status not null default 'draft',
  created_by uuid not null default auth.uid() references public.profiles(id),
  submitted_at timestamptz,
  reviewed_by uuid references public.profiles(id) on delete restrict,
  reviewed_at timestamptz,
  review_note text,
  paid_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint provider_payment_separation
    check (reviewed_by is null or reviewed_by <> created_by),
  constraint provider_payment_execution_complete
    check (
      status <> 'executed'
      or (
        bank_movement_id is not null
        and bank_receipt_file_id is not null
        and paid_on is not null
      )
    )
);

create table public.provider_payment_items (
  id uuid primary key default gen_random_uuid(),
  provider_payment_id uuid not null references public.provider_payments(id) on delete restrict,
  installment_id uuid not null references public.installments(id) on delete restrict,
  amount bigint not null check (amount > 0),
  created_at timestamptz not null default now(),
  unique (provider_payment_id, installment_id)
);

create table public.monthly_closures (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null unique references public.monthly_cycles(id) on delete restrict,
  review_record_file_id uuid references public.source_files(id) on delete restrict,
  opening_bank_balance bigint not null check (opening_bank_balance >= 0),
  closing_bank_balance bigint not null check (closing_bank_balance >= 0),
  total_income bigint not null check (total_income >= 0),
  total_expense bigint not null check (total_expense >= 0),
  reviewer_names text[] not null default '{}'::text[],
  manual_review_notes text,
  closed_by uuid references public.profiles(id) on delete restrict,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint monthly_closure_three_reviewers
    check (
      closed_at is null
      or (
        review_record_file_id is not null
        and cardinality(reviewer_names) = 3
        and closed_by is not null
      )
    )
);

create table public.audit_log (
  id bigint generated always as identity primary key,
  table_name text not null,
  row_id uuid not null,
  operation text not null check (operation in ('INSERT', 'UPDATE', 'DELETE')),
  actor_id uuid,
  changed_columns text[] not null default '{}'::text[],
  previous_values jsonb,
  current_values jsonb,
  occurred_at timestamptz not null default now()
);

create index audit_log_entity_idx
  on public.audit_log (table_name, row_id, occurred_at desc);

create or replace function public.normalize_chilean_rut(input_rut text)
returns text
language sql
immutable
strict
set search_path = ''
as $$
  select
    left(cleaned, length(cleaned) - 1)
    || '-'
    || right(cleaned, 1)
  from (
    select upper(regexp_replace(input_rut, '[^0-9kK]', '', 'g')) as cleaned
  ) normalized;
$$;

create or replace function public.is_valid_chilean_rut(input_rut text)
returns boolean
language plpgsql
immutable
strict
set search_path = ''
as $$
declare
  cleaned text := upper(regexp_replace(input_rut, '[^0-9kK]', '', 'g'));
  body text;
  provided_digit text;
  expected_digit text;
  total integer := 0;
  multiplier integer := 2;
  position integer;
  remainder integer;
begin
  if cleaned !~ '^[0-9]{7,8}[0-9K]$' then
    return false;
  end if;

  body := left(cleaned, length(cleaned) - 1);
  provided_digit := right(cleaned, 1);

  for position in reverse length(body)..1 loop
    total := total + substring(body from position for 1)::integer * multiplier;
    multiplier := multiplier + 1;
    if multiplier = 8 then
      multiplier := 2;
    end if;
  end loop;

  remainder := 11 - (total % 11);
  expected_digit := case
    when remainder = 11 then '0'
    when remainder = 10 then 'K'
    else remainder::text
  end;

  return provided_digit = expected_digit;
end;
$$;

alter table public.union_settings
  add constraint union_settings_valid_rut
  check (
    rut = public.normalize_chilean_rut(rut)
    and public.is_valid_chilean_rut(rut)
  );

alter table public.members
  add constraint members_valid_rut
  check (
    rut = public.normalize_chilean_rut(rut)
    and public.is_valid_chilean_rut(rut)
  );

alter table public.providers
  add constraint providers_valid_rut
  check (
    rut = public.normalize_chilean_rut(rut)
    and public.is_valid_chilean_rut(rut)
  );

create or replace function private.has_active_role(required_role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.office_assignments assignment
    join public.profiles profile on profile.id = assignment.user_id
    where assignment.user_id = auth.uid()
      and assignment.role = required_role
      and profile.is_active
      and assignment.starts_on <= current_date
      and (assignment.ends_on is null or assignment.ends_on >= current_date)
  );
$$;

create or replace function private.is_active_officer()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    private.has_active_role('president'::public.app_role)
    or private.has_active_role('treasurer'::public.app_role);
$$;

grant execute on function private.has_active_role(public.app_role) to authenticated;
grant execute on function private.is_active_officer() to authenticated;

create or replace function private.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function private.reject_source_file_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Los archivos originales son inmutables';
end;
$$;

create or replace function private.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_row jsonb;
  new_row jsonb;
  safe_old jsonb;
  safe_new jsonb;
  entity_id uuid;
  changed text[];
  excluded_keys constant text[] := array[
    'rut',
    'full_name',
    'display_name',
    'bank_account_number',
    'bank_account_holder'
  ];
begin
  old_row := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  new_row := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  safe_old := case when old_row is null then null else old_row - excluded_keys end;
  safe_new := case when new_row is null then null else new_row - excluded_keys end;
  entity_id := coalesce(
    (new_row ->> 'id')::uuid,
    (old_row ->> 'id')::uuid
  );

  select coalesce(array_agg(key order by key), '{}'::text[])
  into changed
  from (
    select key
    from jsonb_object_keys(coalesce(safe_old, '{}'::jsonb) || coalesce(safe_new, '{}'::jsonb)) key
    where safe_old -> key is distinct from safe_new -> key
  ) differences;

  insert into public.audit_log (
    table_name,
    row_id,
    operation,
    actor_id,
    changed_columns,
    previous_values,
    current_values
  )
  values (
    tg_table_name,
    entity_id,
    tg_op,
    auth.uid(),
    changed,
    safe_old,
    safe_new
  );

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

create trigger profiles_touch_updated_at
before update on public.profiles
for each row execute function private.touch_updated_at();

create trigger union_settings_touch_updated_at
before update on public.union_settings
for each row execute function private.touch_updated_at();

create trigger members_touch_updated_at
before update on public.members
for each row execute function private.touch_updated_at();

create trigger providers_touch_updated_at
before update on public.providers
for each row execute function private.touch_updated_at();

create trigger monthly_cycles_touch_updated_at
before update on public.monthly_cycles
for each row execute function private.touch_updated_at();

create trigger agreement_operations_touch_updated_at
before update on public.agreement_operations
for each row execute function private.touch_updated_at();

create trigger installments_touch_updated_at
before update on public.installments
for each row execute function private.touch_updated_at();

create trigger payroll_requests_touch_updated_at
before update on public.payroll_requests
for each row execute function private.touch_updated_at();

create trigger reconciliations_touch_updated_at
before update on public.reconciliations
for each row execute function private.touch_updated_at();

create trigger financial_transactions_touch_updated_at
before update on public.financial_transactions
for each row execute function private.touch_updated_at();

create trigger provider_payments_touch_updated_at
before update on public.provider_payments
for each row execute function private.touch_updated_at();

create trigger source_files_immutable
before update or delete on public.source_files
for each row execute function private.reject_source_file_mutation();

do $$
declare
  audited_table text;
begin
  foreach audited_table in array array[
    'union_settings',
    'members',
    'providers',
    'monthly_cycles',
    'agreement_operations',
    'installments',
    'payroll_requests',
    'company_results',
    'reconciliations',
    'bank_movements',
    'financial_transactions',
    'provider_payments',
    'monthly_closures'
  ]
  loop
    execute format(
      'create trigger %I after insert or update or delete on public.%I for each row execute function private.audit_row_change()',
      audited_table || '_audit',
      audited_table
    );
  end loop;
end;
$$;

create or replace function public.approve_financial_transaction(
  transaction_id uuid,
  approve boolean,
  reviewer_note text default null
)
returns public.financial_transactions
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.financial_transactions;
begin
  if not private.has_active_role('president'::public.app_role) then
    raise exception 'Solo la presidencia activa puede aprobar movimientos';
  end if;

  select *
  into target
  from public.financial_transactions
  where id = transaction_id
  for update;

  if target.id is null then
    raise exception 'Movimiento no encontrado';
  end if;

  if target.status <> 'pending_approval'::public.approval_status then
    raise exception 'El movimiento no está pendiente de aprobación';
  end if;

  if target.created_by = auth.uid() then
    raise exception 'La misma persona no puede crear y aprobar el movimiento';
  end if;

  update public.financial_transactions
  set
    status = case
      when approve then 'approved'::public.approval_status
      else 'rejected'::public.approval_status
    end,
    reviewed_by = auth.uid(),
    reviewed_at = now(),
    review_note = reviewer_note
  where id = transaction_id
  returning * into target;

  return target;
end;
$$;

create or replace function public.approve_provider_payment(
  payment_id uuid,
  approve boolean,
  reviewer_note text default null
)
returns public.provider_payments
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.provider_payments;
begin
  if not private.has_active_role('president'::public.app_role) then
    raise exception 'Solo la presidencia activa puede aprobar pagos';
  end if;

  select *
  into target
  from public.provider_payments
  where id = payment_id
  for update;

  if target.id is null then
    raise exception 'Pago no encontrado';
  end if;

  if target.status <> 'pending_approval'::public.approval_status then
    raise exception 'El pago no está pendiente de aprobación';
  end if;

  if target.created_by = auth.uid() then
    raise exception 'La misma persona no puede crear y aprobar el pago';
  end if;

  update public.provider_payments
  set
    status = case
      when approve then 'approved'::public.approval_status
      else 'rejected'::public.approval_status
    end,
    reviewed_by = auth.uid(),
    reviewed_at = now(),
    review_note = reviewer_note
  where id = payment_id
  returning * into target;

  return target;
end;
$$;

revoke all on function public.approve_financial_transaction(uuid, boolean, text) from public;
revoke all on function public.approve_provider_payment(uuid, boolean, text) from public;
grant execute on function public.approve_financial_transaction(uuid, boolean, text) to authenticated;
grant execute on function public.approve_provider_payment(uuid, boolean, text) to authenticated;

alter table public.profiles enable row level security;
alter table public.office_assignments enable row level security;
alter table public.union_settings enable row level security;
alter table public.members enable row level security;
alter table public.providers enable row level security;
alter table public.monthly_cycles enable row level security;
alter table public.source_files enable row level security;
alter table public.import_batches enable row level security;
alter table public.agreement_operations enable row level security;
alter table public.installments enable row level security;
alter table public.payroll_requests enable row level security;
alter table public.payroll_request_items enable row level security;
alter table public.company_results enable row level security;
alter table public.reconciliations enable row level security;
alter table public.reconciliation_allocations enable row level security;
alter table public.alerts enable row level security;
alter table public.bank_movements enable row level security;
alter table public.financial_categories enable row level security;
alter table public.financial_transactions enable row level security;
alter table public.provider_payments enable row level security;
alter table public.provider_payment_items enable row level security;
alter table public.monthly_closures enable row level security;
alter table public.audit_log enable row level security;

create policy profiles_self_or_officer_select
on public.profiles for select to authenticated
using (id = auth.uid() or private.is_active_officer());

create policy office_assignments_officer_select
on public.office_assignments for select to authenticated
using (private.is_active_officer());

create policy accounting_read_union_settings
on public.union_settings for select to authenticated
using (private.is_active_officer());

create policy accounting_insert_union_settings
on public.union_settings for insert to authenticated
with check (private.is_active_officer());

create policy accounting_update_union_settings
on public.union_settings for update to authenticated
using (private.is_active_officer())
with check (private.is_active_officer());

create policy accounting_read_members
on public.members for select to authenticated
using (private.is_active_officer());

create policy accounting_insert_members
on public.members for insert to authenticated
with check (private.is_active_officer());

create policy accounting_update_members
on public.members for update to authenticated
using (private.is_active_officer())
with check (private.is_active_officer());

create policy accounting_read_providers
on public.providers for select to authenticated
using (private.is_active_officer());

create policy accounting_insert_providers
on public.providers for insert to authenticated
with check (private.is_active_officer());

create policy accounting_update_providers
on public.providers for update to authenticated
using (private.is_active_officer())
with check (private.is_active_officer());

create policy accounting_read_cycles
on public.monthly_cycles for select to authenticated
using (private.is_active_officer());

create policy treasurer_insert_cycles
on public.monthly_cycles for insert to authenticated
with check (private.has_active_role('treasurer'::public.app_role));

create policy treasurer_update_cycles
on public.monthly_cycles for update to authenticated
using (private.has_active_role('treasurer'::public.app_role))
with check (private.has_active_role('treasurer'::public.app_role));

create policy accounting_read_source_files
on public.source_files for select to authenticated
using (private.is_active_officer());

create policy treasurer_insert_source_files
on public.source_files for insert to authenticated
with check (
  private.has_active_role('treasurer'::public.app_role)
  and uploaded_by = auth.uid()
);

create policy accounting_read_import_batches
on public.import_batches for select to authenticated
using (private.is_active_officer());

create policy treasurer_insert_import_batches
on public.import_batches for insert to authenticated
with check (private.has_active_role('treasurer'::public.app_role));

create policy treasurer_update_import_batches
on public.import_batches for update to authenticated
using (private.has_active_role('treasurer'::public.app_role))
with check (private.has_active_role('treasurer'::public.app_role));

do $$
declare
  officer_table text;
begin
  foreach officer_table in array array[
    'agreement_operations',
    'installments',
    'payroll_requests',
    'payroll_request_items',
    'company_results',
    'reconciliations',
    'reconciliation_allocations',
    'alerts',
    'bank_movements',
    'financial_categories',
    'provider_payment_items',
    'monthly_closures'
  ]
  loop
    execute format(
      'create policy %I on public.%I for select to authenticated using (private.is_active_officer())',
      officer_table || '_officer_select',
      officer_table
    );
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (private.has_active_role(''treasurer''::public.app_role))',
      officer_table || '_treasurer_insert',
      officer_table
    );
    execute format(
      'create policy %I on public.%I for update to authenticated using (private.has_active_role(''treasurer''::public.app_role)) with check (private.has_active_role(''treasurer''::public.app_role))',
      officer_table || '_treasurer_update',
      officer_table
    );
  end loop;
end;
$$;

create policy financial_transactions_officer_select
on public.financial_transactions for select to authenticated
using (private.is_active_officer());

create policy financial_transactions_treasurer_insert
on public.financial_transactions for insert to authenticated
with check (
  private.has_active_role('treasurer'::public.app_role)
  and created_by = auth.uid()
  and reviewed_by is null
  and status in ('draft', 'pending_approval')
);

create policy financial_transactions_treasurer_update
on public.financial_transactions for update to authenticated
using (
  private.has_active_role('treasurer'::public.app_role)
  and created_by = auth.uid()
  and status in ('draft', 'pending_approval')
)
with check (
  created_by = auth.uid()
  and reviewed_by is null
  and status in ('draft', 'pending_approval')
);

create policy provider_payments_officer_select
on public.provider_payments for select to authenticated
using (private.is_active_officer());

create policy provider_payments_treasurer_insert
on public.provider_payments for insert to authenticated
with check (
  private.has_active_role('treasurer'::public.app_role)
  and created_by = auth.uid()
  and reviewed_by is null
  and status in ('draft', 'pending_approval')
);

create policy provider_payments_treasurer_update
on public.provider_payments for update to authenticated
using (
  private.has_active_role('treasurer'::public.app_role)
  and created_by = auth.uid()
  and status in ('draft', 'pending_approval')
)
with check (
  created_by = auth.uid()
  and reviewed_by is null
  and status in ('draft', 'pending_approval')
);

create policy audit_log_officer_select
on public.audit_log for select to authenticated
using (private.is_active_officer());

revoke insert, update, delete on public.audit_log from authenticated;
revoke update, delete on public.source_files from authenticated;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'accounting-private',
  'accounting-private',
  false,
  52428800,
  array[
    'application/pdf',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/csv',
    'image/jpeg',
    'image/png',
    'image/heic',
    'image/heif'
  ]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy accounting_storage_officer_select
on storage.objects for select to authenticated
using (
  bucket_id = 'accounting-private'
  and private.is_active_officer()
);

create policy accounting_storage_treasurer_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'accounting-private'
  and private.has_active_role('treasurer'::public.app_role)
);

commit;
