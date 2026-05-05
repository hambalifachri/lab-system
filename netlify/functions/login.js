// ================= IMPORT LIBRARY =================
const { createClient } = require('@supabase/supabase-js');

// ================= SETUP SUPABASE =================
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// ================= RESPONSE HELPER =================
function response(statusCode, data) {
  return {
    statusCode: statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  };
}

// ================= LOGIN FUNCTION =================
exports.handler = async function(event) {
  if (event.httpMethod !== "POST") {
    return response(405, {
      status: "error",
      message: "Method tidak diizinkan"
    });
  }

  if (!supabaseUrl || !supabaseKey) {
    return response(500, {
      status: "error",
      message: "Environment Supabase belum diisi"
    });
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const nim = body.nim;

    if (!nim || nim.toString().trim() === "") {
      return response(400, {
        status: "error",
        message: "NIM wajib diisi"
      });
    }

    const inputNim = nim.toString().trim();

    // ================= CEK NIM DI DATABASE =================
    const { data: student, error: studentError } = await supabase
      .from('students')
      .select('nim, nama, aktif')
      .eq('nim', inputNim)
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

    // ================= CEK APAKAH SUDAH LOGIN =================
    const { data: activeSession } = await supabase
      .from('active_sessions')
      .select('nim')
      .eq('nim', inputNim)
      .maybeSingle();

    if (activeSession) {
      return response(409, {
        status: "error",
        message: "NIM ini sedang digunakan / masih login di perangkat lain"
      });
    }

    // ================= SIMPAN SESSION AKTIF =================
    const { error: sessionError } = await supabase
      .from('active_sessions')
      .insert({
        nim: student.nim,
        nama: student.nama
      });

    if (sessionError) {
      return response(409, {
        status: "error",
        message: "NIM ini sedang digunakan / masih login di perangkat lain"
      });
    }

    // ================= SIMPAN LOG LOGIN =================
    await supabase
      .from('login_logs')
      .insert({
        nim: student.nim,
        nama: student.nama,
        aksi: "login"
      });

    return response(200, {
      status: "success",
      nim: student.nim,
      nama: student.nama
    });

  } catch (error) {
    return response(500, {
      status: "error",
      message: "Gagal login"
    });
  }
};
