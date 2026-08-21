const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SESSION_TIMEOUT_MS = 30 * 60 * 1000;
const SESSION_MAX_MS = 12 * 60 * 60 * 1000;
const FREE_ACCESS_MAX_MS = 12 * 60 * 60 * 1000;

function response(statusCode, data) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    body: JSON.stringify(data)
  };
}

function isLabComputer(name) {
  return /^(SIPIL|ARSITEK)-(0[1-9]|1[0-9]|2[0-5])$/.test(name || "");
}

function isFreeAccessSession(session) {
  return /^(999999999|999999998)\d{2}$/.test(String(session?.nim || ""));
}

function sessionStartedAt(session) {
  const marker = session?.status || "";
  const value = marker.startsWith("active:")
    ? new Date(marker.slice(7)).getTime()
    : new Date(session?.last_seen || 0).getTime();
  return Number.isFinite(value) ? value : 0;
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
      .select('nim, last_seen, status')
      .eq('device_id', deviceId)
      .maybeSingle();

    if (error) throw error;

    const lastSeen = session?.last_seen ? new Date(session.last_seen).getTime() : 0;
    const sessionMaxMs = isFreeAccessSession(session) ? FREE_ACCESS_MAX_MS : SESSION_MAX_MS;
    if (session && Date.now() - sessionStartedAt(session) >= sessionMaxMs) {
      await supabase.from('active_sessions').delete().eq('device_id', deviceId);
      return response(200, { status: "success", logged_in: false });
    }
    if (!isFreeAccessSession(session) &&
        (!lastSeen || Date.now() - lastSeen >= SESSION_TIMEOUT_MS)) {
      await supabase.from('active_sessions').delete().eq('device_id', deviceId);
      return response(200, { status: "success", logged_in: false });
    }

    const now = new Date().toISOString();
    await supabase.from('active_sessions')
      .update({ last_seen: now })
      .eq('device_id', deviceId);
    await supabase.from('lab_computers')
      .update({ last_seen: now, status: "online" })
      .eq('device_id', deviceId);

    return response(200, { status: "success", logged_in: true });
  } catch (error) {
    return response(500, { status: "error", message: "Gagal memperbarui sesi" });
  }
};
