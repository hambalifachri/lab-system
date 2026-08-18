create table if not exists public.lab_period_settings (
  period_type text primary key check (period_type in ('gasal', 'genap')),
  start_month smallint not null check (start_month between 1 and 12),
  start_day smallint not null check (start_day between 1 and 31),
  end_month smallint not null check (end_month between 1 and 12),
  end_day smallint not null check (end_day between 1 and 31),
  updated_at timestamptz not null default now()
);

insert into public.lab_period_settings (period_type, start_month, start_day, end_month, end_day)
values
  ('gasal', 9, 1, 10, 31),
  ('genap', 3, 1, 5, 31)
on conflict (period_type) do nothing;

alter table public.lab_period_settings enable row level security;
revoke all on public.lab_period_settings from anon, authenticated;
