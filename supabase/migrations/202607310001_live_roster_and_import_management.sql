begin;

alter table public.import_batches
  add column if not exists superseded_by uuid
    references public.profiles(id) on delete restrict,
  add column if not exists superseded_at timestamptz,
  add column if not exists superseded_reason text;

-- Preserve compatibility if an earlier manual review already used the enum
-- value without the audit metadata introduced in this migration.
update public.import_batches batch
set
  superseded_by = coalesce(batch.superseded_by, batch.processed_by, source.uploaded_by),
  superseded_at = coalesce(batch.superseded_at, batch.processed_at, source.uploaded_at),
  superseded_reason = coalesce(
    nullif(trim(batch.superseded_reason), ''),
    'Carga descartada antes de habilitar el registro obligatorio de motivo.'
  )
from public.source_files source
where source.id = batch.source_file_id
  and batch.status = 'superseded'::public.import_status;

alter table public.import_batches
  drop constraint if exists import_batch_supersession_complete;

alter table public.import_batches
  add constraint import_batch_supersession_complete
  check (
    (
      status = 'superseded'::public.import_status
      and superseded_by is not null
      and superseded_at is not null
      and char_length(trim(superseded_reason)) between 5 and 500
    )
    or (
      status <> 'superseded'::public.import_status
      and superseded_by is null
      and superseded_at is null
      and superseded_reason is null
    )
  );

create table if not exists public.member_roster_syncs (
  id uuid primary key default gen_random_uuid(),
  import_batch_id uuid not null unique
    references public.import_batches(id) on delete restrict,
  discount_period date not null,
  roster_rows integer not null check (roster_rows > 0),
  new_members integer not null check (new_members >= 0),
  reactivated_members integer not null check (reactivated_members >= 0),
  renamed_members integer not null check (renamed_members >= 0),
  inactivated_members integer not null check (inactivated_members >= 0),
  synced_by uuid not null default auth.uid()
    references public.profiles(id) on delete restrict,
  synced_at timestamptz not null default now()
);

comment on table public.member_roster_syncs is
  'Auditable application of an employer social-fee result as the authoritative active union roster for one discount period.';

alter table public.member_roster_syncs enable row level security;

drop policy if exists member_roster_syncs_officer_select
  on public.member_roster_syncs;

create policy member_roster_syncs_officer_select
on public.member_roster_syncs for select to authenticated
using (private.is_active_officer());

grant select on public.member_roster_syncs to authenticated;
revoke insert, update, delete on public.member_roster_syncs from authenticated;

drop trigger if exists import_batches_audit on public.import_batches;
create trigger import_batches_audit
after insert or update or delete on public.import_batches
for each row execute function private.audit_row_change();

drop trigger if exists member_roster_syncs_audit on public.member_roster_syncs;
create trigger member_roster_syncs_audit
after insert or update or delete on public.member_roster_syncs
for each row execute function private.audit_row_change();

