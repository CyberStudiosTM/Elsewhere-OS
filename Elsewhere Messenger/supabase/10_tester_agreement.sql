-- Meta requires an agreement with every tester: record when they agreed.
alter table public.elsewhere_tester_requests add column if not exists agreed_at timestamptz;
