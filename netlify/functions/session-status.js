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
      .select('last_seen')
      .eq('device_id', deviceId)
      .maybeSingle();

    if (error) throw error;

    const lastSeen = session?.last_seen ? new Date(session.last_seen).getTime() : 0;
    const loggedIn = Boolean(lastSeen && Date.now() - lastSeen < SESSION_TIMEOUT_MS);

    return response(200, { status: "success", logged_in: loggedIn });
  } catch (error) {
    return response(500, { status: "error", message: "Gagal memeriksa sesi" });
  }
};