create or replace function public.preview_member_roster_sync(
  p_import_batch_id uuid
)
returns table (
  import_batch_id uuid,
  source_file_name text,
  discount_period date,
  roster_rows integer,
  new_members integer,
  reactivated_members integer,
  renamed_members integer,
  inactivated_members integer,
  already_applied boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_batch public.import_batches;
  target_source public.source_files;
  target_cycle public.monthly_cycles;
begin
  if not private.is_active_officer() then
    raise exception 'Se requiere una directiva activa';
  end if;

  select * into target_batch
  from public.import_batches
  where id = p_import_batch_id;

  if target_batch.id is null then
    raise exception 'La carga no existe';
  end if;

  select * into target_source
  from public.source_files
  where id = target_batch.source_file_id;

  select * into target_cycle
  from public.monthly_cycles
  where id = target_source.cycle_id;

  if target_source.kind <> 'company_result'::public.source_file_kind then
    raise exception 'El padrón sólo puede provenir del resultado mensual de Jumbo';
  end if;

  if target_batch.status <> 'processed'::public.import_status then
    raise exception 'La carga debe estar procesada y activa';
  end if;

  return query
  with authoritative_roster as (
    select distinct on (staged.normalized_rut)
      staged.normalized_rut as rut,
      trim(staged.source_name) as full_name
    from public.staged_import_rows staged
    where staged.batch_id = p_import_batch_id
      and staged.record_type = 'social_fee'
      and staged.amount = 8000
      and staged.normalized_rut is not null
      and staged.source_name is not null
      and char_length(trim(staged.source_name)) >= 3
      and not ('invalid_rut' = any(staged.issue_codes))
    order by staged.normalized_rut, staged.source_row_number
  )
  select
    target_batch.id,
    target_source.original_name,
    target_cycle.discount_period,
    count(*)::integer,
    count(*) filter (where member.id is null)::integer,
    count(*) filter (
      where member.id is not null
        and member.status <> 'active'::public.member_status
    )::integer,
    count(*) filter (
      where member.id is not null
        and lower(trim(member.full_name)) <> lower(roster.full_name)
    )::integer,
    (
      select count(*)::integer
      from public.members active_member
      where active_member.status = 'active'::public.member_status
        and not exists (
          select 1
          from authoritative_roster expected
          where expected.rut = active_member.rut
        )
    ),
    exists (
      select 1
      from public.member_roster_syncs applied
      where applied.import_batch_id = target_batch.id
    )
  from authoritative_roster roster
  left join public.members member on member.rut = roster.rut;
end;
$$;

create or replace function public.apply_member_roster_sync(
  p_import_batch_id uuid,
  p_expected_inactivated_members integer
)
returns public.member_roster_syncs
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_batch public.import_batches;
  target_source public.source_files;
  target_cycle public.monthly_cycles;
  active_member_count integer;
  roster_count integer;
  new_count integer;
  reactivated_count integer;
  renamed_count integer;
  inactivated_count integer;
  affected_batch_ids uuid[];
  sync_record public.member_roster_syncs;
begin
  if not private.has_active_role('treasurer'::public.app_role) then
    raise exception 'Sólo tesorería puede actualizar el padrón';
  end if;

  if p_expected_inactivated_members is null
    or p_expected_inactivated_members < 0
  then
    raise exception 'La confirmación de socios a inactivar no es válida';
  end if;

  select * into target_batch
  from public.import_batches
  where id = p_import_batch_id
  for update;

  if target_batch.id is null then
    raise exception 'La carga no existe';
  end if;

  select * into target_source
  from public.source_files
  where id = target_batch.source_file_id;

  select * into target_cycle
  from public.monthly_cycles
  where id = target_source.cycle_id
  for update;

  if target_source.kind <> 'company_result'::public.source_file_kind
    or target_batch.status <> 'processed'::public.import_status
  then
    raise exception 'La carga no es un resultado de Jumbo procesado y activo';
  end if;

  if target_cycle.id is null
    or target_cycle.status = 'closed'::public.cycle_status
  then
    raise exception 'El ciclo no existe o ya está cerrado';
  end if;

  if exists (
    select 1 from public.member_roster_syncs applied
    where applied.import_batch_id = p_import_batch_id
  ) then
    raise exception 'Este resultado ya fue aplicado al padrón';
  end if;

  create temporary table roster_to_apply (
    rut text primary key,
    full_name text not null
  ) on commit drop;

  insert into roster_to_apply (rut, full_name)
  select distinct on (staged.normalized_rut)
    staged.normalized_rut,
    trim(staged.source_name)
  from public.staged_import_rows staged
  where staged.batch_id = p_import_batch_id
    and staged.record_type = 'social_fee'
    and staged.amount = 8000
    and staged.normalized_rut is not null
    and staged.source_name is not null
    and char_length(trim(staged.source_name)) >= 3
    and not ('invalid_rut' = any(staged.issue_codes))
  order by staged.normalized_rut, staged.source_row_number;

  select count(*)::integer into roster_count from roster_to_apply;
  select count(*)::integer into active_member_count
  from public.members
  where status = 'active'::public.member_status;

  if roster_count < 1 then
    raise exception 'No se encontraron cuotas sociales válidas de $8.000';
  end if;

  if active_member_count > 0
    and roster_count < floor(active_member_count * 0.80)
  then
    raise exception 'La nómina contiene menos del 80%% del padrón activo; debe revisarse manualmente';
  end if;

  select
    count(*) filter (where member.id is null)::integer,
    count(*) filter (
      where member.id is not null
        and member.status <> 'active'::public.member_status
    )::integer,
    count(*) filter (
      where member.id is not null
        and lower(trim(member.full_name)) <> lower(roster.full_name)
    )::integer
  into new_count, reactivated_count, renamed_count
  from roster_to_apply roster
  left join public.members member on member.rut = roster.rut;

  select count(*)::integer into inactivated_count
  from public.members active_member
  where active_member.status = 'active'::public.member_status
    and not exists (
      select 1 from roster_to_apply expected
      where expected.rut = active_member.rut
    );

  if inactivated_count <> p_expected_inactivated_members then
    raise exception 'El padrón cambió desde la vista previa; vuelve a revisarlo antes de aplicar';
  end if;

  update public.members member
  set
    status = 'inactive'::public.member_status,
    inactive_on = target_cycle.discount_period
  where member.status = 'active'::public.member_status
    and not exists (
      select 1 from roster_to_apply expected
      where expected.rut = member.rut
    );

  insert into public.members (
    rut,
    full_name,
    status,
    authorized_on,
    inactive_on
  )
  select
    roster.rut,
    roster.full_name,
    'active'::public.member_status,
    null,
    null
  from roster_to_apply roster
  on conflict (rut) do update
  set
    full_name = excluded.full_name,
    status = 'active'::public.member_status,
    inactive_on = null,
    updated_at = now();

  with linked_rows as (
    update public.staged_import_rows staged
    set
      member_id = member.id,
      issue_codes = array_remove(staged.issue_codes, 'member_not_found'),
      validation_status = case
        when cardinality(array_remove(staged.issue_codes, 'member_not_found')) = 0
        then 'ready'
        else 'manual_review'
      end
    from public.members member
    where staged.normalized_rut = member.rut
      and (
        staged.member_id is distinct from member.id
        or 'member_not_found' = any(staged.issue_codes)
      )
    returning staged.batch_id
  )
  select coalesce(array_agg(distinct batch_id), '{}'::uuid[])
  into affected_batch_ids
  from linked_rows;

  update public.import_batches batch
  set
    detected_rows = (
      select count(*)::integer
      from public.staged_import_rows staged
      where staged.batch_id = batch.id
    ),
    accepted_rows = (
      select count(*)::integer
      from public.staged_import_rows staged
      where staged.batch_id = batch.id
        and staged.validation_status = 'ready'
    ),
    rejected_rows = (
      select count(*)::integer
      from public.staged_import_rows staged
      where staged.batch_id = batch.id
        and staged.validation_status = 'manual_review'
    ),
    detected_total = (
      select coalesce(sum(staged.amount), 0)::bigint
      from public.staged_import_rows staged
      where staged.batch_id = batch.id
    ),
    error_summary = coalesce((
      select jsonb_agg(
        jsonb_build_object('code', grouped.issue_code, 'count', grouped.issue_count)
        order by grouped.issue_code
      )
      from (
        select issue_code, count(*)::integer as issue_count
        from public.staged_import_rows staged,
          unnest(staged.issue_codes) issue_code
        where staged.batch_id = batch.id
        group by issue_code
      ) grouped
    ), '[]'::jsonb)
  where batch.id = any(affected_batch_ids);

  update public.alerts alert
  set
    status = case
      when batch.rejected_rows = 0 then 'resolved'::public.alert_status
      else alert.status
    end,
    details = jsonb_build_object(
      'detected_rows', batch.detected_rows,
      'ready_rows', batch.accepted_rows,
      'review_rows', batch.rejected_rows,
      'issues', batch.error_summary
    ),
    resolved_by = case
      when batch.rejected_rows = 0 then auth.uid()
      else alert.resolved_by
    end,
    resolved_at = case
      when batch.rejected_rows = 0 then now()
      else alert.resolved_at
    end,
    resolution_note = case
      when batch.rejected_rows = 0
      then 'Filas asociadas al padrón mensual confirmado por tesorería.'
      else alert.resolution_note
    end
  from public.import_batches batch
  where alert.code = 'IMPORT_REQUIRES_REVIEW'
    and alert.entity_type = 'import_batch'
    and alert.entity_id = batch.id
    and batch.id = any(affected_batch_ids)
    and alert.status = 'open'::public.alert_status;

  insert into public.member_roster_syncs (
    import_batch_id,
    discount_period,
    roster_rows,
    new_members,
    reactivated_members,
    renamed_members,
    inactivated_members,
    synced_by
  )
  values (
    p_import_batch_id,
    target_cycle.discount_period,
    roster_count,
    new_count,
    reactivated_count,
    renamed_count,
    inactivated_count,
    auth.uid()
  )
  returning * into sync_record;

  update public.monthly_cycles cycle
  set status = case
    when exists (
      select 1
      from public.import_batches batch
      join public.source_files source on source.id = batch.source_file_id
      where source.cycle_id = cycle.id
        and batch.status <> 'superseded'::public.import_status
        and batch.rejected_rows > 0
    ) then 'manual_review'::public.cycle_status
    else 'reconciling'::public.cycle_status
  end
  where cycle.id = target_cycle.id
    and cycle.status <> 'closed'::public.cycle_status;

  return sync_record;
end;
$$;

create or replace function public.supersede_import_batch(
  p_import_batch_id uuid,
  p_reason text
)
returns public.import_batches
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_batch public.import_batches;
  target_source public.source_files;
  target_cycle public.monthly_cycles;
begin
  if not private.has_active_role('treasurer'::public.app_role) then
    raise exception 'Sólo tesorería puede descartar una carga';
  end if;

  if char_length(trim(coalesce(p_reason, ''))) < 5
    or char_length(trim(coalesce(p_reason, ''))) > 500
  then
    raise exception 'Debes indicar un motivo de entre 5 y 500 caracteres';
  end if;

  select * into target_batch
  from public.import_batches
  where id = p_import_batch_id
  for update;

  if target_batch.id is null then
    raise exception 'La carga no existe';
  end if;

  select * into target_source
  from public.source_files
  where id = target_batch.source_file_id;

  select * into target_cycle
  from public.monthly_cycles
  where id = target_source.cycle_id
  for update;

  if target_batch.status = 'superseded'::public.import_status then
    raise exception 'La carga ya está descartada';
  end if;

  if target_batch.status = 'processing'::public.import_status then
    raise exception 'No se puede descartar una carga mientras se procesa';
  end if;

  if target_cycle.status = 'closed'::public.cycle_status then
    raise exception 'No se puede modificar un ciclo cerrado';
  end if;

  if exists (
    select 1 from public.member_roster_syncs applied
    where applied.import_batch_id = p_import_batch_id
  ) then
    raise exception 'Esta carga ya actualizó el padrón y no puede descartarse sin una corrección controlada';
  end if;

  update public.import_batches
  set
    status = 'superseded'::public.import_status,
    superseded_by = auth.uid(),
    superseded_at = now(),
    superseded_reason = trim(p_reason)
  where id = p_import_batch_id
  returning * into target_batch;

  update public.alerts
  set
    status = 'dismissed'::public.alert_status,
    resolved_by = auth.uid(),
    resolved_at = now(),
    resolution_note = 'Carga descartada: ' || trim(p_reason)
  where entity_type = 'import_batch'
    and entity_id = p_import_batch_id
    and status = 'open'::public.alert_status;

  update public.monthly_cycles cycle
  set status = case
    when exists (
      select 1
      from public.import_batches batch
      join public.source_files source on source.id = batch.source_file_id
      where source.cycle_id = cycle.id
        and batch.status <> 'superseded'::public.import_status
        and batch.rejected_rows > 0
    ) then 'manual_review'::public.cycle_status
    else 'reconciling'::public.cycle_status
  end
  where cycle.id = target_cycle.id
    and cycle.status <> 'closed'::public.cycle_status;

  return target_batch;
end;
$$;

revoke all on function public.preview_member_roster_sync(uuid) from public;
revoke all on function public.apply_member_roster_sync(uuid, integer) from public;
revoke all on function public.supersede_import_batch(uuid, text) from public;

grant execute on function public.preview_member_roster_sync(uuid) to authenticated;
grant execute on function public.apply_member_roster_sync(uuid, integer) to authenticated;
grant execute on function public.supersede_import_batch(uuid, text) to authenticated;

commit;
