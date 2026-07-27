// ================= IMPORT LIBRARY =================
const { createClient } = require('@supabase/supabase-js');

// ================= SETUP SUPABASE =================
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ================= RESPONSE HELPER =================
function response(statusCode, data) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  };
}

// ================= LOGOUT FUNCTION =================
exports.handler = async function(event) {
  if (event.httpMethod !== "POST") {
    return response(405, { status: "error", message: "Method tidak diizinkan" });
  }

  try {
    const body = JSON.parse(event.body || "{}");

    let nim = body.nim ? body.nim.toString().trim() : "";
    let nama = body.nama || "";
    const computerName = body.computer_name || "";
    const deviceId = body.device_id || "";

    // Dipakai oleh shortcut PC lab saat browser sudah telanjur ditutup.
    // Hanya hapus sesi yang memang sedang aktif pada device tersebut.
    if (!nim && body.force_device === true && deviceId) {
      const currentSession = await supabase
        .from('active_sessions')
        .select('nim, student_name, computer_name')
        .eq('device_id', deviceId)
        .maybeSingle();

      if (currentSession.error) throw currentSession.error;

      let activeSession = currentSession.data;
      if (!activeSession) {
        const legacySession = await supabase
          .from('active_sessions')
          .select('nim, student_name, computer_name')
          .eq('computer_name', deviceId)
          .maybeSingle();
        if (legacySession.error) throw legacySession.error;
        activeSession = legacySession.data;
      }

      if (!activeSession) {
        return response(200, { status: "success", message: "Tidak ada sesi aktif" });
      }

      nim = activeSession.nim;
      nama = activeSession.student_name || "";
    }

    if (!nim) {
      return response(400, {
        status: "error",
        message: "NIM tidak ditemukan"
      });
    }

    // ================= HAPUS SESSION AKTIF =================
    let deleteQuery = supabase
      .from('active_sessions')
      .delete()
      .eq('nim', nim);

    if (deviceId) {
      deleteQuery = deleteQuery.eq('device_id', deviceId);
    }

    await deleteQuery;

    // ================= UPDATE PC MASIH ONLINE / KOSONG =================
    if (deviceId) {
      await supabase
        .from('lab_computers')
        .update({
          last_seen: new Date().toISOString(),
          status: "online"
        })
        .eq('device_id', deviceId);
    }

    // ================= SIMPAN LOG LOGOUT =================
    await supabase
      .from('login_logs')
      .insert({
        nim,
        nama,
        aksi: "logout",
        computer_name: computerName,
        device_id: deviceId
      });

    return response(200, {
      status: "success",
      message: "Logout berhasil"
    });

  } catch (error) {
    return response(500, {
      status: "error",
      message: "Gagal logout"
    });
  }
};
