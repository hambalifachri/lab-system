-- Pengajuan jadwal tetap semester dari form publik dosen.

alter table public.lab_bookings
  add column if not exists request_type text not null default 'single',
  add column if not exists semester_label text,
  add column if not exists period_start date,
  add column if not exists period_end date,
  add column if not exists schedule_id bigint references public.lab_schedules(id) on delete set null;

alter table public.lab_bookings
  drop constraint if exists lab_bookings_request_type_check;
alter table public.lab_bookings
  add constraint lab_bookings_request_type_check
  check (request_type in ('single', 'fixed_schedule'));

alter table public.lab_bookings
  drop constraint if exists lab_bookings_fixed_period_check;
alter table public.lab_bookings
  add constraint lab_bookings_fixed_period_check check (
    request_type = 'single'
    or (
      semester_label is not null
      and period_start is not null
      and period_end is not null
      and period_end >= period_start
    )
  );

create index if not exists lab_bookings_fixed_period_idx
  on public.lab_bookings (room_id, day_name, period_start, period_end)
  where request_type = 'fixed_schedule';

create index if not exists lab_bookings_schedule_id_idx
  on public.lab_bookings (schedule_id)
  where schedule_id is not null;

drop view if exists public.lab_booking_view;
create view public.lab_booking_view
with (security_invoker = true) as
select
  b.id,
  b.room_id,
  r.room_name,
  b.booking_date,
  b.day_name,
  b.start_time,
  b.end_time,
  b.borrower_name,
  b.borrower_role,
  b.borrower_contact,
  b.purpose,
  b.status,
  b.admin_note,
  b.created_at,
  b.booking_code,
  b.booking_category,
  b.class_name,
  b.participant_count,
  b.participant_nims,
  b.rules_accepted_at,
  b.academic_year,
  b.academic_period,
  b.request_type,
  b.semester_label,
  b.period_start,
  b.period_end,
  b.schedule_id
from public.lab_bookings b
join public.lab_rooms r on r.id = b.room_id;

revoke all on public.lab_booking_view from anon, authenticated;
