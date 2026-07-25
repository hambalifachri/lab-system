// ================= IMPORT LIBRARY =================
const { createClient } = require('@supabase/supabase-js');

// ================= SETUP SUPABASE =================
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function isLabComputer(name) {
  return /^SIPIL-(0[1-9]|1[0-9]|2[0-5])$/.test(name || "");
}

// ================= RESPONSE HELPER =================
function response(statusCode, data) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  };
}

// ================= HEARTBEAT FUNCTION =================
exports.handler = async function(event) {
  if (event.httpMethod !== "POST") {
    return response(405, { status: "error", message: "Method tidak diizinkan" });
  }

  try {
    const body = JSON.parse(event.body || "{}");

    const nim = body.nim ? body.nim.toString().trim() : "";
    const computerName = body.computer_name || "";
    const deviceId = body.device_id || "";

    if (!deviceId) {
      return response(400, {
        status: "error",
        message: "Device ID tidak ditemukan"
      });
    }

    if (!isLabComputer(computerName) || computerName !== deviceId) {
      return response(400, {
        status: "error",
        message: "PC lab tidak valid"
      });
    }

    // ================= UPDATE PC LAST SEEN =================
    await supabase
      .from('lab_computers')
      .upsert({
        computer_name: computerName,
        device_id: deviceId,
        last_seen: new Date().toISOString(),
        status: "online"
      }, {
        onConflict: "device_id"
      });

    // ================= UPDATE SESSION LAST SEEN =================
    if (nim) {
      await supabase
        .from('active_sessions')
        .update({
          last_seen: new Date().toISOString(),
          status: "active"
        })
        .eq('nim', nim)
        .eq('device_id', deviceId);
    }

    return response(200, {
      status: "success",
      message: "Heartbeat updated"
    });

  } catch (error) {
    return response(500, {
      status: "error",
      message: "Gagal update heartbeat"
    });
  }
};
