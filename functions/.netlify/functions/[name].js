import { createClient } from "@supabase/supabase-js";

const SESSION_TIMEOUT_MS = 30 * 60 * 1000;
const SESSION_MAX_MS = 2 * 60 * 60 * 1000;
const SCHEDULE_DAYS = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
const SCHEDULE_PERIOD_TYPES = ["gasal", "antara_gasal", "genap", "antara_genap"];
const LAB_RULES = [
  "Dilarang membawa atau mengonsumsi makanan di dalam laboratorium.",
  "Minuman hanya diperbolehkan menggunakan tumbler atau botol air mineral yang tertutup rapat dan harus dijauhkan dari komputer.",
  "Dilarang meninggalkan sampah dalam bentuk apa pun.",
  "Dilarang memindahkan perangkat, mencabut kabel, atau mengubah susunan peralatan laboratorium.",
  "Dilarang memasang atau menghapus aplikasi serta mengubah pengaturan komputer tanpa izin pengelola.",
  "Peserta wajib login menggunakan NIM masing-masing dan dilarang meminjamkan identitas.",
  "Penanggung jawab wajib mengawasi peserta selama kegiatan berlangsung.",
  "Kerusakan atau kendala wajib segera dilaporkan kepada pengelola laboratorium.",
  "Kegiatan wajib mengikuti jadwal yang disetujui dan ruangan harus ditinggalkan dalam keadaan bersih serta rapi."
];

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store"
    }
  });
}

function method(request, expected) {
  return request.method === expected;
}

function isLabComputer(name) {
  return /^(SIPIL|ARSITEK)-(0[1-9]|1[0-9]|2[0-5])$/.test(name || "");
}

function isFreeAccessSession(session) {
  return /^(999999999|999999998)\d{2}$/.test(String(session?.nim || ""));
}

function roomForComputer(name) {
  if (String(name || "").startsWith("SIPIL-")) return "Lab C.413";
  if (String(name || "").startsWith("ARSITEK-")) return "Lab C.405";
  return "-";
}

function devicesForScope(scope) {
  const labs = scope === "ALL" ? ["SIPIL", "ARSITEK"] : [scope];
  return labs.flatMap(lab => Array.from({ length: 25 }, (_, index) =>
    `${lab}-${String(index + 1).padStart(2, "0")}`));
}

function isAdmin(context) {
  const token = context.request.headers.get("x-admin-token");
  return Boolean(token && token === context.env.ADMIN_TOKEN);
}

function sessionStartedAt(session) {
  const marker = session?.status || "";
  const value = marker.startsWith("active:")
    ? new Date(marker.slice(7)).getTime()
    : new Date(session?.last_seen || 0).getTime();
  return Number.isFinite(value) ? value : 0;
}

