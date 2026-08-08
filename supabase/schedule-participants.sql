-- Daftar NIM mahasiswa untuk setiap jadwal tetap.

alter table public.lab_schedules
  add column if not exists participant_count integer not null default 0,
  add column if not exists participant_nims text[] not null default '{}';

alter table public.lab_schedules
  drop constraint if exists lab_schedules_participant_count_check;
alter table public.lab_schedules
  add constraint lab_schedules_participant_count_check
  check (participant_count between 0 and 200);
