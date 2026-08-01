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

// ================= ADMIN AUTH HELPER =================
function isAdmin(event) {
  const token = event.headers['x-admin-token'];
  return token && token === process.env.ADMIN_TOKEN;
}

// ================= UPDATE BOOKING STATUS FUNCTION =================
exports.handler = async function(event) {
  if (event.httpMethod !== "POST") {
    return response(405, {
      status: "error",
      message: "Method tidak diizinkan"
    });
  }

  if (!isAdmin(event)) {
    return response(401, {
      status: "error",
      message: "Akses admin ditolak"
    });
  }

  try {
    const body = JSON.parse(event.body || "{}");

    const id = body.id;
    const status = body.status;
    const adminNote = body.admin_note || "";

    if (!id || !['approved', 'rejected', 'cancelled'].includes(status)) {
      return response(400, {
        status: "error",
        message: "Data status tidak valid"
      });
    }

    if (status === 'approved') {
      const bookingResult = await supabase
        .from('lab_bookings')
        .select('id, room_id, booking_date, day_name, start_time, end_time')
        .eq('id', id)
        .maybeSingle();

      if (bookingResult.error || !bookingResult.data) {
        return response(404, { status: "error", message: "Booking tidak ditemukan" });
      }

      const booking = bookingResult.data;
      const [scheduleResult, approvedResult] = await Promise.all([
        supabase.from('lab_schedules')
          .select('start_time, end_time')
          .eq('room_id', booking.room_id)
          .eq('day_name', booking.day_name)
          .eq('status', 'active'),
        supabase.from('lab_bookings')
          .select('id, start_time, end_time')
          .eq('room_id', booking.room_id)
          .eq('booking_date', booking.booking_date)
          .eq('status', 'approved')
          .neq('id', id)
      ]);

      if (scheduleResult.error || approvedResult.error) throw scheduleResult.error || approvedResult.error;
      const overlaps = item =>
        booking.start_time.slice(0, 5) < item.end_time.slice(0, 5) &&
        booking.end_time.slice(0, 5) > item.start_time.slice(0, 5);

      if ((scheduleResult.data || []).some(overlaps) || (approvedResult.data || []).some(overlaps)) {
        return response(409, { status: "error", message: "Booking tidak dapat disetujui karena jadwal sudah bentrok" });
      }
    }

    const { error } = await supabase
      .from('lab_bookings')
      .update({
        status: status,
        admin_note: adminNote
      })
      .eq('id', id);

    if (error) {
      return response(500, {
        status: "error",
        message: "Gagal update status peminjaman"
      });
    }

    return response(200, {
      status: "success",
      message: "Status peminjaman berhasil diperbarui"
    });

  } catch (error) {
    return response(500, {
      status: "error",
      message: "Gagal update peminjaman"
    });
  }
};
