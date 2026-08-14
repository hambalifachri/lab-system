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

const DAYS = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const PERIODS = ['gasal', 'antara_gasal', 'genap', 'antara_genap'];

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
    const requestType = clean(body.request_type || 'single', 20);
    const periodStart = clean(body.period_start, 10);
    const periodEnd = clean(body.period_end, 10);
    const semesterLabel = clean(body.semester_label, 80);
    const requestedDay = clean(body.day_name, 10);
    const bookingDate = requestType === 'fixed_schedule' ? periodStart : clean(body.booking_date, 10);
    const startTime = clean(body.start_time, 5);
    const endTime = clean(body.end_time, 5);
    const borrowerName = clean(body.borrower_name, 120);
    const borrowerRole = clean(body.borrower_role, 20);
    const borrowerContact = clean(body.borrower_contact, 120);
    const purpose = clean(body.purpose, 500);
    const bookingCategory = clean(body.booking_category || 'perkuliahan', 30);
    const className = clean(body.class_name, 120);
    const participantCount = Number(body.participant_count || 0);
    const academicYear = clean(body.academic_year, 9);
    const academicPeriod = clean(body.academic_period, 30);
    const participantNims = [...new Set(Array.isArray(body.participant_nims)
      ? body.participant_nims.map(item => clean(item, 11)).filter(Boolean)
      : [])];

    if (!['single', 'fixed_schedule'].includes(requestType)) {
      return response(400, { status: "error", message: "Jenis pengajuan tidak valid" });
    }

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

    if (requestType === 'fixed_schedule' && borrowerRole !== 'Dosen') {
      return response(400, { status: "error", message: "Jadwal tetap semester hanya dapat diajukan oleh dosen" });
    }

    const academicYears = academicYear.match(/^(\d{4})\/(\d{4})$/);
    if (!academicYears || Number(academicYears[2]) !== Number(academicYears[1]) + 1 ||
        ![...PERIODS, 'di_luar_periode'].includes(academicPeriod) ||
        (requestType === 'fixed_schedule' && !PERIODS.includes(academicPeriod))) {
      return response(400, { status: "error", message: "Tahun akademik atau periode semester tidak valid" });
    }

    const maxParticipants = requestType === 'fixed_schedule' ? 200 : 25;
    if (!className || !Number.isInteger(participantCount) || participantCount < 1 || participantCount > maxParticipants) {
      return response(400, { status: "error", message: `Kelas/prodi dan jumlah peserta 1-${maxParticipants} wajib diisi` });
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

    const dayName = requestType === 'fixed_schedule' ? requestedDay : getIndonesianDay(bookingDate);

    if (requestType === 'fixed_schedule' &&
        (!DAYS.includes(dayName) || !semesterLabel || !/^\d{4}-\d{2}-\d{2}$/.test(periodStart) ||
         !/^\d{4}-\d{2}-\d{2}$/.test(periodEnd) || periodStart < today || periodStart > periodEnd)) {
      return response(400, { status: "error", message: "Hari dan periode berlaku jadwal tetap tidak valid" });
    }

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
    let scheduleQuery = supabase
      .from('lab_schedules')
      .select('start_time, end_time, period_start, period_end')
      .eq('room_id', roomId)
      .eq('day_name', dayName)
      .eq('status', 'active');
    scheduleQuery = requestType === 'fixed_schedule'
      ? scheduleQuery.lte('period_start', periodEnd).gte('period_end', periodStart)
      : scheduleQuery.lte('period_start', bookingDate).gte('period_end', bookingDate);
    const { data: schedules, error: scheduleError } = await scheduleQuery;

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
    const baseFields = 'start_time, end_time, request_type, booking_date, period_start, period_end';
    let bookingQueries;
    if (requestType === 'fixed_schedule') {
      bookingQueries = [
        supabase.from('lab_bookings').select(baseFields).eq('room_id', roomId).eq('day_name', dayName)
          .eq('request_type', 'single').gte('booking_date', periodStart).lte('booking_date', periodEnd).in('status', ['pending', 'approved']),
        supabase.from('lab_bookings').select(baseFields).eq('room_id', roomId).eq('day_name', dayName)
          .eq('request_type', 'fixed_schedule').lte('period_start', periodEnd).gte('period_end', periodStart).in('status', ['pending', 'approved'])
      ];
    } else {
      bookingQueries = [
        supabase.from('lab_bookings').select(baseFields).eq('room_id', roomId).eq('booking_date', bookingDate)
          .eq('request_type', 'single').in('status', ['pending', 'approved']),
        supabase.from('lab_bookings').select(baseFields).eq('room_id', roomId).eq('day_name', dayName)
          .eq('request_type', 'fixed_schedule').lte('period_start', bookingDate).gte('period_end', bookingDate).in('status', ['pending', 'approved'])
      ];
    }
    const bookingResults = await Promise.all(bookingQueries);
    const bookingError = bookingResults.find(result => result.error)?.error;
    if (bookingError) throw bookingError;
    const bookings = bookingResults.flatMap(result => result.data || []);
    const bookingConflict = bookings.some(item =>
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
        academic_year: academicYear,
        academic_period: academicPeriod,
        request_type: requestType,
        semester_label: requestType === 'fixed_schedule' ? semesterLabel : null,
        period_start: requestType === 'fixed_schedule' ? periodStart : null,
        period_end: requestType === 'fixed_schedule' ? periodEnd : null,
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
      message: requestType === 'fixed_schedule'
        ? "Pengajuan jadwal tetap berhasil dikirim dan menunggu persetujuan admin"
        : "Pengajuan berhasil dikirim dan menunggu persetujuan admin",
      booking_code: bookingCode
    });

  } catch (error) {
    return response(500, {
      status: "error",
      message: "Gagal membuat peminjaman"
    });
  }
};
