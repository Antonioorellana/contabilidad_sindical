begin;

-- Jumbo appends an amount-only footer that repeats the complete sheet total.
-- It is evidence metadata, not a member discount. Keeping it in staging would
-- double the detected total and create a fictitious row without a RUT.
create temporary table corrected_import_batches (
  batch_id uuid primary key
) on commit drop;

with amount_only_totals as (
  select staged.id, staged.batch_id
  from public.staged_import_rows staged
  where staged.normalized_rut is null
    and staged.member_id is null
    and staged.source_name is null
    and staged.category is null
    and staged.source_reference is null
    and staged.total_amount is null
    and staged.installment_number is null
    and staged.installment_count is null
    and staged.discount_period is null
    and staged.amount is not null
    and staged.source_row_number = (
      select max(candidate.source_row_number)
      from public.staged_import_rows candidate
      where candidate.batch_id = staged.batch_id
        and candidate.sheet_name = staged.sheet_name
    )
    and staged.amount = (
      select coalesce(sum(candidate.amount), 0)
      from public.staged_import_rows candidate
      where candidate.batch_id = staged.batch_id
        and candidate.sheet_name = staged.sheet_name
        and candidate.id <> staged.id
        and candidate.source_row_number < staged.source_row_number
    )
),
affected_batches as (
  delete from public.staged_import_rows staged
  using amount_only_totals total_row
  where staged.id = total_row.id
  returning total_row.batch_id
)
insert into corrected_import_batches (batch_id)
select distinct batch_id
from affected_batches;

with batch_stats as (
  select
    corrected.batch_id,
    count(staged.id)::integer as detected_rows,
    count(staged.id) filter (
      where staged.validation_status = 'ready'
    )::integer as accepted_rows,
    count(staged.id) filter (
      where staged.validation_status = 'manual_review'
    )::integer as rejected_rows,
    coalesce(sum(staged.amount), 0)::bigint as detected_total
  from corrected_import_batches corrected
  left join public.staged_import_rows staged
    on staged.batch_id = corrected.batch_id
  group by corrected.batch_id
),
issue_stats as (
  select
    corrected.batch_id,
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
  from corrected_import_batches corrected
  left join (
    select
      staged.batch_id,
      issue_code,
      count(*)::integer as issue_count
    from public.staged_import_rows staged,
      unnest(staged.issue_codes) issue_code
    group by staged.batch_id, issue_code
  ) grouped
    on grouped.batch_id = corrected.batch_id
  group by corrected.batch_id
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
set details = jsonb_build_object(
  'detected_rows',
  batch.detected_rows,
  'ready_rows',
  batch.accepted_rows,
  'review_rows',
  batch.rejected_rows,
  'issues',
  batch.error_summary
)
from public.import_batches batch
join corrected_import_batches corrected
  on corrected.batch_id = batch.id
where alert.code = 'IMPORT_REQUIRES_REVIEW'
  and alert.entity_type = 'import_batch'
  and alert.entity_id = batch.id;

commit;
