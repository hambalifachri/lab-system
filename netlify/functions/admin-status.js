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
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    body: JSON.stringify(data)
  };
}

// ================= ADMIN AUTH HELPER =================
function isAdmin(event) {
  const token = event.headers['x-admin-token'];
  return token && token === process.env.ADMIN_TOKEN;
}

function roomForComputer(name) {
  if (String(name || '').startsWith('SIPIL-')) return 'Lab C.413';
  if (String(name || '').startsWith('ARSITEKTUR-')) return 'Lab C.405';
  return '-';
}

// ================= ADMIN STATUS FUNCTION =================
exports.handler = async function(event) {
  if (event.httpMethod !== "GET") {
    return response(405, {
      status: "error",
      message: "Method tidak diizinkan"
    });
  }

  if (!isAdmin(event)) {
    return response(401, {
      status: "error",
      message: "Akses admin ditolak"
    });
  }

  try {
    const { data, error } = await supabase
      .from('lab_dashboard')
      .select('*')
      .order('computer_name', { ascending: true });

    if (error) {
      return response(500, {
        status: "error",
        message: "Gagal mengambil data dashboard"
      });
    }

    return response(200, {
      status: "success",
      data: (data || []).map(row => ({
        ...row,
        room: roomForComputer(row.computer_name)
      }))
    });

  } catch (error) {
    return response(500, {
      status: "error",
      message: "Gagal mengambil status lab"
    });
  }
};
