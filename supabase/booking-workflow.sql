-- Jalankan sekali di Supabase SQL Editor sebelum deploy fitur tracking booking.
-- Data lama dipertahankan dan diberi kode booking otomatis.

alter table public.lab_bookings
  add column if not exists booking_code text,
  add column if not exists booking_category text not null default 'perkuliahan',
  add column if not exists class_name text,
  add column if not exists participant_count integer not null default 1,
  add column if not exists participant_nims text[] not null default '{}',
  add column if not exists rules_accepted_at timestamptz;

update public.lab_bookings
set booking_code = 'LAB-OLD-' || upper(substr(md5(random()::text || id::text), 1, 10))
where booking_code is null or booking_code = '';

alter table public.lab_bookings alter column booking_code set not null;
create unique index if not exists lab_bookings_booking_code_idx
  on public.lab_bookings (booking_code);

drop view if exists public.lab_booking_view;
create view public.lab_booking_view as
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
  b.rules_accepted_at
from public.lab_bookings b
join public.lab_rooms r on r.id = b.room_id;

revoke all on public.lab_booking_view from anon, authenticated;
