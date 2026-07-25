// ================= IMPORT LIBRARY =================
const { createClient } = require('@supabase/supabase-js');

// ================= SETUP SUPABASE =================
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SESSION_TIMEOUT_MS = 2 * 60 * 1000;

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

// ================= LOGIN FUNCTION =================
exports.handler = async function(event) {
  if (event.httpMethod !== "POST") {
    return response(405, { status: "error", message: "Method tidak diizinkan" });
  }

  try {
    const body = JSON.parse(event.body || "{}");

    const nim = body.nim ? body.nim.toString().trim() : "";
    const computerName = (body.computer_name || "").trim();
    const deviceId = (body.device_id || "").trim();

    if (!/^[0-9]{11}$/.test(nim)) {
      return response(400, {
        status: "error",
        message: "NIM harus 11 digit angka"
      });
    }

    if (!isLabComputer(computerName) || computerName !== deviceId) {
      return response(400, {
        status: "error",
        message: "PC lab tidak valid"
      });
    }

    // ================= CEK MAHASISWA =================
    const { data: student, error: studentError } = await supabase
      .from('students')
      .select('nim, nama, aktif')
      .eq('nim', nim)
      .single();

    if (studentError || !student) {
      return response(404, {
        status: "error",
        message: "NIM tidak terdaftar"
      });
    }

    if (!student.aktif) {
      return response(403, {
        status: "error",
        message: "Akun mahasiswa tidak aktif"
      });
    }

    // ================= CEK NIM SUDAH LOGIN =================
    const { data: activeNim } = await supabase
      .from('active_sessions')
      .select('nim, computer_name, last_seen')
      .eq('nim', nim)
      .maybeSingle();

    if (activeNim && new Date(activeNim.last_seen).getTime() < Date.now() - SESSION_TIMEOUT_MS) {
      await supabase.from('active_sessions').delete().eq('nim', nim);
    } else if (activeNim) {
      return response(409, {
        status: "error",
        message: `NIM ini masih login di ${activeNim.computer_name}`
      });
    }

    // ================= CEK PC SEDANG DIPAKAI =================
    const { data: activeDevice } = await supabase
      .from('active_sessions')
      .select('nim, student_name, last_seen')
      .eq('device_id', deviceId)
      .maybeSingle();

    if (activeDevice && new Date(activeDevice.last_seen).getTime() < Date.now() - SESSION_TIMEOUT_MS) {
      await supabase.from('active_sessions').delete().eq('device_id', deviceId);
    } else if (activeDevice) {
      return response(409, {
        status: "error",
        message: `PC ini masih dipakai oleh ${activeDevice.student_name}`
      });
    }

    // ================= REGISTER / UPDATE PC =================
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

    // ================= SIMPAN SESSION AKTIF =================
    await supabase
      .from('active_sessions')
      .insert({
        nim: student.nim,
        student_name: student.nama,
        computer_name: computerName,
        device_id: deviceId,
        status: "active",
        last_seen: new Date().toISOString()
      });

    // ================= SIMPAN LOG LOGIN =================
    await supabase
      .from('login_logs')
      .insert({
        nim: student.nim,
        nama: student.nama,
        aksi: "login",
        computer_name: computerName,
        device_id: deviceId
      });

    return response(200, {
      status: "success",
      nim: student.nim,
      nama: student.nama,
      computer_name: computerName,
      device_id: deviceId
    });

  } catch (error) {
    return response(500, {
      status: "error",
      message: "Gagal login"
    });
  }
};
