create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  classification_request_id text not null,
  reason text not null check (
    reason in ('wrong_category', 'wrong_region_rule', 'missing_breakdown', 'unclear_instruction')
  ),
  user_correct_label text,
  user_note text,
  region text not null check (region in ('TW', 'JP')),
  created_at timestamptz not null default now()
);

alter table public.feedback enable row level security;

alter table public.feedback
  add column if not exists rule_key text,
  add column if not exists detected_item_name text,
  add column if not exists municipality text,
  add column if not exists strategy text
    check (strategy is null or strategy in ('rule', 'knowledge', 'unresolved')),
  add column if not exists evidence_chunk_ids text[] not null default '{}',
  add column if not exists status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  add column if not exists reviewed_at timestamptz,
  add column if not exists fingerprint text generated always as (
    md5(
      classification_request_id || '|' ||
      coalesce(rule_key, '') || '|' ||
      reason || '|' ||
      lower(btrim(coalesce(user_correct_label, ''))) || '|' ||
      lower(btrim(coalesce(user_note, '')))
    )
  ) stored;

create unique index if not exists feedback_fingerprint_idx
  on public.feedback (fingerprint);

create index if not exists feedback_status_created_idx
  on public.feedback (status, created_at desc);

create or replace view public.feedback_review_queue as
select
  region,
  rule_key,
  detected_item_name,
  reason,
  user_correct_label,
  count(*)::integer as occurrences,
  case
    when count(*) >= 5 then 'high'
    when count(*) >= 2 then 'medium'
    else 'low'
  end as priority,
  min(id::text) as sample_feedback_id,
  max(created_at) as last_seen
from public.feedback
where status = 'pending'
group by region, rule_key, detected_item_name, reason, user_correct_label;

revoke all on table public.feedback from anon, authenticated;
revoke all on table public.feedback_review_queue from anon, authenticated;
grant insert, select, update on table public.feedback to service_role;
grant select on table public.feedback_review_queue to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'feedback-images',
  'feedback-images',
  false,
  4500000,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Deliberately no anon/authenticated storage.objects policy: the bucket is deny-by-default.
-- The service role bypasses RLS and remains server-only.
