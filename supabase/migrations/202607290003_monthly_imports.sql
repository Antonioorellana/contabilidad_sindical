begin;

-- The API roles require explicit privileges because automatic grants are
-- disabled in this project. RLS remains the final authorization boundary.
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
grant select, insert, update on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
revoke insert, update, delete on public.audit_log from authenticated;
revoke update, delete on public.source_files from authenticated;

create table public.staged_import_rows (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.import_batches(id) on delete restrict,
  sheet_name text not null check (char_length(trim(sheet_name)) between 1 and 120),
  source_row_number integer not null check (source_row_number > 0),
  source_name text check (
    source_name is null
    or char_length(trim(source_name)) between 2 and 180
  ),
  normalized_rut text,
  member_id uuid references public.members(id) on delete restrict,
  amount bigint check (amount is null or amount >= 0),
  total_amount bigint check (total_amount is null or total_amount >= 0),
  installment_number smallint check (
    installment_number is null
    or installment_number > 0
  ),
  installment_count smallint check (
    installment_count is null
    or installment_count > 0
  ),
  discount_period date check (
    discount_period is null
    or extract(day from discount_period) = 1
  ),
  record_type text not null check (
    record_type in ('social_fee', 'agreement', 'unknown')
  ),
  category text check (
    category is null
    or char_length(trim(category)) between 1 and 120
  ),
  source_reference text check (
    source_reference is null
    or char_length(trim(source_reference)) <= 120
  ),
  validation_status text not null check (
    validation_status in ('ready', 'manual_review')
  ),
  issue_codes text[] not null default '{}'::text[],
  retention_until date not null default (current_date + 90),
  created_at timestamptz not null default now(),
  unique (batch_id, sheet_name, source_row_number)
);

comment on table public.staged_import_rows is
  'Temporary, reviewable rows extracted from immutable source files. Personal names are retained for at most 90 days solely to resolve import discrepancies.';

create index staged_import_rows_batch_status_idx
  on public.staged_import_rows (batch_id, validation_status);

create index staged_import_rows_member_idx
  on public.staged_import_rows (member_id)
  where member_id is not null;

alter table public.staged_import_rows enable row level security;

create policy staged_import_rows_officer_select
on public.staged_import_rows for select to authenticated
using (private.is_active_officer());

create policy staged_import_rows_treasurer_insert
on public.staged_import_rows for insert to authenticated
with check (private.has_active_role('treasurer'::public.app_role));

create policy staged_import_rows_treasurer_update
on public.staged_import_rows for update to authenticated
using (private.has_active_role('treasurer'::public.app_role))
with check (private.has_active_role('treasurer'::public.app_role));

grant select, insert, update on public.staged_import_rows to authenticated;

create or replace function private.safe_jsonb_bigint(input_value jsonb)
returns bigint
language plpgsql
immutable
set search_path = ''
as $$
declare
  plain_value text;
begin
  if input_value is null or input_value = 'null'::jsonb then
    return null;
  end if;

  if jsonb_typeof(input_value) not in ('number', 'string') then
    return null;
  end if;

  plain_value := trim(both '"' from input_value::text);
  plain_value := regexp_replace(plain_value, '[^0-9-]', '', 'g');

  if plain_value !~ '^-?[0-9]+$' then
    return null;
  end if;

  begin
    return plain_value::bigint;
  exception
    when numeric_value_out_of_range then
      return null;
  end;
end;
$$;

create or replace function private.safe_jsonb_smallint(input_value jsonb)
returns smallint
language plpgsql
immutable
set search_path = ''
as $$
declare
  parsed bigint;
begin
  parsed := private.safe_jsonb_bigint(input_value);

  if parsed is null or parsed < 1 or parsed > 32767 then
    return null;
  end if;

  return parsed::smallint;
end;
$$;

create or replace function private.safe_jsonb_integer(input_value jsonb)
returns integer
language plpgsql
immutable
set search_path = ''
as $$
declare
  parsed bigint;
begin
  parsed := private.safe_jsonb_bigint(input_value);

  if parsed is null or parsed < 1 or parsed > 2147483647 then
    return null;
  end if;

  return parsed::integer;
