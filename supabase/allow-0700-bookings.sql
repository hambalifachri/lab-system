-- Jalankan sekali di Supabase SQL Editor.
-- Menghapus batas waktu lama pada tabel, lalu backend membatasi booking sekali
-- pukul 07:00-16:00 dan tetap membolehkan pilihan waktu khusus jadwal semester.

do $$
declare
  constraint_record record;
begin
  for constraint_record in
    select conname, conrelid::regclass as table_name
    from pg_constraint
    where contype = 'c'
      and conrelid in ('public.lab_bookings'::regclass, 'public.lab_schedules'::regclass)
      and pg_get_constraintdef(oid) ~ '(start_time|end_time)'
  loop
    execute format('alter table %s drop constraint %I', constraint_record.table_name, constraint_record.conname);
  end loop;
end $$;

alter table public.lab_bookings
  add constraint lab_bookings_time_order_check
  check (start_time < end_time) not valid;

alter table public.lab_schedules
  add constraint lab_schedules_time_order_check
  check (start_time < end_time) not valid;

alter table public.lab_bookings validate constraint lab_bookings_time_order_check;
alter table public.lab_schedules validate constraint lab_schedules_time_order_check;
