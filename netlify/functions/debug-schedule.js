// ================= DIAGNOSTIC ENDPOINT =================
// GET /.netlify/functions/debug-schedule
// Shows detailed diagnostic info about schedule data and view filtering

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
    // 1. Get all schedules regardless of status
    const { data: allSchedules, error: allError } = await supabase
      .from('lab_schedules')
      .select('id, room_id, day_name, start_time, end_time, subject, class_name, lecturer_name, status, semester_label, period_type, period_start, period_end, archived_at, created_at')
      .order('created_at', { ascending: false });

    if (allError) throw allError;

    // 2. Get from the public view
    const { data: viewSchedules, error: viewError } = await supabase
      .from('lab_schedule_view')
      .select('*')
      .order('period_start', { ascending: false });

    if (viewError) throw viewError;

    // 3. Get approved single bookings
    const { data: bookings, error: bookingError } = await supabase
      .from('lab_bookings')
      .select('id, booking_date, day_name, start_time, end_time, purpose, borrower_name, status, request_type, semester_label, period_start, period_end')
      .eq('status', 'approved')
      .eq('request_type', 'single')
      .order('booking_date', { ascending: false });

    if (bookingError) throw bookingError;

    // 4. Check rooms
    const { data: rooms, error: roomError } = await supabase
      .from('lab_rooms')
      .select('id, room_name');

    if (roomError) throw roomError;

    // 5. Analyze why schedules might not appear in view
    const analysisIssues = [];
    const allActive = allSchedules.filter(s => s.status === 'active');
    
    allActive.forEach(sched => {
      const issues = [];
      
      if (!sched.period_start) issues.push('period_start is NULL');
      if (!sched.period_end) issues.push('period_end is NULL');
      if (sched.period_start && sched.period_end && sched.period_end < sched.period_start) {
        issues.push('period_end < period_start');
      }
      
      const room = rooms.find(r => r.id === sched.room_id);
      if (!room) issues.push(`room_id ${sched.room_id} not found`);
      
      if (issues.length > 0) {
        analysisIssues.push({
          id: sched.id,
          subject: sched.subject,
          issues
        });
      }
    });

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
        rooms_total: rooms.length,
        current_date: new Date().toISOString().split('T')[0],
        diagnosis: {
          data_exists: allSchedules.length > 0,
          active_schedules_exist: allActive.length > 0,
          view_shows_nothing: viewSchedules.length === 0,
          possible_issue: allActive.length > 0 && viewSchedules.length === 0 
            ? 'Data exists but filtered out by view conditions' 
            : allActive.length === 0 
            ? 'No active schedules in database at all' 
            : 'Data properly displayed in view'
        }
      },
      filter_issues: analysisIssues,
      sample_raw_schedules: allSchedules.slice(0, 10),
      view_schedules: viewSchedules.slice(0, 10),
      rooms_available: rooms,
      sample_bookings: bookings.slice(0, 5)
    });

  } catch (error) {
    return response(500, {
      status: "error",
      message: error.message,
      stack: error.stack
    });
  }
};