end;
$$;

create or replace function private.safe_jsonb_period(input_value jsonb)
returns date
language plpgsql
immutable
set search_path = ''
as $$
declare
  plain_value text;
  parsed date;
begin
  if input_value is null
    or input_value = 'null'::jsonb
    or jsonb_typeof(input_value) <> 'string'
  then
    return null;
  end if;

  plain_value := trim(both '"' from input_value::text);

  begin
    parsed := plain_value::date;
  exception
    when others then
      return null;
  end;

  return date_trunc('month', parsed)::date;
end;
$$;

create or replace function public.register_monthly_source_file(
  p_cycle_id uuid,
  p_provider_id uuid,
  p_kind public.source_file_kind,
  p_original_name text,
  p_storage_path text,
  p_media_type text,
  p_size_bytes bigint,
  p_sha256 text
)
returns table (
  source_file_id uuid,
  import_batch_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  created_source_file_id uuid;
  created_batch_id uuid;
begin
  if not private.has_active_role('treasurer'::public.app_role) then
    raise exception 'Solo tesorería puede registrar archivos mensuales';
  end if;

  if auth.uid() is null then
    raise exception 'Se requiere una sesión autenticada';
  end if;

  if not exists (
    select 1
    from public.monthly_cycles cycle
    where cycle.id = p_cycle_id
      and cycle.status <> 'closed'::public.cycle_status
  ) then
    raise exception 'El ciclo no existe o ya está cerrado';
  end if;

  if p_kind = 'provider_plan'::public.source_file_kind
    and (
      p_provider_id is null
      or not exists (
        select 1
        from public.providers provider
        where provider.id = p_provider_id
          and provider.is_active
      )
    )
  then
    raise exception 'La planilla de convenio requiere un proveedor activo';
  end if;

  if p_kind <> 'provider_plan'::public.source_file_kind
    and p_provider_id is not null
  then
    raise exception 'El proveedor sólo corresponde a una planilla de convenio';
  end if;

  if char_length(trim(p_original_name)) < 1
    or char_length(trim(p_original_name)) > 240
    or char_length(trim(p_storage_path)) < 10
    or char_length(trim(p_storage_path)) > 500
    or char_length(trim(p_media_type)) < 3
    or char_length(trim(p_media_type)) > 120
    or p_size_bytes < 1
    or p_size_bytes > 25 * 1024 * 1024
    or p_sha256 !~ '^[a-f0-9]{64}$'
  then
    raise exception 'Los metadatos del archivo no son válidos';
  end if;

  insert into public.source_files (
    cycle_id,
    provider_id,
    kind,
    original_name,
    storage_path,
    media_type,
    size_bytes,
    sha256,
    uploaded_by
  )
  values (
    p_cycle_id,
    p_provider_id,
    p_kind,
    trim(p_original_name),
    trim(p_storage_path),
    trim(p_media_type),
    p_size_bytes,
    p_sha256,
    auth.uid()
  )
  returning id into created_source_file_id;

  insert into public.import_batches (
    source_file_id,
    status
  )
  values (
    created_source_file_id,
    'uploaded'::public.import_status
  )
  returning id into created_batch_id;

  return query
  select created_source_file_id, created_batch_id;
end;
$$;

create or replace function public.ingest_staged_import_rows(
  p_import_batch_id uuid,
  p_rows jsonb
)
returns public.import_batches
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_batch public.import_batches;
  source_file public.source_files;
  source_cycle public.monthly_cycles;
  row_data jsonb;
  detected_count integer;
  ready_count integer := 0;
  review_count integer := 0;
  raw_rut text;
  normalized_rut text;
  source_name text;
  row_amount bigint;
  row_total_amount bigint;
  row_installment_number smallint;
  row_installment_count smallint;
  row_discount_period date;
  row_record_type text;
  row_category text;
  row_reference text;
  row_sheet_name text;
  row_number integer;
  matched_member_id uuid;
  row_issues text[];
  requested_issues jsonb;
  row_status text;
  aggregated_error_summary jsonb;
begin
  if not private.has_active_role('treasurer'::public.app_role) then
    raise exception 'Solo tesorería puede procesar archivos mensuales';
  end if;

  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'Las filas deben enviarse como un arreglo JSON';
  end if;

  detected_count := jsonb_array_length(p_rows);

  if detected_count < 1 or detected_count > 5000 then
    raise exception 'La carga debe contener entre 1 y 5000 filas';
  end if;

  select *
  into target_batch
  from public.import_batches
  where id = p_import_batch_id
  for update;

  if target_batch.id is null then
    raise exception 'La carga no existe';
  end if;

  if target_batch.status not in (
    'uploaded'::public.import_status,
    'failed'::public.import_status
  ) then
    raise exception 'La carga ya fue procesada o está en proceso';
  end if;

  select *
  into source_file
  from public.source_files
  where id = target_batch.source_file_id;

  select *
  into source_cycle
  from public.monthly_cycles
  where id = source_file.cycle_id;

  if source_cycle.id is null
    or source_cycle.status = 'closed'::public.cycle_status
  then
    raise exception 'El ciclo asociado no admite nuevas cargas';
  end if;

  update public.import_batches
  set
    status = 'processing'::public.import_status,
    processed_by = auth.uid(),
    processed_at = null,
    error_summary = '[]'::jsonb
  where id = p_import_batch_id;

  delete from public.staged_import_rows
  where batch_id = p_import_batch_id;

  for row_data in
    select value
    from jsonb_array_elements(p_rows)
  loop
    row_issues := '{}'::text[];
    raw_rut := nullif(trim(row_data ->> 'rut'), '');
    normalized_rut := case
      when raw_rut is null then null
      else public.normalize_chilean_rut(raw_rut)
    end;
    source_name := nullif(left(trim(row_data ->> 'name'), 180), '');
    row_amount := private.safe_jsonb_bigint(row_data -> 'amount');
    row_total_amount := private.safe_jsonb_bigint(row_data -> 'totalAmount');
    row_installment_number := private.safe_jsonb_smallint(
      row_data -> 'installmentNumber'
    );
    row_installment_count := private.safe_jsonb_smallint(
      row_data -> 'installmentCount'
    );
    row_discount_period := private.safe_jsonb_period(
      row_data -> 'discountPeriod'
    );
    row_record_type := case
      when row_data ->> 'recordType' in ('social_fee', 'agreement', 'unknown')
        then row_data ->> 'recordType'
      else 'unknown'
    end;
    row_category := nullif(left(trim(row_data ->> 'category'), 120), '');
    row_reference := nullif(left(trim(row_data ->> 'reference'), 120), '');
    row_sheet_name := coalesce(
      nullif(left(trim(row_data ->> 'sheetName'), 120), ''),
      'Hoja sin nombre'
    );
    row_number := private.safe_jsonb_integer(
      row_data -> 'rowNumber'
    );

    if row_number is null or row_number < 1 then
      raise exception 'Cada fila debe indicar un número de origen válido';
    end if;

    requested_issues := row_data -> 'issues';
    if requested_issues is not null
      and jsonb_typeof(requested_issues) = 'array'
    then
      select coalesce(
        array_agg(left(regexp_replace(value, '[^a-z0-9_]', '', 'g'), 64)),
        '{}'::text[]
      )
      into row_issues
      from jsonb_array_elements_text(requested_issues);
    end if;

    if normalized_rut is null
      or not public.is_valid_chilean_rut(normalized_rut)
    then
      row_issues := array_append(row_issues, 'invalid_rut');
      matched_member_id := null;
    else
      select member.id
      into matched_member_id
      from public.members member
      where member.rut = normalized_rut;

      if matched_member_id is null then
        row_issues := array_append(row_issues, 'member_not_found');
      end if;
    end if;

    if row_amount is null or row_amount < 0 then
      row_issues := array_append(row_issues, 'missing_or_invalid_amount');
    end if;

    if row_record_type = 'unknown' then
      row_issues := array_append(row_issues, 'unknown_record_type');
    end if;

    if source_file.kind = 'provider_plan'::public.source_file_kind
      and (
        row_total_amount is null
        or row_total_amount <= 0
        or row_installment_count is null
        or row_installment_number is null
        or row_discount_period is null
      )
    then
      row_issues := array_append(row_issues, 'incomplete_provider_operation');
    end if;

    select coalesce(array_agg(distinct issue order by issue), '{}'::text[])
    into row_issues
    from unnest(row_issues) issue
    where issue <> '';

    row_status := case
      when cardinality(row_issues) = 0 then 'ready'
      else 'manual_review'
    end;

    insert into public.staged_import_rows (
      batch_id,
      sheet_name,
      source_row_number,
      source_name,
      normalized_rut,
      member_id,
      amount,
      total_amount,
      installment_number,
      installment_count,
      discount_period,
      record_type,
      category,
      source_reference,
      validation_status,
      issue_codes
    )
    values (
      p_import_batch_id,
      row_sheet_name,
      row_number,
      source_name,
      normalized_rut,
      matched_member_id,
      row_amount,
      row_total_amount,
      row_installment_number,
      row_installment_count,
      row_discount_period,
      row_record_type,
      row_category,
      row_reference,
      row_status,
      row_issues
    );

    if row_status = 'ready' then
      ready_count := ready_count + 1;
    else
      review_count := review_count + 1;
    end if;
  end loop;

  select jsonb_agg(
    jsonb_build_object(
      'code',
      issue_code,
      'count',
      issue_count
    )
    order by issue_code
  )
  into aggregated_error_summary
  from (
    select issue_code, count(*)::integer as issue_count
    from public.staged_import_rows staged,
      unnest(staged.issue_codes) issue_code
    where staged.batch_id = p_import_batch_id
    group by issue_code
  ) grouped_issues;

  aggregated_error_summary := coalesce(
    aggregated_error_summary,
    '[]'::jsonb
  );

  update public.import_batches
  set
    status = 'processed'::public.import_status,
    detected_rows = detected_count,
    accepted_rows = ready_count,
    rejected_rows = review_count,
    detected_total = (
      select coalesce(sum(staged.amount), 0)
      from public.staged_import_rows staged
      where staged.batch_id = p_import_batch_id
        and staged.amount is not null
    ),
    error_summary = aggregated_error_summary,
    processed_by = auth.uid(),
    processed_at = now()
  where id = p_import_batch_id
  returning * into target_batch;

  if review_count > 0 then
    insert into public.alerts (
      cycle_id,
      severity,
      code,
      title,
      entity_type,
      entity_id,
      details
    )
    values (
      source_cycle.id,
      'warning'::public.alert_severity,
      'IMPORT_REQUIRES_REVIEW',
      'Carga mensual con filas por revisar',
      'import_batch',
      p_import_batch_id,
      jsonb_build_object(
        'detected_rows',
        detected_count,
        'ready_rows',
        ready_count,
        'review_rows',
        review_count,
        'issues',
        aggregated_error_summary
      )
    );

    update public.monthly_cycles
    set status = 'manual_review'::public.cycle_status
    where id = source_cycle.id
      and status <> 'closed'::public.cycle_status;
  end if;

  return target_batch;
end;
$$;

revoke all on function public.register_monthly_source_file(
  uuid,
  uuid,
  public.source_file_kind,
  text,
  text,
  text,
  bigint,
  text
) from public;
revoke all on function public.ingest_staged_import_rows(uuid, jsonb) from public;
grant execute on function public.register_monthly_source_file(
  uuid,
  uuid,
  public.source_file_kind,
  text,
  text,
  text,
  bigint,
  text
) to authenticated;
grant execute on function public.ingest_staged_import_rows(uuid, jsonb)
  to authenticated;

-- Storage cleanup is limited to unregistered objects uploaded by the current
-- treasurer. Once a source_files row exists, the original remains immutable.
create policy accounting_storage_treasurer_cleanup
on storage.objects for delete to authenticated
using (
  bucket_id = 'accounting-private'
  and private.has_active_role('treasurer'::public.app_role)
  and owner_id = auth.uid()::text
  and not exists (
    select 1
    from public.source_files source_file
    where source_file.storage_path = name
  )
);

commit;
