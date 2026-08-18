-- Jalankan sekali untuk menambahkan periode berlaku pada jadwal tetap.
-- Tanggal dapat diubah admin, khususnya untuk semester antara.

alter table public.lab_schedules
  add column if not exists period_type text,
  add column if not exists period_start date,
  add column if not exists period_end date;

update public.lab_schedules
set
  period_type = coalesce(period_type, 'gasal'),
  period_start = coalesce(period_start, current_date),
  period_end = coalesce(period_end, current_date)
where period_type is null or period_start is null or period_end is null;

alter table public.lab_schedules
  alter column period_type set not null,
  alter column period_start set not null,
  alter column period_end set not null;

alter table public.lab_schedules
  drop constraint if exists lab_schedules_period_dates_check;
alter table public.lab_schedules
  add constraint lab_schedules_period_dates_check check (period_end >= period_start);

create index if not exists lab_schedules_active_period_idx
  on public.lab_schedules (status, period_start, period_end);

drop view if exists public.lab_schedule_view;
create view public.lab_schedule_view as
select
  s.id,
  r.room_name,
  s.day_name,
  s.start_time,
  s.end_time,
  s.subject,
  s.class_name,
  s.lecturer_name,
  s.schedule_type,
  s.semester_label,
  s.period_type,
  s.period_start,
  s.period_end,
  s.status
from public.lab_schedules s
join public.lab_rooms r on r.id = s.room_id
where s.status = 'active'
  and s.period_start is not null
  and s.period_end is not null
  and s.period_end >= s.period_start;

revoke all on public.lab_schedule_view from anon, authenticated;
