begin;

-- The employer's $8,000 social-fee sheet is the union's authoritative active
-- member roster. This one-time bootstrap creates the July opening roster and
-- links every staged row with the same valid RUT. Historical admission dates
-- remain null because the workbook does not prove them.
create temporary table linked_import_batches (
  batch_id uuid primary key
) on commit drop;

with authoritative_members as (
  select distinct on (staged.normalized_rut)
    staged.normalized_rut as rut,
    trim(staged.source_name) as full_name
  from public.staged_import_rows staged
  join public.import_batches batch
    on batch.id = staged.batch_id
  join public.source_files source
    on source.id = batch.source_file_id
  where source.kind = 'company_result'
    and batch.status = 'processed'
    and staged.record_type = 'social_fee'
    and staged.amount = 8000
    and staged.normalized_rut is not null
    and staged.source_name is not null
    and char_length(trim(staged.source_name)) >= 3
    and not ('invalid_rut' = any(staged.issue_codes))
  order by
    staged.normalized_rut,
    source.uploaded_at desc,
    staged.source_row_number
)
insert into public.members (
  rut,
  full_name,
  status,
  authorized_on
)
select
  roster.rut,
  roster.full_name,
  'active'::public.member_status,
  null
from authoritative_members roster
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
      when cardinality(
        array_remove(staged.issue_codes, 'member_not_found')
      ) = 0
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
insert into linked_import_batches (batch_id)
select distinct batch_id
from linked_rows;

with batch_stats as (
  select
    linked.batch_id,
    count(staged.id)::integer as detected_rows,
    count(staged.id) filter (
      where staged.validation_status = 'ready'
    )::integer as accepted_rows,
    count(staged.id) filter (
      where staged.validation_status = 'manual_review'
    )::integer as rejected_rows,
    coalesce(sum(staged.amount), 0)::bigint as detected_total
  from linked_import_batches linked
  left join public.staged_import_rows staged
    on staged.batch_id = linked.batch_id
  group by linked.batch_id
),
issue_stats as (
  select
    linked.batch_id,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'code',
          grouped.issue_code,
          'count',
          grouped.issue_count
        )
        order by grouped.issue_code
      ) filter (where grouped.issue_code is not null),
      '[]'::jsonb
    ) as error_summary
  from linked_import_batches linked
  left join (
    select
      staged.batch_id,
      issue_code,
      count(*)::integer as issue_count
    from public.staged_import_rows staged,
      unnest(staged.issue_codes) issue_code
    group by staged.batch_id, issue_code
  ) grouped
    on grouped.batch_id = linked.batch_id
  group by linked.batch_id
)
update public.import_batches batch
set
  detected_rows = stats.detected_rows,
  accepted_rows = stats.accepted_rows,
  rejected_rows = stats.rejected_rows,
  detected_total = stats.detected_total,
  error_summary = issues.error_summary
from batch_stats stats
join issue_stats issues
  on issues.batch_id = stats.batch_id
where batch.id = stats.batch_id;

update public.alerts alert
set
  status = case
    when batch.rejected_rows = 0
    then 'resolved'::public.alert_status
    else alert.status
  end,
  details = jsonb_build_object(
    'detected_rows',
    batch.detected_rows,
    'ready_rows',
    batch.accepted_rows,
    'review_rows',
    batch.rejected_rows,
    'issues',
    batch.error_summary
  ),
  resolved_by = case
    when batch.rejected_rows = 0
    then batch.processed_by
    else alert.resolved_by
  end,
  resolved_at = case
    when batch.rejected_rows = 0
    then now()
    else alert.resolved_at
  end,
  resolution_note = case
    when batch.rejected_rows = 0
    then 'Filas asociadas al padrón inicial respaldado por cuota social.'
    else alert.resolution_note
  end
from public.import_batches batch
join linked_import_batches linked
  on linked.batch_id = batch.id
where alert.code = 'IMPORT_REQUIRES_REVIEW'
  and alert.entity_type = 'import_batch'
  and alert.entity_id = batch.id
  and alert.status = 'open';

update public.monthly_cycles cycle
set status = 'reconciling'::public.cycle_status
where cycle.id in (
  select distinct source.cycle_id
  from linked_import_batches linked
  join public.import_batches batch
    on batch.id = linked.batch_id
  join public.source_files source
    on source.id = batch.source_file_id
  where source.cycle_id is not null
)
  and cycle.status <> 'closed'::public.cycle_status
  and not exists (
    select 1
    from public.import_batches active_batch
    join public.source_files active_source
      on active_source.id = active_batch.source_file_id
    where active_source.cycle_id = cycle.id
      and active_batch.status <> 'superseded'
      and active_batch.rejected_rows > 0
  );

commit;
