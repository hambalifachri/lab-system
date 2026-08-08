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
  return /^(SIPIL|ARSITEK)-(0[1-9]|1[0-9]|2[0-5])$/.test(name || "");
}

function systemNim(deviceId) {
  const prefix = deviceId.startsWith("ARSITEK-") ? "999999998" : "999999999";
  return `${prefix}${deviceId.slice(-2)}`;
}

function devicesForScope(scope) {
  const labs = scope === "ALL" ? ["SIPIL", "ARSITEK"] : [scope];
  return labs.flatMap(lab => Array.from({ length: 25 }, (_, index) =>
    `${lab}-${String(index + 1).padStart(2, "0")}`));
}

async function setDevicesMode(devices, enabled) {
  const previousResult = await supabase
    .from("active_sessions")
    .select("nim, student_name, device_id")
    .in("device_id", devices);
  if (previousResult.error) throw previousResult.error;

  const deleteResult = await supabase.from("active_sessions").delete().in("device_id", devices);
  if (deleteResult.error) throw deleteResult.error;

  if (!enabled) {
    const logoutLogs = (previousResult.data || []).map(previous => ({
        nim: previous.nim,
        nama: previous.student_name || "Akses Tanpa NIM",
        aksi: "logout-admin",
        computer_name: previous.device_id,
        device_id: previous.device_id
      }));
    if (logoutLogs.length) {
      const logResult = await supabase.from("login_logs").insert(logoutLogs);
      if (logResult.error) throw logResult.error;
    }
    return;
  }

  const now = new Date().toISOString();
  const students = devices.map(device => ({
    nim: systemNim(device), nama: `Akses Tanpa NIM ${device}`, aktif: true
  }));
  const computers = devices.map(device => ({
    computer_name: device, device_id: device, last_seen: now, status: "online"
  }));
  const sessions = devices.map(device => ({
    nim: systemNim(device),
    student_name: `Akses Tanpa NIM ${device}`,
    computer_name: device,
    device_id: device,
    status: `active:${now}`,
    last_seen: now
  }));

  const studentResult = await supabase.from("students").upsert(students, { onConflict: "nim" });
  if (studentResult.error) throw studentResult.error;

  const computerResult = await supabase.from("lab_computers").upsert(computers, { onConflict: "device_id" });
  if (computerResult.error) throw computerResult.error;

  const sessionResult = await supabase.from("active_sessions").insert(sessions);
  if (sessionResult.error) throw sessionResult.error;

  const loginLogs = sessions.map(session => ({
    nim: session.nim,
    nama: session.student_name,
    aksi: "login-admin",
    computer_name: session.device_id,
    device_id: session.device_id
  }));
  const logResult = await supabase.from("login_logs").insert(loginLogs);
  if (logResult.error) throw logResult.error;
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

    if (!["ALL", "SIPIL", "ARSITEK"].includes(deviceId) && !isLabComputer(deviceId)) {
      return response(400, { status: "error", message: "PC lab tidak valid" });
    }

    const devices = ["ALL", "SIPIL", "ARSITEK"].includes(deviceId)
      ? devicesForScope(deviceId)
      : [deviceId];
    await setDevicesMode(devices, enabled);

    const target = deviceId === "ALL"
      ? "Semua PC"
      : deviceId === "SIPIL"
        ? "Semua PC Lab C.413"
        : deviceId === "ARSITEK"
          ? "Semua PC Lab C.405"
          : deviceId;

    return response(200, {
      status: "success",
      message: enabled
        ? `${target} bebas digunakan tanpa NIM selama maksimal 2 jam`
        : `Login NIM diwajibkan kembali di ${target}`
    });
  } catch {
    return response(500, {
      status: "error",
      message: "Gagal mengubah mode akses PC"
    });
  }
};
