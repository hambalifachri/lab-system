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

    if (!id || !Number.isInteger(participantCount) || participantCount < 1 || participantCount > 25) {
      return response(400, { status: "error", message: "Jumlah peserta harus 1-25" });
    }
    if (participantNims.length > participantCount || participantNims.some(nim => !/^\d{11}$/.test(nim))) {
      return response(400, { status: "error", message: "NIM harus 11 digit dan tidak boleh melebihi jumlah peserta" });
    }

    const { error } = await supabase
      .from("lab_bookings")
      .update({ participant_count: participantCount, participant_nims: participantNims })
      .eq("id", id);
    if (error) throw error;

    return response(200, { status: "success", message: "Daftar NIM peserta berhasil diperbarui" });
  } catch {
    return response(500, { status: "error", message: "Gagal memperbarui peserta" });
  }
};
