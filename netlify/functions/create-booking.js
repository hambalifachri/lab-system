// ================= IMPORT LIBRARY =================
const { createClient } = require('@supabase/supabase-js');
const { randomBytes } = require('crypto');

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

function clean(value, maxLength = 160) {
  return String(value || "").trim().slice(0, maxLength);
}

function createBookingCode(bookingDate) {
  return `LAB-${bookingDate.replaceAll('-', '')}-${randomBytes(4).toString('hex').toUpperCase()}`;
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

    const roomId = Number(body.room_id || 0);
    const bookingDate = clean(body.booking_date, 10);
    const startTime = clean(body.start_time, 5);
    const endTime = clean(body.end_time, 5);
    const borrowerName = clean(body.borrower_name, 120);
    const borrowerRole = clean(body.borrower_role, 20);
    const borrowerContact = clean(body.borrower_contact, 120);
    const purpose = clean(body.purpose, 500);
    const bookingCategory = clean(body.booking_category || 'perkuliahan', 30);
    const className = clean(body.class_name, 120);
    const participantCount = Number(body.participant_count || 0);
    const participantNims = [...new Set(Array.isArray(body.participant_nims)
      ? body.participant_nims.map(item => clean(item, 11)).filter(Boolean)
      : [])];

    if (!roomId || !bookingDate || !startTime || !endTime || !borrowerName || !borrowerRole || !borrowerContact || !purpose) {
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

    if (!['perkuliahan', 'ujian', 'pelatihan', 'lainnya'].includes(bookingCategory)) {
      return response(400, { status: "error", message: "Jenis kegiatan tidak valid" });
    }

    if (!className || !Number.isInteger(participantCount) || participantCount < 1 || participantCount > 25) {
      return response(400, { status: "error", message: "Kelas/prodi dan jumlah peserta 1-25 wajib diisi" });
    }

    if (participantNims.some(nim => !/^\d{11}$/.test(nim)) || participantNims.length > participantCount) {
      return response(400, { status: "error", message: "Daftar NIM tidak valid atau melebihi jumlah peserta" });
    }

    const today = new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(bookingDate) || bookingDate < today) {
      return response(400, {
        status: "error",
        message: "Tanggal peminjaman tidak boleh di masa lalu"
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

    const roomResult = await supabase
      .from('lab_rooms')
      .select('id')
      .eq('id', roomId)
      .maybeSingle();

    if (roomResult.error || !roomResult.data) {
      return response(400, { status: "error", message: "Ruangan tidak ditemukan" });
    }

    // ================= CEK BENTROK JADWAL TETAP =================
    const { data: schedules, error: scheduleError } = await supabase
      .from('lab_schedules')
      .select('start_time, end_time')
      .eq('room_id', roomId)
      .eq('day_name', dayName)
      .eq('status', 'active')
      .lte('period_start', bookingDate)
      .gte('period_end', bookingDate);

    if (scheduleError) throw scheduleError;

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
    const { data: bookings, error: bookingError } = await supabase
      .from('lab_bookings')
      .select('start_time, end_time')
      .eq('room_id', roomId)
      .eq('booking_date', bookingDate)
      .in('status', ['pending', 'approved']);

    if (bookingError) throw bookingError;

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
    const bookingCode = createBookingCode(bookingDate);
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
        booking_code: bookingCode,
        booking_category: bookingCategory,
        class_name: className,
        participant_count: participantCount,
        participant_nims: participantNims,
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
      message: "Pengajuan berhasil dikirim dan menunggu persetujuan admin",
      booking_code: bookingCode
    });

  } catch (error) {
    return response(500, {
      status: "error",
      message: "Gagal membuat peminjaman"
    });
  }
};
