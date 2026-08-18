-- Cleanup Old Schedules
-- Jalankan ini di Supabase SQL Editor untuk archive semua jadwal lama
-- Safe operation: only updates status, data tidak dihapus

-- Archive all active schedules
UPDATE public.lab_schedules
SET status = 'archived',
    archived_at = NOW()
WHERE status = 'active';

-- Verify: Check how many were archived
SELECT COUNT(*) as archived_count, 'schedules' as table_name
FROM public.lab_schedules
WHERE status = 'archived'
  AND archived_at IS NOT NULL
  AND archived_at > NOW() - INTERVAL '5 minutes';
