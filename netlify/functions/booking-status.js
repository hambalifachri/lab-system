const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const LAB_RULES = [
  "Peserta wajib login menggunakan NIM masing-masing dan dilarang meminjamkan identitas.",
  "Dilarang memasang atau menghapus aplikasi tanpa izin pengelola laboratorium.",
  "Dilarang mengubah konfigurasi komputer, jaringan, kabel, atau perangkat laboratorium.",
  "Penanggung jawab memastikan ruangan tetap bersih, rapi, dan seluruh perangkat digunakan dengan baik.",
  "Kerusakan atau kendala wajib segera dilaporkan kepada pengelola laboratorium.",
  "Kegiatan harus selesai sesuai waktu booking dan ruangan ditinggalkan dalam keadaan tertib."
];

function response(statusCode, data) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    body: JSON.stringify(data)
  };
}

function validCode(value) {
  return /^LAB-[A-Z0-9-]{8,32}$/.test(value || "");
}

exports.handler = async function(event) {
  try {
    if (event.httpMethod === "GET") {
      const code = String(event.queryStringParameters?.code || "").trim().toUpperCase();
      if (!validCode(code)) return response(400, { status: "error", message: "Kode booking tidak valid" });

      const { data, error } = await supabase
        .from("lab_booking_view")
        .select("booking_code, room_name, booking_date, day_name, start_time, end_time, borrower_name, booking_category, class_name, participant_count, academic_year, academic_period, purpose, status, admin_note, rules_accepted_at")
        .eq("booking_code", code)
        .maybeSingle();
      if (error) throw error;
      if (!data) return response(404, { status: "error", message: "Booking tidak ditemukan" });

      return response(200, { status: "success", data, rules: LAB_RULES });
    }

    if (event.httpMethod === "POST") {
      const body = JSON.parse(event.body || "{}");
      const code = String(body.code || "").trim().toUpperCase();
      if (!validCode(code) || body.accepted !== true) {
        return response(400, { status: "error", message: "Persetujuan peraturan tidak valid" });
      }

      const current = await supabase
        .from("lab_bookings")
        .select("id, status")
        .eq("booking_code", code)
        .maybeSingle();
      if (current.error) throw current.error;
      if (!current.data) return response(404, { status: "error", message: "Booking tidak ditemukan" });
      if (current.data.status !== "approved") {
        return response(409, { status: "error", message: "Peraturan dapat disetujui setelah booking diterima" });
      }

      const { error } = await supabase
        .from("lab_bookings")
        .update({ rules_accepted_at: new Date().toISOString() })
        .eq("id", current.data.id);
      if (error) throw error;
      return response(200, { status: "success", message: "Persetujuan peraturan berhasil dicatat" });
    }

    return response(405, { status: "error", message: "Method tidak diizinkan" });
  } catch {
    return response(500, { status: "error", message: "Gagal memproses status booking" });
  }
};
