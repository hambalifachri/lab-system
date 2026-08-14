const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function response(statusCode, data) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    body: JSON.stringify(data)
  };
}

function isAdmin(event) {
  return Boolean(event.headers["x-admin-token"] && event.headers["x-admin-token"] === process.env.ADMIN_TOKEN);
}

exports.handler = async function(event) {
  if (event.httpMethod !== "POST") return response(405, { status: "error", message: "Method tidak diizinkan" });
  if (!isAdmin(event)) return response(401, { status: "error", message: "Akses admin ditolak" });

  try {
    const body = JSON.parse(event.body || "{}");
    const id = Number(body.id || 0);
    const participantCount = Number(body.participant_count || 0);
    const participantNims = [...new Set((Array.isArray(body.participant_nims) ? body.participant_nims : [])
      .map(value => String(value || "").trim())
      .filter(Boolean))];

    const bookingResult = await supabase.from("lab_bookings").select("request_type, schedule_id").eq("id", id).maybeSingle();
    if (bookingResult.error || !bookingResult.data) return response(404, { status: "error", message: "Booking tidak ditemukan" });
    const maxParticipants = bookingResult.data.request_type === "fixed_schedule" ? 200 : 25;
    if (!id || !Number.isInteger(participantCount) || participantCount < 1 || participantCount > maxParticipants) {
      return response(400, { status: "error", message: `Jumlah peserta harus 1-${maxParticipants}` });
    }
    if (participantNims.length > participantCount || participantNims.some(nim => !/^\d{11}$/.test(nim))) {
      return response(400, { status: "error", message: "NIM harus 11 digit dan tidak boleh melebihi jumlah peserta" });
    }

    const { error } = await supabase
      .from("lab_bookings")
      .update({ participant_count: participantCount, participant_nims: participantNims })
      .eq("id", id);
    if (error) throw error;

    if (bookingResult.data.schedule_id) {
      const scheduleUpdate = await supabase.from("lab_schedules")
        .update({ participant_count: participantCount, participant_nims: participantNims })
        .eq("id", bookingResult.data.schedule_id);
      if (scheduleUpdate.error) throw scheduleUpdate.error;
    }

    return response(200, { status: "success", message: "Daftar NIM peserta berhasil diperbarui" });
  } catch {
    return response(500, { status: "error", message: "Gagal memperbarui peserta" });
  }
};
