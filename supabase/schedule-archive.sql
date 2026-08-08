-- Jalankan sekali untuk menambahkan arsip jadwal per semester.
-- Jadwal lama tidak dihapus permanen; statusnya menjadi archived.

alter table public.lab_schedules
  add column if not exists semester_label text not null default 'Belum ditentukan',
  add column if not exists archived_at timestamptz;

create index if not exists lab_schedules_semester_status_idx
  on public.lab_schedules (semester_label, status);

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
  s.status
from public.lab_schedules s
join public.lab_rooms r on r.id = s.room_id
where s.status = 'active';

revoke all on public.lab_schedule_view from anon, authenticated;
