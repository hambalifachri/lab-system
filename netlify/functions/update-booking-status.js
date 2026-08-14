const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function response(statusCode, data) {
  return { statusCode, headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) };
}

function isAdmin(event) {
  const token = event.headers['x-admin-token'];
  return token && token === process.env.ADMIN_TOKEN;
}

function overlaps(startA, endA, startB, endB) {
  return startA.slice(0, 5) < endB.slice(0, 5) && endA.slice(0, 5) > startB.slice(0, 5);
}

function scheduleType(category) {
  return category === 'ujian' ? 'ujian' : category === 'perkuliahan' ? 'kuliah' : 'lainnya';
}

async function findConflict(booking, id) {
  const isFixed = booking.request_type === 'fixed_schedule';
  let scheduleQuery = supabase.from('lab_schedules')
    .select('start_time, end_time, subject')
    .eq('room_id', booking.room_id)
    .eq('day_name', booking.day_name)
    .eq('status', 'active');
  scheduleQuery = isFixed
    ? scheduleQuery.lte('period_start', booking.period_end).gte('period_end', booking.period_start)
    : scheduleQuery.lte('period_start', booking.booking_date).gte('period_end', booking.booking_date);

  const bookingQueries = isFixed ? [
    supabase.from('lab_bookings').select('start_time, end_time, purpose').eq('room_id', booking.room_id)
      .eq('day_name', booking.day_name).eq('request_type', 'single').eq('status', 'approved')
      .gte('booking_date', booking.period_start).lte('booking_date', booking.period_end).neq('id', id),
    supabase.from('lab_bookings').select('start_time, end_time, purpose').eq('room_id', booking.room_id)
      .eq('day_name', booking.day_name).eq('request_type', 'fixed_schedule').eq('status', 'approved')
      .lte('period_start', booking.period_end).gte('period_end', booking.period_start).neq('id', id)
  ] : [
    supabase.from('lab_bookings').select('start_time, end_time, purpose').eq('room_id', booking.room_id)
      .eq('booking_date', booking.booking_date).eq('request_type', 'single').eq('status', 'approved').neq('id', id),
    supabase.from('lab_bookings').select('start_time, end_time, purpose').eq('room_id', booking.room_id)
      .eq('day_name', booking.day_name).eq('request_type', 'fixed_schedule').eq('status', 'approved')
      .lte('period_start', booking.booking_date).gte('period_end', booking.booking_date).neq('id', id)
  ];

  const [scheduleResult, ...bookingResults] = await Promise.all([scheduleQuery, ...bookingQueries]);
  const queryError = scheduleResult.error || bookingResults.find(result => result.error)?.error;
  if (queryError) throw queryError;
  const candidates = [...(scheduleResult.data || []), ...bookingResults.flatMap(result => result.data || [])];
  return candidates.find(item => overlaps(booking.start_time, booking.end_time, item.start_time, item.end_time));
}

exports.handler = async function(event) {
  if (event.httpMethod !== 'POST') return response(405, { status: 'error', message: 'Method tidak diizinkan' });
  if (!isAdmin(event)) return response(401, { status: 'error', message: 'Akses admin ditolak' });

  try {
    const body = JSON.parse(event.body || '{}');
    const id = Number(body.id || 0);
    const status = body.status;
    const adminNote = String(body.admin_note || '').trim().slice(0, 500);
    if (!id || !['approved', 'rejected', 'cancelled'].includes(status)) {
      return response(400, { status: 'error', message: 'Data status tidak valid' });
    }

    const bookingResult = await supabase.from('lab_bookings')
      .select('id, room_id, booking_date, day_name, start_time, end_time, borrower_name, purpose, booking_category, class_name, participant_count, participant_nims, academic_period, request_type, semester_label, period_start, period_end, schedule_id, status')
      .eq('id', id).maybeSingle();
    if (bookingResult.error || !bookingResult.data) {
      return response(404, { status: 'error', message: 'Booking tidak ditemukan' });
    }
    const booking = bookingResult.data;

    if (status === 'approved') {
      if (booking.status === 'approved') {
        return response(200, { status: 'success', message: 'Pengajuan sudah disetujui' });
      }
      const conflict = await findConflict(booking, id);
      if (conflict) {
        return response(409, { status: 'error', message: `Pengajuan bentrok dengan ${conflict.subject || conflict.purpose || 'jadwal lain'}` });
      }

      let scheduleId = booking.schedule_id;
      if (booking.request_type === 'fixed_schedule' && !scheduleId) {
        const insertResult = await supabase.from('lab_schedules').insert({
          room_id: booking.room_id,
          day_name: booking.day_name,
          start_time: booking.start_time,
          end_time: booking.end_time,
          subject: booking.purpose,
          class_name: booking.class_name,
          lecturer_name: booking.borrower_name,
          schedule_type: scheduleType(booking.booking_category),
          semester_label: booking.semester_label,
          period_type: booking.academic_period,
          period_start: booking.period_start,
          period_end: booking.period_end,
          participant_count: booking.participant_count,
          participant_nims: booking.participant_nims || [],
          status: 'active'
        }).select('id').single();
        if (insertResult.error) throw insertResult.error;
        scheduleId = insertResult.data.id;
      }

      const updateResult = await supabase.from('lab_bookings').update({
        status: 'approved', admin_note: adminNote, rules_accepted_at: null, schedule_id: scheduleId || null
      }).eq('id', id);
      if (updateResult.error) {
        if (booking.request_type === 'fixed_schedule' && scheduleId && !booking.schedule_id) {
          await supabase.from('lab_schedules').delete().eq('id', scheduleId);
        }
        throw updateResult.error;
      }
      return response(200, {
        status: 'success',
        message: booking.request_type === 'fixed_schedule'
          ? 'Jadwal tetap disetujui dan sudah masuk kalender lab'
          : 'Booking berhasil disetujui'
      });
    }

    if (status === 'cancelled' && booking.schedule_id) {
      const archiveResult = await supabase.from('lab_schedules')
        .update({ status: 'archived', archived_at: new Date().toISOString() })
        .eq('id', booking.schedule_id);
      if (archiveResult.error) throw archiveResult.error;
    }

    const { error } = await supabase.from('lab_bookings').update({
      status, admin_note: adminNote, rules_accepted_at: null
    }).eq('id', id);
    if (error) throw error;
    return response(200, { status: 'success', message: 'Status pengajuan berhasil diperbarui' });
  } catch (error) {
    console.error('update-booking-status:', error);
    return response(500, { status: 'error', message: 'Gagal update pengajuan' });
  }
};
