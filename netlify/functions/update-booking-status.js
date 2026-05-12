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

// ================= UPDATE BOOKING STATUS FUNCTION =================
exports.handler = async function(event) {
  if (event.httpMethod !== "POST") {
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
    const body = JSON.parse(event.body || "{}");

    const id = body.id;
    const status = body.status;
    const adminNote = body.admin_note || "";

    if (!id || !['approved', 'rejected', 'cancelled'].includes(status)) {
      return response(400, {
        status: "error",
        message: "Data status tidak valid"
      });
    }

    const { error } = await supabase
      .from('lab_bookings')
      .update({
        status: status,
        admin_note: adminNote
      })
      .eq('id', id);

    if (error) {
      return response(500, {
        status: "error",
        message: "Gagal update status peminjaman"
      });
    }

    return response(200, {
      status: "success",
      message: "Status peminjaman berhasil diperbarui"
    });

  } catch (error) {
    return response(500, {
      status: "error",
      message: "Gagal update peminjaman"
    });
  }
};
