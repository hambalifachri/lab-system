const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const DAYS = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];

function response(statusCode, data) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    body: JSON.stringify(data)
  };
}

function isAdmin(event) {
  return Boolean(event.headers["x-admin-token"] &&
    event.headers["x-admin-token"] === process.env.ADMIN_TOKEN);
}

function clean(value, maxLength = 120) {
  return String(value || "").trim().slice(0, maxLength);
}

function overlaps(startA, endA, startB, endB) {
  return startA < endB && endA > startB;
}

exports.handler = async function(event) {
  if (!isAdmin(event)) {
    return response(401, { status: "error", message: "Akses admin ditolak" });
  }

  try {
    if (event.httpMethod === "GET") {
      const { data, error } = await supabase
        .from("lab_schedules")
        .select("id, room_id, day_name, start_time, end_time, subject, class_name, lecturer_name, schedule_type, semester_label, status, archived_at, lab_rooms(room_name)")
        .order("day_name")
        .order("start_time");
      if (error) throw error;
      return response(200, {
        status: "success",
        data: (data || []).map(row => ({ ...row, room_name: row.lab_rooms?.room_name || "-", lab_rooms: undefined }))
      });
    }

    if (event.httpMethod !== "POST") {
      return response(405, { status: "error", message: "Method tidak diizinkan" });
    }

    const body = JSON.parse(event.body || "{}");
    const action = body.action || "save";
    const id = Number(body.id || 0);

    if (action === "archive") {
      const ids = [...new Set((Array.isArray(body.ids) ? body.ids : []).map(Number).filter(Number.isInteger))];
      const semesterLabel = clean(body.semester_label, 80);
      if (!ids.length || ids.length > 200 || !semesterLabel) {
        return response(400, { status: "error", message: "Jadwal dan nama semester wajib diisi" });
      }
      const { error } = await supabase
        .from("lab_schedules")
        .update({ status: "archived", semester_label: semesterLabel, archived_at: new Date().toISOString() })
        .in("id", ids)
        .eq("status", "active");
      if (error) throw error;
      return response(200, { status: "success", message: `${ids.length} jadwal berhasil diarsipkan` });
    }

    const roomId = Number(body.room_id || 0);
    const dayName = clean(body.day_name, 10);
    const startTime = clean(body.start_time, 5);
    const endTime = clean(body.end_time, 5);
    const subject = clean(body.subject);
    const className = clean(body.class_name);
    const lecturerName = clean(body.lecturer_name);
    const scheduleType = clean(body.schedule_type || "kuliah", 30);
    const semesterLabel = clean(body.semester_label || "Belum ditentukan", 80);

    if (!roomId || !DAYS.includes(dayName) || !startTime || !endTime || !subject) {
      return response(400, { status: "error", message: "Data jadwal belum lengkap" });
    }
    if (startTime >= endTime) {
      return response(400, { status: "error", message: "Jam selesai harus setelah jam mulai" });
    }

    const roomResult = await supabase.from("lab_rooms").select("id").eq("id", roomId).maybeSingle();
    if (roomResult.error || !roomResult.data) {
      return response(400, { status: "error", message: "Ruangan tidak ditemukan" });
    }

    let conflictQuery = supabase
      .from("lab_schedules")
      .select("id, start_time, end_time, subject")
      .eq("room_id", roomId)
      .eq("day_name", dayName)
      .eq("status", "active");
    if (id) conflictQuery = conflictQuery.neq("id", id);
    const conflictResult = await conflictQuery;
    if (conflictResult.error) throw conflictResult.error;

    const conflict = (conflictResult.data || []).find(item =>
      overlaps(startTime, endTime, item.start_time.slice(0, 5), item.end_time.slice(0, 5))
    );
    if (conflict) {
      return response(409, {
        status: "error",
        message: `Bentrok dengan jadwal ${conflict.subject}`
      });
    }

    const payload = {
      room_id: roomId,
      day_name: dayName,
      start_time: startTime,
      end_time: endTime,
      subject,
      class_name: className,
      lecturer_name: lecturerName,
      schedule_type: scheduleType,
      semester_label: semesterLabel,
      status: "active"
    };

    const result = id
      ? await supabase.from("lab_schedules").update(payload).eq("id", id)
      : await supabase.from("lab_schedules").insert(payload);
    if (result.error) throw result.error;

    return response(200, {
      status: "success",
      message: id ? "Jadwal berhasil diperbarui" : "Jadwal berhasil ditambahkan"
    });
  } catch (error) {
    return response(500, { status: "error", message: "Gagal mengelola jadwal" });
  }
};
