// ================= IMPORT LIBRARY =================
const { createClient } = require('@supabase/supabase-js');

// ================= SETUP SUPABASE =================
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ================= RESPONSE HELPER =================
function response(statusCode, data) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  };
}

// ================= GET SCHEDULE FUNCTION =================
exports.handler = async function(event) {
  if (event.httpMethod !== "GET") {
    return response(405, {
      status: "error",
      message: "Method tidak diizinkan"
    });
  }

  try {
    const { data: schedules, error: scheduleError } = await supabase
      .from('lab_schedule_view')
      .select('*');

    const { data: bookings, error: bookingError } = await supabase
      .from('lab_booking_view')
      .select('id, room_name, booking_date, day_name, start_time, end_time, borrower_name, borrower_role, purpose, status, booking_category, class_name, participant_count')
      .eq('status', 'approved');

    if (scheduleError || bookingError) {
      return response(500, {
        status: "error",
        message: "Gagal mengambil jadwal"
      });
    }

    return response(200, {
      status: "success",
      schedules,
      bookings
    });

  } catch (error) {
    return response(500, {
      status: "error",
      message: "Gagal mengambil data"
    });
  }
};
