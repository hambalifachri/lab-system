const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SESSION_TIMEOUT_MS = 30 * 60 * 1000;
const SESSION_MAX_MS = 4 * 60 * 60 * 1000;
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

// Endpoint ini sengaja hanya mengembalikan boolean. AutoHotkey memakainya
// untuk mengetahui apakah PC boleh dilepas dari halaman login.
exports.handler = async function(event) {
  if (event.httpMethod !== "GET") {
    return response(405, { status: "error", message: "Method tidak diizinkan" });
  }

  const deviceId = (event.queryStringParameters?.device_id || "").trim();
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
    const expired = session && Date.now() - sessionStartedAt(session) >= sessionMaxMs;
    const inactive = session && !isFreeAccessSession(session) &&
      (!lastSeen || Date.now() - lastSeen >= SESSION_TIMEOUT_MS);
    if (expired || inactive) {
      await supabase.from('active_sessions').delete().eq('device_id', deviceId);
    }
    const loggedIn = Boolean(session && !expired && !inactive);

    return response(200, { status: "success", logged_in: loggedIn });
  } catch (error) {
    return response(500, { status: "error", message: "Gagal memeriksa sesi" });
  }
};
