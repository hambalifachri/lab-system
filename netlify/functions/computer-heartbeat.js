const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SESSION_TIMEOUT_MS = 2 * 60 * 1000;

function response(statusCode, data) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    body: JSON.stringify(data)
  };
}

function isLabComputer(name) {
  return /^SIPIL-(0[1-9]|1[0-9]|2[0-5])$/.test(name || "");
}

// Dipanggil oleh AutoHotkey, bukan browser. Endpoint hanya memperpanjang sesi
// yang sudah aktif dan belum kedaluwarsa; ia tidak dapat membuat sesi baru.
exports.handler = async function(event) {
  if (event.httpMethod !== "POST") {
    return response(405, { status: "error", message: "Method tidak diizinkan" });
  }

  const body = JSON.parse(event.body || "{}");
  const deviceId = (body.device_id || "").trim();
  if (!isLabComputer(deviceId)) {
    return response(400, { status: "error", message: "PC tidak terdaftar" });
  }

  try {
    const { data: session, error } = await supabase
      .from('active_sessions')
      .select('last_seen')
      .eq('device_id', deviceId)
      .maybeSingle();

    if (error) throw error;

    const lastSeen = session?.last_seen ? new Date(session.last_seen).getTime() : 0;
    if (!lastSeen || Date.now() - lastSeen >= SESSION_TIMEOUT_MS) {
      return response(200, { status: "success", logged_in: false });
    }

    const now = new Date().toISOString();
    await supabase.from('active_sessions')
      .update({ last_seen: now, status: "active" })
      .eq('device_id', deviceId);
    await supabase.from('lab_computers')
      .update({ last_seen: now, status: "online" })
      .eq('device_id', deviceId);

    return response(200, { status: "success", logged_in: true });
  } catch (error) {
    return response(500, { status: "error", message: "Gagal memperbarui sesi" });
  }
};
