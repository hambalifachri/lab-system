const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

exports.handler = async function(event) {
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, body: JSON.stringify({ status: "error", message: "Method tidak diizinkan" }) };
  }

  try {
    const { data, error } = await supabase.from("lab_rooms").select("id, room_name").order("room_name");
    if (error) throw error;
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=300" },
      body: JSON.stringify({ status: "success", data: data || [] })
    };
  } catch {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "error", message: "Gagal mengambil daftar ruangan" })
    };
  }
};
