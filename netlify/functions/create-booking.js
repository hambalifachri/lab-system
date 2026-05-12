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

// ================= DAY HELPER =================
function getIndonesianDay(dateString) {
  const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  const date = new Date(dateString + "T00:00:00");
  return days[date.getDay()];
}

// ================= OVERLAP HELPER =================
function isOverlap(startA, endA, startB, endB) {
  return startA < endB && endA > startB;
}

// ================= CREATE BOOKING FUNCTION =================
exports.handler = async function(event) {
  if (event.httpMethod !== "POST") {
    return response(405, {
      status: "error",
      message: "Method tidak diizinkan"
    });
  }

  try {
    const body = JSON.parse(event.body || "{}");

    const roomId = body.room_id;
    const bookingDate = body.booking_date;
    const startTime = body.start_time;
    const endTime = body.end_time;
    const borrowerName = body.borrower_name || "";
    const borrowerRole = body.borrower_role || "";
    const borrowerContact = body.borrower_contact || "";
    const purpose = body.purpose || "";

    if (!roomId || !bookingDate || !startTime || !endTime || !borrowerName || !borrowerRole || !purpose) {
      return response(400, {
        status: "error",
        message: "Data peminjaman belum lengkap"
      });
    }

    if (!['Dosen', 'Staff'].includes(borrowerRole)) {
      return response(400, {
        status: "error",
        message: "Peminjam hanya boleh Dosen atau Staff"
      });
    }

    if (startTime < "08:00" || endTime > "16:00" || startTime >= endTime) {
      return response(400, {
        status: "error",
        message: "Jam peminjaman harus di antara 08:00 - 16:00"
      });
    }

    const dayName = getIndonesianDay(bookingDate);

    if (dayName === "Minggu") {
      return response(400, {
        status: "error",
        message: "Peminjaman hanya Senin sampai Sabtu"
      });
    }

    // ================= CEK BENTROK JADWAL TETAP =================
    const { data: schedules } = await supabase
      .from('lab_schedules')
      .select('start_time, end_time')
      .eq('room_id', roomId)
      .eq('day_name', dayName)
      .eq('status', 'active');

    const scheduleConflict = (schedules || []).some(item =>
      isOverlap(startTime, endTime, item.start_time.slice(0, 5), item.end_time.slice(0, 5))
    );

    if (scheduleConflict) {
      return response(409, {
        status: "error",
        message: "Jadwal bentrok dengan jadwal tetap lab"
      });
    }

    // ================= CEK BENTROK BOOKING APPROVED/PENDING =================
    const { data: bookings } = await supabase
      .from('lab_bookings')
      .select('start_time, end_time')
      .eq('room_id', roomId)
      .eq('booking_date', bookingDate)
      .in('status', ['pending', 'approved']);

    const bookingConflict = (bookings || []).some(item =>
      isOverlap(startTime, endTime, item.start_time.slice(0, 5), item.end_time.slice(0, 5))
    );

    if (bookingConflict) {
      return response(409, {
        status: "error",
        message: "Jam tersebut sudah diajukan atau sudah dipinjam"
      });
    }

    // ================= SIMPAN BOOKING =================
    const { error } = await supabase
      .from('lab_bookings')
      .insert({
        room_id: roomId,
        booking_date: bookingDate,
        day_name: dayName,
        start_time: startTime,
        end_time: endTime,
        borrower_name: borrowerName,
        borrower_role: borrowerRole,
        borrower_contact: borrowerContact,
        purpose,
        status: "pending"
      });

    if (error) {
      return response(500, {
        status: "error",
        message: "Gagal menyimpan peminjaman"
      });
    }

    return response(200, {
      status: "success",
      message: "Pengajuan peminjaman berhasil dikirim dan menunggu persetujuan admin"
    });

  } catch (error) {
    return response(500, {
      status: "error",
      message: "Gagal membuat peminjaman"
    });
  }
};
