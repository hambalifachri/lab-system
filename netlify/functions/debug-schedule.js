// ================= DIAGNOSTIC ENDPOINT =================
// GET /.netlify/functions/debug-schedule
// Shows all active schedules and their status for debugging

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function response(statusCode, data) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  };
}

exports.handler = async function(event) {
  if (event.httpMethod !== "GET") {
    return response(405, { status: "error", message: "Method tidak diizinkan" });
  }

  try {
    // Get all schedules regardless of status
    const { data: allSchedules, error: allError } = await supabase
      .from('lab_schedules')
      .select('id, room_id, day_name, start_time, end_time, subject, class_name, lecturer_name, status, semester_label, period_type, period_start, period_end, archived_at, created_at')
      .order('created_at', { ascending: false });

    if (allError) throw allError;

    // Get from the public view
    const { data: viewSchedules, error: viewError } = await supabase
      .from('lab_schedule_view')
      .select('*')
      .order('period_start', { ascending: false });

    if (viewError) throw viewError;

    // Get approved single bookings
    const { data: bookings, error: bookingError } = await supabase
      .from('lab_bookings')
      .select('id, booking_date, day_name, start_time, end_time, purpose, borrower_name, status, request_type, semester_label, period_start, period_end')
      .eq('status', 'approved')
      .eq('request_type', 'single')
      .order('booking_date', { ascending: false });

    if (bookingError) throw bookingError;

    // Count by status
    const statusCounts = {
      active: allSchedules.filter(s => s.status === 'active').length,
      archived: allSchedules.filter(s => s.status === 'archived').length,
      pending: allSchedules.filter(s => s.status === 'pending').length,
      inactive: allSchedules.filter(s => s.status === 'inactive').length
    };

    return response(200, {
      status: "success",
      summary: {
        total_schedules: allSchedules.length,
        status_breakdown: statusCounts,
        schedules_in_view: viewSchedules.length,
        approved_bookings: bookings.length,
        current_date: new Date().toISOString().split('T')[0]
      },
      all_schedules: allSchedules.slice(0, 50),
      view_schedules: viewSchedules.slice(0, 20),
      approved_bookings: bookings.slice(0, 20)
    });

  } catch (error) {
    return response(500, {
      status: "error",
      message: error.message
    });
  }
};
