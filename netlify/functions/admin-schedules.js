const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const DAYS = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
const PERIOD_TYPES = ["gasal", "antara_gasal", "genap", "antara_genap"];

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
        .select("id, room_id, day_name, start_time, end_time, subject, class_name, lecturer_name, schedule_type, semester_label, period_type, period_start, period_end, status, archived_at, lab_rooms(room_name)")
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

    if (action === "import") {
      const schedules = Array.isArray(body.schedules) ? body.schedules : [];
      if (!schedules.length || schedules.length > 200) {
        return response(400, { status: "error", message: "File harus berisi 1-200 jadwal" });
      }

      const roomIds = [...new Set(schedules.map(row => Number(row.room_id || 0)))];
      const roomResult = await supabase.from("lab_rooms").select("id").in("id", roomIds);
      if (roomResult.error) throw roomResult.error;
      const validRoomIds = new Set((roomResult.data || []).map(row => Number(row.id)));
      const payloads = schedules.map((row, index) => {
        const item = {
          room_id: Number(row.room_id || 0),
          day_name: clean(row.day_name, 10),
          start_time: clean(row.start_time, 5),
          end_time: clean(row.end_time, 5),
          subject: clean(row.subject),
          class_name: clean(row.class_name),
          lecturer_name: clean(row.lecturer_name),
          schedule_type: clean(row.schedule_type || "kuliah", 30),
          semester_label: clean(row.semester_label, 80),
          period_type: clean(row.period_type, 30),
          period_start: clean(row.period_start, 10),
          period_end: clean(row.period_end, 10),
          status: "active"
        };
        const valid = validRoomIds.has(item.room_id) && DAYS.includes(item.day_name) &&
          item.start_time && item.end_time && item.start_time < item.end_time && item.subject && item.semester_label &&
          PERIOD_TYPES.includes(item.period_type) && ["kuliah", "praktikum", "ujian", "lainnya"].includes(item.schedule_type) &&
          /^\d{4}-\d{2}-\d{2}$/.test(item.period_start) && /^\d{4}-\d{2}-\d{2}$/.test(item.period_end) && item.period_start <= item.period_end;
        if (!valid) throw new Error(`Baris ${index + 2} tidak valid`);
        return item;
      });

      const existingResult = await supabase
        .from("lab_schedules")
        .select("room_id, day_name, start_time, end_time, subject, period_start, period_end")
        .in("room_id", roomIds)
        .eq("status", "active");
      if (existingResult.error) throw existingResult.error;
      const accepted = [];
      for (let index = 0; index < payloads.length; index++) {
        const item = payloads[index];
        const conflict = [...(existingResult.data || []), ...accepted].find(other =>
          Number(other.room_id) === item.room_id && other.day_name === item.day_name &&
          item.period_start <= other.period_end && item.period_end >= other.period_start &&
          overlaps(item.start_time, item.end_time, other.start_time.slice(0, 5), other.end_time.slice(0, 5))
        );
        if (conflict) {
          return response(409, { status: "error", message: `Baris ${index + 2} bentrok dengan jadwal ${conflict.subject}` });
        }
        accepted.push(item);
      }

      const insertResult = await supabase.from("lab_schedules").insert(accepted);
      if (insertResult.error) throw insertResult.error;
      return response(200, { status: "success", message: `${accepted.length} jadwal berhasil diimpor` });
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
    const periodType = clean(body.period_type, 30);
    const periodStart = clean(body.period_start, 10);
    const periodEnd = clean(body.period_end, 10);

    if (!roomId || !DAYS.includes(dayName) || !startTime || !endTime || !subject || !semesterLabel || !PERIOD_TYPES.includes(periodType)) {
      return response(400, { status: "error", message: "Data jadwal belum lengkap" });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(periodStart) || !/^\d{4}-\d{2}-\d{2}$/.test(periodEnd) || periodStart > periodEnd) {
      return response(400, { status: "error", message: "Periode tanggal jadwal tidak valid" });
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
      .select("id, start_time, end_time, subject, period_start, period_end")
      .eq("room_id", roomId)
      .eq("day_name", dayName)
      .eq("status", "active");
    if (id) conflictQuery = conflictQuery.neq("id", id);
    const conflictResult = await conflictQuery;
    if (conflictResult.error) throw conflictResult.error;

    const conflict = (conflictResult.data || []).find(item =>
      periodStart <= item.period_end && periodEnd >= item.period_start &&
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
      period_type: periodType,
      period_start: periodStart,
      period_end: periodEnd,
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
    const validationMessage = String(error?.message || "");
    return response(validationMessage.startsWith("Baris ") ? 400 : 500, {
      status: "error",
      message: validationMessage.startsWith("Baris ") ? validationMessage : "Gagal mengelola jadwal"
    });
  }
};
