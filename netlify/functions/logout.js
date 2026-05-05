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
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(data)
  };
}

// ================= LOGOUT FUNCTION =================
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
    const nama = body.nama;

    if (!nim || nim.toString().trim() === "") {
      return response(400, {
        status: "error",
        message: "NIM tidak ditemukan"
      });
    }

    await supabase
      .from('login_logs')
      .insert({
        nim: nim.toString().trim(),
        nama: nama || "",
        aksi: "logout"
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
