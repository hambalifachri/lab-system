-- Menambahkan tahun akademik dan periode semester pada booking publik.

alter table public.lab_bookings
  add column if not exists academic_year text not null default 'Belum ditentukan',
  add column if not exists academic_period text not null default 'di_luar_periode';

alter table public.lab_bookings
  drop constraint if exists lab_bookings_academic_period_check;
alter table public.lab_bookings
  add constraint lab_bookings_academic_period_check check (
    academic_period in ('gasal', 'antara_gasal', 'genap', 'antara_genap', 'di_luar_periode')
  );

drop view if exists public.lab_booking_view;
create view public.lab_booking_view with (security_invoker = true) as
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
  b.academic_period
from public.lab_bookings b
join public.lab_rooms r on r.id = b.room_id;

revoke all on public.lab_booking_view from anon, authenticated;
