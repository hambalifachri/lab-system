-- ================= CHECK SCHEDULES FOR 2026/2027 GASAL =================
-- Jalankan di Supabase SQL Editor untuk diagnostic dan setup data jadwal

-- 1. Check berapa jadwal yang ada dan statusnya
SELECT 
  COUNT(*) as total_schedules,
  SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active_count,
  SUM(CASE WHEN status = 'archived' THEN 1 ELSE 0 END) as archived_count,
  SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_count
FROM public.lab_schedules;

-- 2. Check jadwal untuk semester gasal 2026/2027
SELECT id, room_id, day_name, start_time, end_time, subject, class_name, lecturer_name, 
       status, semester_label, period_start, period_end, archived_at
FROM public.lab_schedules
WHERE semester_label LIKE '%2026/2027%' AND semester_label LIKE '%Gasal%'
ORDER BY created_at DESC;

-- 3. Check scheduled yang masuk ke view (yang tampil di halaman publik)
SELECT id, room_name, day_name, start_time, end_time, subject, class_name, 
       lecturer_name, semester_label, period_start, period_end
FROM public.lab_schedule_view
ORDER BY period_start DESC, day_name, start_time;

-- 4. INSERT SAMPLE DATA untuk semester gasal 2026/2027 (jalankan kalau belum ada data)
-- Uncomment bagian ini kalau ingin menambahkan sample data
/*
INSERT INTO public.lab_schedules 
(room_id, day_name, start_time, end_time, subject, class_name, lecturer_name, 
 schedule_type, status, semester_label, period_type, period_start, period_end, 
 participant_count, participant_nims, archived_at, created_at)
VALUES
  (1, 'Senin', '08:00:00', '10:00:00', 'Pemrograman Web', 'Teknik Sipil 4A', 
   'Dr. Budi', 'kuliah', 'active', '2026/2027 Semester Gasal', 'gasal', 
   '2026-09-01', '2026-10-31', 25, '{}', NULL, NOW()),
  
  (1, 'Rabu', '10:00:00', '12:00:00', 'Basis Data', 'Teknik Sipil 3B', 
   'Prof. Andi', 'kuliah', 'active', '2026/2027 Semester Gasal', 'gasal', 
   '2026-09-01', '2026-10-31', 25, '{}', NULL, NOW()),
  
  (2, 'Selasa', '13:00:00', '15:00:00', 'Praktik Desain', 'Arsitektur 2C', 
   'Dra. Siti', 'praktik', 'active', '2026/2027 Semester Gasal', 'gasal', 
   '2026-09-01', '2026-10-31', 20, '{}', NULL, NOW()),
  
  (2, 'Jumat', '08:00:00', '10:00:00', 'CAD Lanjut', 'Arsitektur 4D', 
   'Ir. Hadi', 'praktik', 'active', '2026/2027 Semester Gasal', 'gasal', 
   '2026-09-01', '2026-10-31', 20, '{}', NULL, NOW());

-- Verify inserted data
SELECT COUNT(*) as new_schedules_added
FROM public.lab_schedules
WHERE semester_label LIKE '%2026/2027%' AND semester_label LIKE '%Gasal%' 
  AND status = 'active';
*/
