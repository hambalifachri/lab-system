// Keep historical students; access is granted by a current roster, not students.aktif alone.
function wibDate(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(now);
}

async function hasCurrentEnrollment(db, nim, now = new Date()) {
  const today = wibDate(now);
  const schedule = await db.from('lab_schedules')
    .select('id').eq('status', 'active')
    .contains('participant_nims', [nim])
    .lte('period_start', today).gte('period_end', today).limit(1);
  if (schedule.error) throw schedule.error;
  if (schedule.data?.length) return true;
  // Fixed bookings must have an active schedule; cancelled/archived schedules
  // must not regain access through the original booking.
  const booking = await db.from('lab_bookings')
    .select('id').eq('status', 'approved').eq('request_type', 'single')
    .contains('participant_nims', [nim]).eq('booking_date', today).limit(1);
  if (booking.error) throw booking.error;
  return Boolean(booking.data?.length);
}

module.exports = { hasCurrentEnrollment, wibDate };