async function readBody(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

function getIndonesianDay(dateString) {
  const days = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
  return days[new Date(`${dateString}T00:00:00`).getDay()];
}

function isOverlap(startA, endA, startB, endB) {
  return startA < endB && endA > startB;
}

function clean(value, maxLength = 120) {
  return String(value || "").trim().slice(0, maxLength);
}

function createBookingCode(bookingDate) {
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  const random = Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("").toUpperCase();
  return `LAB-${bookingDate.replaceAll("-", "")}-${random}`;
}

function getAdminWhatsappLink() {
  const rawNumber = String((globalThis.__ENV__ && globalThis.__ENV__.ADMIN_WHATSAPP_NUMBER) || (globalThis.__ENV__ && globalThis.__ENV__.ADMIN_WHATSAPP) || "081281400462").trim();
  const digits = rawNumber.replace(/\D/g, "");
  const whatsappNumber = digits.startsWith("0") ? `62${digits.slice(1)}` : digits;
  if (!digits) return "https://wa.me/6281281400462";
  return `https://wa.me/${whatsappNumber}`;
}

function validBookingCode(value) {
  return /^LAB-[A-Z0-9-]{8,32}$/.test(value || "");
}

function fixedPeriod(academicYear, periodType) {
  const years = String(academicYear || "").match(/^(\d{4})\/(\d{4})$/);
  if (!years) return null;
  const startYear = years[1], endYear = years[2];
  const ranges = {
    gasal: [`${startYear}-09-01`, `${startYear}-10-31`, "Semester Gasal"],
    antara_gasal: [`${endYear}-02-01`, `${endYear}-03-31`, "Semester Antara Gasal"],
    genap: [`${endYear}-03-01`, `${endYear}-05-31`, "Semester Genap"],
    antara_genap: [`${endYear}-08-01`, `${endYear}-09-30`, "Semester Antara Genap"]
  };
  const range = ranges[periodType];
  return range ? { start: range[0], end: range[1], label: `${academicYear} ${range[2]}` } : null;
}

async function login(context, supabase) {
  if (!method(context.request, "POST")) {
    return json(405, { status: "error", message: "Method tidak diizinkan" });
  }

  const body = await readBody(context.request);
  const nim = body.nim ? body.nim.toString().trim() : "";
  const computerName = (body.computer_name || "").trim();
  const deviceId = (body.device_id || "").trim();

  if (!/^[0-9]{11}$/.test(nim)) {
    return json(400, { status: "error", message: "NIM harus 11 digit angka" });
  }
  if (!isLabComputer(computerName) || computerName !== deviceId) {
    return json(400, { status: "error", message: "PC lab tidak valid" });
  }

  const { data: student, error: studentError } = await supabase
    .from("students")
    .select("nim, nama, aktif")
    .eq("nim", nim)
    .single();
  if (studentError || !student) {
    return json(404, { status: "error", message: "NIM tidak terdaftar" });
  }
  if (!student.aktif) {
    return json(403, { status: "error", message: "Akun mahasiswa tidak aktif" });
  }

  const { data: activeNim } = await supabase
    .from("active_sessions")
    .select("nim, computer_name, last_seen")
    .eq("nim", nim)
    .maybeSingle();
  if (activeNim && new Date(activeNim.last_seen).getTime() < Date.now() - SESSION_TIMEOUT_MS) {
    await supabase.from("active_sessions").delete().eq("nim", nim);
  } else if (activeNim) {
    return json(409, {
      status: "error",
      message: `NIM ini masih login di ${activeNim.computer_name}`
    });
  }

  const { data: activeDevice } = await supabase
    .from("active_sessions")
    .select("nim, student_name, last_seen")
    .eq("device_id", deviceId)
    .maybeSingle();
  if (activeDevice && !isFreeAccessSession(activeDevice) &&
      new Date(activeDevice.last_seen).getTime() < Date.now() - SESSION_TIMEOUT_MS) {
    await supabase.from("active_sessions").delete().eq("device_id", deviceId);
  } else if (activeDevice) {
    return json(409, {
      status: "error",
      message: `PC ini masih dipakai oleh ${activeDevice.student_name}`
    });
  }

  const now = new Date().toISOString();
  const { error: computerError } = await supabase
    .from("lab_computers")
    .upsert({
      computer_name: computerName,
      device_id: deviceId,
      last_seen: now,
      status: "online"
    }, { onConflict: "device_id" });
  if (computerError) throw computerError;

  const { error: sessionError } = await supabase
    .from("active_sessions")
    .insert({
      nim: student.nim,
      student_name: student.nama,
      computer_name: computerName,
      device_id: deviceId,
      status: `active:${now}`,
      last_seen: now
    });
  if (sessionError) throw sessionError;

  await supabase.from("login_logs").insert({
    nim: student.nim,
    nama: student.nama,
    aksi: "login",
    computer_name: computerName,
    device_id: deviceId
  });

  return json(200, {
    status: "success",
    nim: student.nim,
    nama: student.nama,
    computer_name: computerName,
    device_id: deviceId
  });
}

async function logout(context, supabase) {
  if (!method(context.request, "POST")) {
    return json(405, { status: "error", message: "Method tidak diizinkan" });
  }

  const body = await readBody(context.request);
  const nim = body.nim ? body.nim.toString().trim() : "";
  const nama = body.nama || "";
  const computerName = body.computer_name || "";
  const deviceId = body.device_id || "";

  if (!nim && body.force_device === true && deviceId) {
    const byDevice = await supabase.from("active_sessions").delete().eq("device_id", deviceId);
    const byComputer = await supabase.from("active_sessions").delete().eq("computer_name", deviceId);
    if (byDevice.error) throw byDevice.error;
    if (byComputer.error) throw byComputer.error;
    await supabase.from("lab_computers")
      .update({ last_seen: new Date().toISOString(), status: "online" })
      .eq("device_id", deviceId);
    return json(200, { status: "success", message: "Logout berhasil" });
  }

  if (!nim) {
    return json(400, { status: "error", message: "NIM tidak ditemukan" });
  }

  let query = supabase.from("active_sessions").delete().eq("nim", nim);
  if (deviceId) query = query.eq("device_id", deviceId);
  const { error: deleteError } = await query;
  if (deleteError) throw deleteError;

  if (deviceId) {
    await supabase.from("lab_computers")
      .update({ last_seen: new Date().toISOString(), status: "online" })
      .eq("device_id", deviceId);
  }
  await supabase.from("login_logs").insert({
    nim,
    nama,
    aksi: "logout",
    computer_name: computerName,
    device_id: deviceId
  });
  return json(200, { status: "success", message: "Logout berhasil" });
}

async function sessionStatus(context, supabase) {
  if (!method(context.request, "GET")) {
    return json(405, { status: "error", message: "Method tidak diizinkan" });
  }

  const deviceId = new URL(context.request.url).searchParams.get("device_id")?.trim() || "";
  if (!isLabComputer(deviceId)) {
    return json(400, { status: "error", message: "PC tidak terdaftar" });
  }

  const { data: session, error } = await supabase
    .from("active_sessions")
    .select("nim, last_seen, status")
    .eq("device_id", deviceId)
    .maybeSingle();
  if (error) throw error;

  const lastSeen = session?.last_seen ? new Date(session.last_seen).getTime() : 0;
  const expired = session && Date.now() - sessionStartedAt(session) >= SESSION_MAX_MS;
  const inactive = session && !isFreeAccessSession(session) &&
    (!lastSeen || Date.now() - lastSeen >= SESSION_TIMEOUT_MS);
  if (expired || inactive) {
    await supabase.from("active_sessions").delete().eq("device_id", deviceId);
  }
  return json(200, {
    status: "success",
    logged_in: Boolean(session && !expired && !inactive)
  });
}

async function computerHeartbeat(context, supabase) {
  if (!method(context.request, "POST")) {
    return json(405, { status: "error", message: "Method tidak diizinkan" });
  }

  const body = await readBody(context.request);
  const deviceId = (body.device_id || "").trim();
  if (!isLabComputer(deviceId)) {
    return json(400, { status: "error", message: "PC tidak terdaftar" });
  }

  const { data: session, error } = await supabase
    .from("active_sessions")
    .select("nim, last_seen, status")
    .eq("device_id", deviceId)
    .maybeSingle();
  if (error) throw error;

  const lastSeen = session?.last_seen ? new Date(session.last_seen).getTime() : 0;
  const expired = session && Date.now() - sessionStartedAt(session) >= SESSION_MAX_MS;
  const inactive = session && !isFreeAccessSession(session) &&
    (!lastSeen || Date.now() - lastSeen >= SESSION_TIMEOUT_MS);
  if (expired || inactive) {
    await supabase.from("active_sessions").delete().eq("device_id", deviceId);
    return json(200, { status: "success", logged_in: false });
  }

  const now = new Date().toISOString();
  await supabase.from("active_sessions").update({ last_seen: now }).eq("device_id", deviceId);
  await supabase.from("lab_computers")
    .update({ last_seen: now, status: "online" })
    .eq("device_id", deviceId);
  return json(200, { status: "success", logged_in: true });
}

async function heartbeat(context, supabase) {
  if (!method(context.request, "POST")) {
    return json(405, { status: "error", message: "Method tidak diizinkan" });
  }
  const body = await readBody(context.request);
  const nim = body.nim ? body.nim.toString().trim() : "";
  const computerName = body.computer_name || "";
  const deviceId = body.device_id || "";

  if (!deviceId) {
    return json(400, { status: "error", message: "Device ID tidak ditemukan" });
  }
  if (!isLabComputer(computerName) || computerName !== deviceId) {
    return json(400, { status: "error", message: "PC lab tidak valid" });
  }

  const now = new Date().toISOString();
  await supabase.from("lab_computers").upsert({
    computer_name: computerName,
    device_id: deviceId,
    last_seen: now,
    status: "online"
  }, { onConflict: "device_id" });
  if (nim) {
    await supabase.from("active_sessions")
      .update({ last_seen: now })
      .eq("nim", nim)
      .eq("device_id", deviceId);
  }
  return json(200, { status: "success", message: "Heartbeat updated" });
}

async function adminStatus(context, supabase) {
  if (!method(context.request, "GET")) {
    return json(405, { status: "error", message: "Method tidak diizinkan" });
  }
  if (!isAdmin(context)) {
    return json(401, { status: "error", message: "Akses admin ditolak" });
  }
  const { data, error } = await supabase
    .from("lab_dashboard")
    .select("*")
    .order("computer_name", { ascending: true });
  if (error) throw error;
  return json(200, {
    status: "success",
    data: (data || []).map(row => ({
      ...row,
      room: roomForComputer(row.computer_name)
    }))
  });
}

function systemNim(deviceId) {
  const prefix = deviceId.startsWith("ARSITEK-") ? "999999998" : "999999999";
  return `${prefix}${deviceId.slice(-2)}`;
}

async function setDevicesMode(supabase, devices, enabled) {
  const previousResult = await supabase
    .from("active_sessions")
    .select("nim, student_name, device_id")
    .in("device_id", devices);
  if (previousResult.error) throw previousResult.error;

  const deleteResult = await supabase
    .from("active_sessions")
    .delete()
    .in("device_id", devices);
  if (deleteResult.error) throw deleteResult.error;

  if (!enabled) {
    const logoutLogs = (previousResult.data || []).map(previous => ({
        nim: previous.nim,
        nama: previous.student_name || "Akses Tanpa NIM",
        aksi: "logout-admin",
        computer_name: previous.device_id,
        device_id: previous.device_id
      }));
    if (logoutLogs.length) {
      const logResult = await supabase.from("login_logs").insert(logoutLogs);
      if (logResult.error) throw logResult.error;
    }
    return;
  }

  const now = new Date().toISOString();
  const students = devices.map(device => ({
    nim: systemNim(device),
    nama: `Akses Tanpa NIM ${device}`,
    aktif: true
  }));
  const computers = devices.map(device => ({
    computer_name: device,
    device_id: device,
    last_seen: now,
    status: "online"
  }));
  const sessions = devices.map(device => ({
    nim: systemNim(device),
    student_name: `Akses Tanpa NIM ${device}`,
    computer_name: device,
    device_id: device,
    status: `active:${now}`,
    last_seen: now
  }));

  const studentResult = await supabase.from("students").upsert(students, { onConflict: "nim" });
  if (studentResult.error) throw studentResult.error;

  const computerResult = await supabase.from("lab_computers").upsert(computers, { onConflict: "device_id" });
  if (computerResult.error) throw computerResult.error;

  const sessionResult = await supabase.from("active_sessions").insert(sessions);
  if (sessionResult.error) throw sessionResult.error;

  const loginLogs = sessions.map(session => ({
    nim: session.nim,
    nama: session.student_name,
    aksi: "login-admin",
    computer_name: session.device_id,
    device_id: session.device_id
  }));
  const logResult = await supabase.from("login_logs").insert(loginLogs);
  if (logResult.error) throw logResult.error;
}

async function adminSession(context, supabase) {
  if (!method(context.request, "POST")) {
    return json(405, { status: "error", message: "Method tidak diizinkan" });
  }
  if (!isAdmin(context)) {
    return json(401, { status: "error", message: "Akses admin ditolak" });
  }

  const body = await readBody(context.request);
  const deviceId = (body.device_id || "").trim();
  const enabled = body.enabled === true;
  if (!["ALL", "SIPIL", "ARSITEK"].includes(deviceId) && !isLabComputer(deviceId)) {
    return json(400, { status: "error", message: "PC lab tidak valid" });
  }

  const devices = ["ALL", "SIPIL", "ARSITEK"].includes(deviceId)
    ? devicesForScope(deviceId)
    : [deviceId];
  await setDevicesMode(supabase, devices, enabled);

  const target = deviceId === "ALL"
    ? "Semua PC"
    : deviceId === "SIPIL"
      ? "Semua PC Lab C.413"
      : deviceId === "ARSITEK"
        ? "Semua PC Lab C.405"
        : deviceId;

  return json(200, {
    status: "success",
    message: enabled
      ? `${target} bebas digunakan tanpa NIM selama maksimal 2 jam`
      : `Login NIM diwajibkan kembali di ${target}`
  });
}

async function adminBookings(context, supabase) {
  if (!method(context.request, "GET")) {
    return json(405, { status: "error", message: "Method tidak diizinkan" });
  }
  if (!isAdmin(context)) {
    return json(401, { status: "error", message: "Akses admin ditolak" });
  }
  const { data, error } = await supabase
    .from("lab_booking_view")
    .select("*")
    .order("booking_date", { ascending: false });
  if (error) throw error;
  return json(200, { status: "success", data });
}

async function updateBookingParticipants(context, supabase) {
  if (!method(context.request, "POST")) {
    return json(405, { status: "error", message: "Method tidak diizinkan" });
  }
  if (!isAdmin(context)) {
    return json(401, { status: "error", message: "Akses admin ditolak" });
  }
  const body = await readBody(context.request);
  const id = Number(body.id || 0);
  const participantCount = Number(body.participant_count || 0);
  const participantNims = [...new Set((Array.isArray(body.participant_nims) ? body.participant_nims : [])
    .map(value => String(value || "").trim())
    .filter(Boolean))];
  const bookingResult = await supabase.from("lab_bookings").select("request_type, schedule_id").eq("id", id).maybeSingle();
  if (bookingResult.error || !bookingResult.data) {
    return json(404, { status: "error", message: "Booking tidak ditemukan" });
  }
  if (!id || !Number.isInteger(participantCount) || participantCount < 1 || participantCount > 25) {
    return json(400, { status: "error", message: "Jumlah peserta harus 1-25" });
  }
  if (participantNims.length > participantCount || participantNims.some(nim => !/^\d{11}$/.test(nim))) {
    return json(400, { status: "error", message: "NIM harus 11 digit dan tidak boleh melebihi jumlah peserta" });
  }
  const { error } = await supabase
    .from("lab_bookings")
    .update({ participant_count: participantCount, participant_nims: participantNims })
    .eq("id", id);
  if (error) throw error;
  if (bookingResult.data.schedule_id) {
    const scheduleUpdate = await supabase.from("lab_schedules")
      .update({ participant_count: participantCount, participant_nims: participantNims })
      .eq("id", bookingResult.data.schedule_id);
    if (scheduleUpdate.error) throw scheduleUpdate.error;
  }
  return json(200, { status: "success", message: "Daftar NIM peserta berhasil diperbarui" });
}

async function getSchedule(context, supabase) {
  if (!method(context.request, "GET")) {
    return json(405, { status: "error", message: "Method tidak diizinkan" });
  }
  const schedulesResult = await supabase.from("lab_schedule_view").select("*");
  const bookingsResult = await supabase
    .from("lab_booking_view")
    .select("id, room_name, booking_date, day_name, start_time, end_time, borrower_name, borrower_role, purpose, status, booking_category, class_name, participant_count")
    .eq("status", "approved")
    .eq("request_type", "single");
  if (schedulesResult.error || bookingsResult.error) {
    return json(500, { status: "error", message: "Gagal mengambil jadwal" });
  }
  return json(200, {
    status: "success",
    schedules: schedulesResult.data,
    bookings: bookingsResult.data
  });
}

async function getRooms(context, supabase) {
  if (!method(context.request, "GET")) {
    return json(405, { status: "error", message: "Method tidak diizinkan" });
  }
  const { data, error } = await supabase
    .from("lab_rooms")
    .select("id, room_name")
    .order("room_name");
  if (error) throw error;
  return json(200, { status: "success", data: data || [] });
}

async function adminSchedules(context, supabase) {
  if (!isAdmin(context)) {
    return json(401, { status: "error", message: "Akses admin ditolak" });
  }

  if (method(context.request, "GET")) {
    const { data, error } = await supabase
      .from("lab_schedules")
      .select("id, room_id, day_name, start_time, end_time, subject, class_name, lecturer_name, schedule_type, semester_label, period_type, period_start, period_end, participant_count, participant_nims, status, archived_at, lab_rooms(room_name)")
      .order("day_name")
      .order("start_time");
    if (error) throw error;
    return json(200, {
      status: "success",
      data: (data || []).map(row => ({ ...row, room_name: row.lab_rooms?.room_name || "-", lab_rooms: undefined }))
    });
  }

  if (!method(context.request, "POST")) {
    return json(405, { status: "error", message: "Method tidak diizinkan" });
  }

  const body = await readBody(context.request);
  const action = body.action || "save";
  const id = Number(body.id || 0);

  if (action === "archive") {
    const ids = [...new Set((Array.isArray(body.ids) ? body.ids : []).map(Number).filter(Number.isInteger))];
    const semesterLabel = clean(body.semester_label, 80);
    if (!ids.length || ids.length > 200 || !semesterLabel) {
      return json(400, { status: "error", message: "Jadwal dan nama semester wajib diisi" });
    }
    const { error } = await supabase
      .from("lab_schedules")
      .update({ status: "archived", semester_label: semesterLabel, archived_at: new Date().toISOString() })
      .in("id", ids)
      .eq("status", "active");
    if (error) throw error;
    return json(200, { status: "success", message: `${ids.length} jadwal berhasil diarsipkan` });
  }

  if (action === "import") {
    const schedules = Array.isArray(body.schedules) ? body.schedules : [];
    if (!schedules.length || schedules.length > 200) {
      return json(400, { status: "error", message: "File harus berisi 1-200 jadwal" });
    }
    const roomIds = [...new Set(schedules.map(row => Number(row.room_id || 0)))];
    const roomResult = await supabase.from("lab_rooms").select("id").in("id", roomIds);
    if (roomResult.error) throw roomResult.error;
    const validRoomIds = new Set((roomResult.data || []).map(row => Number(row.id)));
    const payloads = schedules.map((row, index) => {
      const item = {
        room_id: Number(row.room_id || 0), day_name: clean(row.day_name, 10),
        start_time: clean(row.start_time, 5), end_time: clean(row.end_time, 5),
        subject: clean(row.subject), class_name: clean(row.class_name), lecturer_name: clean(row.lecturer_name),
        schedule_type: clean(row.schedule_type || "kuliah", 30), semester_label: clean(row.semester_label, 80),
        period_type: clean(row.period_type, 30), period_start: clean(row.period_start, 10),
        period_end: clean(row.period_end, 10), status: "active"
      };
      const valid = validRoomIds.has(item.room_id) && SCHEDULE_DAYS.includes(item.day_name) &&
        item.start_time && item.end_time && item.start_time < item.end_time && item.subject && item.semester_label &&
        SCHEDULE_PERIOD_TYPES.includes(item.period_type) && ["kuliah", "praktikum", "ujian", "lainnya"].includes(item.schedule_type) &&
        /^\d{4}-\d{2}-\d{2}$/.test(item.period_start) && /^\d{4}-\d{2}-\d{2}$/.test(item.period_end) && item.period_start <= item.period_end;
      if (!valid) throw new Error(`Baris ${index + 2} tidak valid`);
      return item;
    });
    const existingResult = await supabase.from("lab_schedules")
      .select("room_id, day_name, start_time, end_time, subject, period_start, period_end")
      .in("room_id", roomIds).eq("status", "active");
    if (existingResult.error) throw existingResult.error;
    const accepted = [];
    for (let index = 0; index < payloads.length; index++) {
      const item = payloads[index];
      const conflict = [...(existingResult.data || []), ...accepted].find(other =>
        Number(other.room_id) === item.room_id && other.day_name === item.day_name &&
        item.period_start <= other.period_end && item.period_end >= other.period_start &&
        isOverlap(item.start_time, item.end_time, other.start_time.slice(0, 5), other.end_time.slice(0, 5))
      );
      if (conflict) return json(409, { status: "error", message: `Baris ${index + 2} bentrok dengan jadwal ${conflict.subject}` });
      accepted.push(item);
    }
    const insertResult = await supabase.from("lab_schedules").insert(accepted);
    if (insertResult.error) throw insertResult.error;
    return json(200, { status: "success", message: `${accepted.length} jadwal berhasil diimpor` });
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
  const participantNims = [...new Set((Array.isArray(body.participant_nims) ? body.participant_nims : [])
    .map(item => clean(item, 11)).filter(Boolean))];
  const participantCount = Number(body.participant_count ?? participantNims.length);

  if (!roomId || !SCHEDULE_DAYS.includes(dayName) || !startTime || !endTime || !subject || !semesterLabel || !SCHEDULE_PERIOD_TYPES.includes(periodType)) {
    return json(400, { status: "error", message: "Data jadwal belum lengkap" });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(periodStart) || !/^\d{4}-\d{2}-\d{2}$/.test(periodEnd) || periodStart > periodEnd) {
    return json(400, { status: "error", message: "Periode tanggal jadwal tidak valid" });
  }
  if (startTime >= endTime) {
    return json(400, { status: "error", message: "Jam selesai harus setelah jam mulai" });
  }
  if (!Number.isInteger(participantCount) || participantCount < 0 || participantCount > 200 ||
      participantNims.length !== participantCount || participantNims.some(nim => !/^\d{11}$/.test(nim))) {
    return json(400, { status: "error", message: "Daftar NIM harus unik, 11 digit, dan maksimal 200 mahasiswa" });
  }

  const roomResult = await supabase.from("lab_rooms").select("id").eq("id", roomId).maybeSingle();
  if (roomResult.error || !roomResult.data) {
    return json(400, { status: "error", message: "Ruangan tidak ditemukan" });
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
    isOverlap(startTime, endTime, item.start_time.slice(0, 5), item.end_time.slice(0, 5))
  );
  if (conflict) {
    return json(409, { status: "error", message: `Bentrok dengan jadwal ${conflict.subject}` });
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
    participant_count: participantCount,
    participant_nims: participantNims,
    status: "active"
  };
  const result = id
    ? await supabase.from("lab_schedules").update(payload).eq("id", id)
    : await supabase.from("lab_schedules").insert(payload);
  if (result.error) throw result.error;

  return json(200, {
    status: "success",
    message: id ? "Jadwal berhasil diperbarui" : "Jadwal berhasil ditambahkan"
  });
}

async function createBooking(context, supabase) {
  if (!method(context.request, "POST")) {
    return json(405, { status: "error", message: "Method tidak diizinkan" });
  }
  const body = await readBody(context.request);
  const roomId = Number(body.room_id || 0);
  const requestType = clean(body.request_type || "single", 20);
  let periodStart = clean(body.period_start, 10);
  let periodEnd = clean(body.period_end, 10);
  let semesterLabel = clean(body.semester_label, 80);
  const requestedDay = clean(body.day_name, 10);
  let bookingDate = clean(body.booking_date, 10);
  const startTime = clean(body.start_time, 5);
  const endTime = clean(body.end_time, 5);
  const borrowerName = clean(body.borrower_name, 120);
  const borrowerRole = clean(body.borrower_role, 20);
  const borrowerContact = clean(body.borrower_contact, 120);
  let purpose = clean(body.purpose, 500);
  const bookingCategory = clean(body.booking_category || "perkuliahan", 30);
  const className = clean(body.class_name, 120);
  const participantCount = Number(body.participant_count || 0);
  const academicYear = clean(body.academic_year, 9);
  const academicPeriod = clean(body.academic_period, 30);
  const rulesAccepted = body.rules_accepted === true;
  const participantNims = [...new Set(Array.isArray(body.participant_nims)
    ? body.participant_nims.map(item => clean(item, 11)).filter(Boolean)
    : [])];

  if (!["single", "fixed_schedule"].includes(requestType)) {
    return json(400, { status: "error", message: "Jenis pengajuan tidak valid" });
  }
  if (!rulesAccepted) {
    return json(400, { status: "error", message: "Peraturan laboratorium wajib dibaca dan disetujui" });
  }
  if (!roomId || !startTime || !endTime || !borrowerName || !borrowerRole || !borrowerContact ||
      (requestType === "single" && (!bookingDate || !purpose))) {
    return json(400, { status: "error", message: "Data peminjaman belum lengkap" });
  }
  if (!["Dosen", "Staff"].includes(borrowerRole)) {
    return json(400, { status: "error", message: "Peminjam hanya boleh Dosen atau Staff" });
  }
  if (requestType === "fixed_schedule" && borrowerRole !== "Dosen") {
    return json(400, { status: "error", message: "Jadwal tetap semester hanya dapat diajukan oleh dosen" });
  }
  if (!["perkuliahan", "ujian", "pelatihan", "lainnya"].includes(bookingCategory)) {
    return json(400, { status: "error", message: "Jenis kegiatan tidak valid" });
  }
  const academicYears = academicYear.match(/^(\d{4})\/(\d{4})$/);
  if (!academicYears || Number(academicYears[2]) !== Number(academicYears[1]) + 1 ||
      ![...SCHEDULE_PERIOD_TYPES, "di_luar_periode"].includes(academicPeriod) ||
      (requestType === "fixed_schedule" && !SCHEDULE_PERIOD_TYPES.includes(academicPeriod))) {
    return json(400, { status: "error", message: "Tahun akademik atau periode semester tidak valid" });
  }
  if (requestType === "fixed_schedule") {
    const period = fixedPeriod(academicYear, academicPeriod);
    if (!period) return json(400, { status: "error", message: "Periode semester tidak valid" });
    periodStart = period.start;
    periodEnd = period.end;
    semesterLabel = period.label;
    bookingDate = periodStart;
    if (!purpose) purpose = `Jadwal tetap ${className}`;
  }
  if (!className || !Number.isInteger(participantCount) || participantCount < 1 || participantCount > 25) {
    return json(400, { status: "error", message: "Kelas/prodi dan jumlah peserta 1-25 wajib diisi" });
  }
  if (participantNims.some(nim => !/^\d{11}$/.test(nim)) || participantNims.length > participantCount) {
    return json(400, { status: "error", message: "Daftar NIM tidak valid atau melebihi jumlah peserta" });
  }
  const today = new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(bookingDate) ||
      (requestType === "single" && bookingDate < today) ||
      (requestType === "fixed_schedule" && periodEnd < today)) {
    return json(400, { status: "error", message: "Tanggal peminjaman tidak boleh di masa lalu" });
  }
  if (startTime < "08:00" || endTime > "16:00" || startTime >= endTime) {
    return json(400, { status: "error", message: "Jam peminjaman harus di antara 08:00 - 16:00" });
  }

  const dayName = requestType === "fixed_schedule" ? requestedDay : getIndonesianDay(bookingDate);
  if (requestType === "fixed_schedule" &&
      (!SCHEDULE_DAYS.includes(dayName) || !semesterLabel || !/^\d{4}-\d{2}-\d{2}$/.test(periodStart) ||
       !/^\d{4}-\d{2}-\d{2}$/.test(periodEnd) || periodStart > periodEnd)) {
    return json(400, { status: "error", message: "Hari dan periode berlaku jadwal tetap tidak valid" });
  }
  if (dayName === "Minggu") {
    return json(400, { status: "error", message: "Peminjaman hanya Senin sampai Sabtu" });
  }

  const roomResult = await supabase.from("lab_rooms").select("id").eq("id", roomId).maybeSingle();
  if (roomResult.error || !roomResult.data) {
    return json(400, { status: "error", message: "Ruangan tidak ditemukan" });
  }

  let scheduleQuery = supabase
    .from("lab_schedules")
    .select("start_time, end_time, period_start, period_end")
    .eq("room_id", roomId)
    .eq("day_name", dayName)
    .eq("status", "active");
  scheduleQuery = requestType === "fixed_schedule"
    ? scheduleQuery.lte("period_start", periodEnd).gte("period_end", periodStart)
    : scheduleQuery.lte("period_start", bookingDate).gte("period_end", bookingDate);
  const { data: schedules, error: scheduleError } = await scheduleQuery;
  if (scheduleError) throw scheduleError;
  const scheduleConflict = (schedules || []).some(item =>
    isOverlap(startTime, endTime, item.start_time.slice(0, 5), item.end_time.slice(0, 5))
  );
  if (scheduleConflict) {
    return json(409, {
      status: "error",
      message: "Jadwal bentrok dengan jadwal tetap lab. Silakan hubungi admin melalui WhatsApp untuk pengajuan lain.",
      wa_admin_link: getAdminWhatsappLink()
    });
  }

  const baseFields = "start_time, end_time, request_type, booking_date, period_start, period_end";
  const bookingQueries = requestType === "fixed_schedule" ? [
    supabase.from("lab_bookings").select(baseFields).eq("room_id", roomId).eq("day_name", dayName)
      .eq("request_type", "single").gte("booking_date", periodStart).lte("booking_date", periodEnd).in("status", ["pending", "approved"]),
    supabase.from("lab_bookings").select(baseFields).eq("room_id", roomId).eq("day_name", dayName)
      .eq("request_type", "fixed_schedule").lte("period_start", periodEnd).gte("period_end", periodStart).in("status", ["pending", "approved"])
  ] : [
    supabase.from("lab_bookings").select(baseFields).eq("room_id", roomId).eq("booking_date", bookingDate)
      .eq("request_type", "single").in("status", ["pending", "approved"]),
    supabase.from("lab_bookings").select(baseFields).eq("room_id", roomId).eq("day_name", dayName)
      .eq("request_type", "fixed_schedule").lte("period_start", bookingDate).gte("period_end", bookingDate).in("status", ["pending", "approved"])
  ];
  const bookingResults = await Promise.all(bookingQueries);
  const bookingError = bookingResults.find(result => result.error)?.error;
  if (bookingError) throw bookingError;
  const bookings = bookingResults.flatMap(result => result.data || []);
  const bookingConflict = bookings.some(item =>
    isOverlap(startTime, endTime, item.start_time.slice(0, 5), item.end_time.slice(0, 5))
  );
  if (bookingConflict) {
    return json(409, {
      status: "error",
      message: "Jam tersebut sudah diajukan atau sudah dipinjam. Silakan hubungi admin melalui WhatsApp untuk pengecekan lanjutan.",
      wa_admin_link: getAdminWhatsappLink()
    });
  }

  const bookingCode = createBookingCode(bookingDate);
  const { data: insertedBooking, error } = await supabase.from("lab_bookings").insert({
    room_id: roomId,
    booking_date: bookingDate,
    day_name: dayName,
    start_time: startTime,
    end_time: endTime,
    borrower_name: borrowerName,
    borrower_role: borrowerRole,
    borrower_contact: borrowerContact,
    purpose,
    booking_code: bookingCode,
    booking_category: bookingCategory,
    class_name: className,
    participant_count: participantCount,
    participant_nims: participantNims,
    academic_year: academicYear,
    academic_period: academicPeriod,
    request_type: requestType,
    semester_label: requestType === "fixed_schedule" ? semesterLabel : null,
    period_start: requestType === "fixed_schedule" ? periodStart : null,
    period_end: requestType === "fixed_schedule" ? periodEnd : null,
    rules_accepted_at: new Date().toISOString(),
    status: "approved"
  }).select("id").single();
  if (error) throw error;

  if (requestType === "fixed_schedule") {
    const { data: scheduleInsert, error: scheduleError } = await supabase.from("lab_schedules").insert({
      room_id: roomId,
      day_name: dayName,
      start_time: startTime,
      end_time: endTime,
      subject: purpose || `Jadwal tetap ${className}`,
      class_name: className,
      lecturer_name: borrowerName,
      schedule_type: bookingCategory === "ujian" ? "ujian" : bookingCategory === "perkuliahan" ? "kuliah" : "lainnya",
      status: "active",
      semester_label: semesterLabel,
      period_type: academicPeriod,
      period_start: periodStart,
      period_end: periodEnd,
      participant_count: participantCount,
      participant_nims: participantNims,
      archived_at: null
    }).select("id").single();
    if (scheduleError) {
      await supabase.from("lab_bookings").delete().eq("id", insertedBooking.id);
      return json(500, { status: "error", message: "Gagal menyiapkan jadwal tetap di kalender lab" });
    }
    await supabase.from("lab_bookings").update({ schedule_id: scheduleInsert.id }).eq("id", insertedBooking.id);
  }

  return json(200, {
    status: "success",
    message: requestType === "fixed_schedule"
      ? "Pengajuan jadwal tetap otomatis disetujui dan sudah aktif di kalender lab"
      : "Pengajuan otomatis disetujui dan sudah aktif untuk penggunaan lab",
    booking_code: bookingCode
  });
}

async function bookingStatus(context, supabase) {
  if (method(context.request, "GET")) {
    const code = new URL(context.request.url).searchParams.get("code")?.trim().toUpperCase() || "";
    if (!validBookingCode(code)) {
      return json(400, { status: "error", message: "Kode booking tidak valid" });
    }
    const { data, error } = await supabase
      .from("lab_booking_view")
      .select("booking_code, room_name, booking_date, day_name, start_time, end_time, borrower_name, booking_category, class_name, participant_count, academic_year, academic_period, purpose, status, admin_note, rules_accepted_at, request_type, semester_label, period_start, period_end")
      .eq("booking_code", code)
      .maybeSingle();
    if (error) throw error;
    if (!data) return json(404, { status: "error", message: "Booking tidak ditemukan" });
    return json(200, { status: "success", data, rules: LAB_RULES });
  }

  if (method(context.request, "POST")) {
    const body = await readBody(context.request);
    const code = clean(body.code, 40).toUpperCase();
    if (!validBookingCode(code) || body.accepted !== true) {
      return json(400, { status: "error", message: "Persetujuan peraturan tidak valid" });
    }
    const current = await supabase
      .from("lab_bookings")
      .select("id, status")
      .eq("booking_code", code)
      .maybeSingle();
    if (current.error) throw current.error;
    if (!current.data) return json(404, { status: "error", message: "Booking tidak ditemukan" });
    if (current.data.status !== "approved") {
      return json(409, { status: "error", message: "Peraturan dapat disetujui setelah booking diterima" });
    }
    const { error } = await supabase
      .from("lab_bookings")
      .update({ rules_accepted_at: new Date().toISOString() })
      .eq("id", current.data.id);
    if (error) throw error;
    return json(200, { status: "success", message: "Persetujuan peraturan berhasil dicatat" });
  }

  return json(405, { status: "error", message: "Method tidak diizinkan" });
}

async function updateBookingStatus(context, supabase) {
  if (!method(context.request, "POST")) {
    return json(405, { status: "error", message: "Method tidak diizinkan" });
  }
  if (!isAdmin(context)) {
    return json(401, { status: "error", message: "Akses admin ditolak" });
  }
  const body = await readBody(context.request);
  const id = Number(body.id || 0);
  const status = body.status;
  const adminNote = clean(body.admin_note, 500);
  if (!id || !["approved", "rejected", "cancelled"].includes(status)) {
    return json(400, { status: "error", message: "Data status tidak valid" });
  }

  const bookingResult = await supabase.from("lab_bookings")
    .select("id, room_id, booking_date, day_name, start_time, end_time, borrower_name, purpose, booking_category, class_name, participant_count, participant_nims, academic_period, request_type, semester_label, period_start, period_end, schedule_id, status")
    .eq("id", id).maybeSingle();
  if (bookingResult.error || !bookingResult.data) {
    return json(404, { status: "error", message: "Booking tidak ditemukan" });
  }
  const booking = bookingResult.data;

  if (status === "approved") {
    if (booking.status === "approved") {
      return json(200, { status: "success", message: "Pengajuan sudah disetujui" });
    }

    const fixed = booking.request_type === "fixed_schedule";
    let scheduleQuery = supabase.from("lab_schedules").select("start_time, end_time, subject")
      .eq("room_id", booking.room_id).eq("day_name", booking.day_name).eq("status", "active");
    scheduleQuery = fixed
      ? scheduleQuery.lte("period_start", booking.period_end).gte("period_end", booking.period_start)
      : scheduleQuery.lte("period_start", booking.booking_date).gte("period_end", booking.booking_date);
    const bookingQueries = fixed ? [
      supabase.from("lab_bookings").select("start_time, end_time, purpose").eq("room_id", booking.room_id)
        .eq("day_name", booking.day_name).eq("request_type", "single").eq("status", "approved")
        .gte("booking_date", booking.period_start).lte("booking_date", booking.period_end).neq("id", id),
      supabase.from("lab_bookings").select("start_time, end_time, purpose").eq("room_id", booking.room_id)
        .eq("day_name", booking.day_name).eq("request_type", "fixed_schedule").eq("status", "approved")
        .lte("period_start", booking.period_end).gte("period_end", booking.period_start).neq("id", id)
    ] : [
      supabase.from("lab_bookings").select("start_time, end_time, purpose").eq("room_id", booking.room_id)
        .eq("booking_date", booking.booking_date).eq("request_type", "single").eq("status", "approved").neq("id", id),
      supabase.from("lab_bookings").select("start_time, end_time, purpose").eq("room_id", booking.room_id)
        .eq("day_name", booking.day_name).eq("request_type", "fixed_schedule").eq("status", "approved")
        .lte("period_start", booking.booking_date).gte("period_end", booking.booking_date).neq("id", id)
    ];
    const [scheduleResult, ...bookingResults] = await Promise.all([scheduleQuery, ...bookingQueries]);
    const queryError = scheduleResult.error || bookingResults.find(result => result.error)?.error;
    if (queryError) throw queryError;
    const conflict = [...(scheduleResult.data || []), ...bookingResults.flatMap(result => result.data || [])]
      .find(item => isOverlap(booking.start_time.slice(0, 5), booking.end_time.slice(0, 5), item.start_time.slice(0, 5), item.end_time.slice(0, 5)));
    if (conflict) {
      return json(409, { status: "error", message: `Pengajuan bentrok dengan ${conflict.subject || conflict.purpose || "jadwal lain"}` });
    }

    let scheduleId = booking.schedule_id;
    if (fixed && !scheduleId) {
      const scheduleType = booking.booking_category === "ujian" ? "ujian" : booking.booking_category === "perkuliahan" ? "kuliah" : "lainnya";
      const insertResult = await supabase.from("lab_schedules").insert({
        room_id: booking.room_id, day_name: booking.day_name, start_time: booking.start_time,
        end_time: booking.end_time, subject: booking.purpose, class_name: booking.class_name,
        lecturer_name: booking.borrower_name, schedule_type: scheduleType,
        semester_label: booking.semester_label, period_type: booking.academic_period,
        period_start: booking.period_start, period_end: booking.period_end,
        participant_count: booking.participant_count, participant_nims: booking.participant_nims || [], status: "active"
      }).select("id").single();
      if (insertResult.error) throw insertResult.error;
      scheduleId = insertResult.data.id;
    }

    const updateResult = await supabase.from("lab_bookings")
      .update({ status: "approved", admin_note: adminNote, schedule_id: scheduleId || null })
      .eq("id", id);
    if (updateResult.error) {
      if (fixed && scheduleId && !booking.schedule_id) await supabase.from("lab_schedules").delete().eq("id", scheduleId);
      throw updateResult.error;
    }
    return json(200, {
      status: "success",
      message: fixed ? "Jadwal tetap disetujui dan sudah masuk kalender lab" : "Booking berhasil disetujui"
    });
  }

  if (status === "cancelled" && booking.schedule_id) {
    const archiveResult = await supabase.from("lab_schedules")
      .update({ status: "archived", archived_at: new Date().toISOString() })
      .eq("id", booking.schedule_id);
    if (archiveResult.error) throw archiveResult.error;
  }
  const { error } = await supabase
    .from("lab_bookings")
    .update({ status, admin_note: adminNote })
    .eq("id", id);
  if (error) throw error;
  return json(200, {
    status: "success",
    message: "Status pengajuan berhasil diperbarui"
  });
}

async function getScheduleDebug(context, supabase) {
  if (!method(context.request, "GET")) {
    return json(405, { status: "error", message: "Method tidak diizinkan" });
  }

  try {
    const { data: allSchedules, error: allError } = await supabase
      .from("lab_schedules")
      .select("id, room_id, day_name, start_time, end_time, subject, class_name, lecturer_name, status, semester_label, period_type, period_start, period_end, archived_at, created_at")
      .order("created_at", { ascending: false });

    if (allError) throw allError;

    const { data: viewSchedules, error: viewError } = await supabase
      .from("lab_schedule_view")
      .select("*")
      .order("period_start", { ascending: false });

    if (viewError) throw viewError;

    const { data: bookings, error: bookingError } = await supabase
      .from("lab_bookings")
      .select("id, booking_date, day_name, start_time, end_time, purpose, borrower_name, status, request_type, semester_label, period_start, period_end")
      .eq("status", "approved")
      .eq("request_type", "single")
      .order("booking_date", { ascending: false });

    if (bookingError) throw bookingError;

    const { data: rooms, error: roomError } = await supabase
      .from("lab_rooms")
      .select("id, room_name");

    if (roomError) throw roomError;

    const analysisIssues = [];
    const allActive = allSchedules.filter(s => s.status === "active");
    
    allActive.forEach(sched => {
      const issues = [];
      if (!sched.period_start) issues.push("period_start is NULL");
      if (!sched.period_end) issues.push("period_end is NULL");
      if (sched.period_start && sched.period_end && new Date(sched.period_end) < new Date(sched.period_start)) {
        issues.push("period_end < period_start");
      }
      const room = rooms.find(r => r.id === sched.room_id);
      if (!room) issues.push(`room_id ${sched.room_id} not found`);
      if (issues.length > 0) {
        analysisIssues.push({
          id: sched.id,
          subject: sched.subject,
          issues
        });
      }
    });

    const statusCounts = {
      active: allSchedules.filter(s => s.status === "active").length,
      archived: allSchedules.filter(s => s.status === "archived").length,
      pending: allSchedules.filter(s => s.status === "pending").length,
      inactive: allSchedules.filter(s => s.status === "inactive").length
    };

    return json(200, {
      status: "success",
      summary: {
        total_schedules: allSchedules.length,
        status_breakdown: statusCounts,
        schedules_in_view: viewSchedules.length,
        approved_bookings: bookings.length,
        rooms_total: rooms.length,
        current_date: new Date().toISOString().split("T")[0],
        diagnosis: {
          data_exists: allSchedules.length > 0,
          active_schedules_exist: allActive.length > 0,
          view_shows_nothing: viewSchedules.length === 0,
          possible_issue: allActive.length > 0 && viewSchedules.length === 0 
            ? "Data exists but filtered out by view conditions" 
            : allActive.length === 0 
            ? "No active schedules in database at all" 
            : "Data properly displayed in view"
        }
      },
      filter_issues: analysisIssues,
      sample_raw_schedules: allSchedules.slice(0, 10),
      view_schedules: viewSchedules.slice(0, 10),
      rooms_available: rooms,
      sample_bookings: bookings.slice(0, 5)
    });

  } catch (error) {
    return json(500, {
      status: "error",
      message: error.message
    });
  }
}

const handlers = {
  "login": login,
  "logout": logout,
  "session-status": sessionStatus,
  "computer-heartbeat": computerHeartbeat,
  "heartbeat": heartbeat,
  "admin-status": adminStatus,
  "admin-session": adminSession,
  "admin-bookings": adminBookings,
  "update-booking-participants": updateBookingParticipants,
  "admin-schedules": adminSchedules,
  "get-schedule": getSchedule,
  "debug-schedule": getScheduleDebug,
  "get-rooms": getRooms,
  "create-booking": createBooking,
  "booking-status": bookingStatus,
  "update-booking-status": updateBookingStatus
};

export async function onRequest(context) {
  const handler = handlers[context.params.name];
  if (!handler) {
    return json(404, { status: "error", message: "Endpoint tidak ditemukan" });
  }
  if (!context.env.SUPABASE_URL || !context.env.SUPABASE_SERVICE_ROLE_KEY) {
    return json(500, { status: "error", message: "Konfigurasi server belum lengkap" });
  }

  const supabase = createClient(
    context.env.SUPABASE_URL,
    context.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  try {
    return await handler(context, supabase);
  } catch (error) {
    const validationMessage = String(error?.message || "");
    if (validationMessage.startsWith("Baris ")) {
      return json(400, { status: "error", message: validationMessage });
    }
    return json(500, { status: "error", message: "Terjadi kesalahan pada server" });
  }
}
