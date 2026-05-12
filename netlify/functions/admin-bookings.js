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

// ================= ADMIN AUTH HELPER =================
function isAdmin(event) {
  const token = event.headers['x-admin-token'];
  return token && token === process.env.ADMIN_TOKEN;
}

// ================= ADMIN BOOKINGS FUNCTION =================
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
      .from('lab_booking_view')
      .select('*')
      .order('booking_date', { ascending: false });

    if (error) {
      return response(500, {
        status: "error",
        message: "Gagal mengambil data peminjaman"
      });
    }

    return response(200, {
      status: "success",
      data: data
    });

  } catch (error) {
    return response(500, {
      status: "error",
      message: "Gagal mengambil peminjaman"
    });
  }
};
