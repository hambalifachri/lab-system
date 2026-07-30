const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function response(statusCode, data) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store"
    },
    body: JSON.stringify(data)
  };
}

function isLabComputer(name) {
  return /^SIPIL-(0[1-9]|1[0-9]|2[0-5])$/.test(name || "");
}

function systemNim(deviceId) {
  return `999999999${deviceId.slice(-2)}`;
}

async function setDeviceMode(deviceId, enabled) {
  const { data: previous } = await supabase
    .from("active_sessions")
    .select("nim, student_name")
    .eq("device_id", deviceId)
    .maybeSingle();

  await supabase.from("active_sessions").delete().eq("device_id", deviceId);

  if (!enabled) {
    if (previous) {
      await supabase.from("login_logs").insert({
        nim: previous.nim,
        nama: previous.student_name || "Akses Tanpa NIM",
        aksi: "logout-admin",
        computer_name: deviceId,
        device_id: deviceId
      });
    }
    return;
  }

  const nim = systemNim(deviceId);
  const nama = `Akses Tanpa NIM ${deviceId}`;
  const now = new Date().toISOString();

  const studentResult = await supabase.from("students").upsert({
    nim,
    nama,
    aktif: true
  }, { onConflict: "nim" });
  if (studentResult.error) throw studentResult.error;

  const computerResult = await supabase.from("lab_computers").upsert({
    computer_name: deviceId,
    device_id: deviceId,
    last_seen: now,
    status: "online"
  }, { onConflict: "device_id" });
  if (computerResult.error) throw computerResult.error;

  const sessionResult = await supabase.from("active_sessions").insert({
    nim,
    student_name: nama,
    computer_name: deviceId,
    device_id: deviceId,
    status: `active:${now}`,
    last_seen: now
  });
  if (sessionResult.error) throw sessionResult.error;

  await supabase.from("login_logs").insert({
    nim,
    nama,
    aksi: "login-admin",
    computer_name: deviceId,
    device_id: deviceId
  });
}

exports.handler = async function(event) {
  if (event.httpMethod !== "POST") {
    return response(405, { status: "error", message: "Method tidak diizinkan" });
  }

  if (!event.headers["x-admin-token"] ||
      event.headers["x-admin-token"] !== process.env.ADMIN_TOKEN) {
    return response(401, { status: "error", message: "Akses admin ditolak" });
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const deviceId = (body.device_id || "").trim();
    const enabled = body.enabled === true;

    if (deviceId !== "ALL" && !isLabComputer(deviceId)) {
      return response(400, { status: "error", message: "PC lab tidak valid" });
    }

    const devices = deviceId === "ALL"
      ? Array.from({ length: 25 }, (_, index) =>
          `SIPIL-${String(index + 1).padStart(2, "0")}`)
      : [deviceId];
    for (const device of devices) {
      await setDeviceMode(device, enabled);
    }

    return response(200, {
      status: "success",
      message: enabled
        ? `${deviceId === "ALL" ? "Semua PC" : deviceId} bebas digunakan tanpa NIM selama maksimal 2 jam`
        : `Login NIM diwajibkan kembali di ${deviceId === "ALL" ? "semua PC" : deviceId}`
    });
  } catch {
    return response(500, {
      status: "error",
      message: "Gagal mengubah mode akses PC"
    });
  }
};
