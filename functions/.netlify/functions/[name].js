import { createClient } from "@supabase/supabase-js";

const SESSION_TIMEOUT_MS = 30 * 60 * 1000;
const SESSION_MAX_MS = 2 * 60 * 60 * 1000;

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
  return /^SIPIL-(0[1-9]|1[0-9]|2[0-5])$/.test(name || "");
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
  if (activeDevice && new Date(activeDevice.last_seen).getTime() < Date.now() - SESSION_TIMEOUT_MS) {
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
    .select("last_seen, status")
    .eq("device_id", deviceId)
    .maybeSingle();
  if (error) throw error;

  const lastSeen = session?.last_seen ? new Date(session.last_seen).getTime() : 0;
  const expired = session && Date.now() - sessionStartedAt(session) >= SESSION_MAX_MS;
  const inactive = session && (!lastSeen || Date.now() - lastSeen >= SESSION_TIMEOUT_MS);
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
    .select("last_seen, status")
    .eq("device_id", deviceId)
    .maybeSingle();
  if (error) throw error;

  const lastSeen = session?.last_seen ? new Date(session.last_seen).getTime() : 0;
  const expired = session && Date.now() - sessionStartedAt(session) >= SESSION_MAX_MS;
  const inactive = session && (!lastSeen || Date.now() - lastSeen >= SESSION_TIMEOUT_MS);
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
  return json(200, { status: "success", data });
}

function systemNim(deviceId) {
  return `999999999${deviceId.slice(-2)}`;
}

async function setDeviceMode(supabase, deviceId, enabled) {
  const { data: previous } = await supabase
    .from("active_sessions")
    .select("nim, student_name")
    .eq("device_id", deviceId)
    .maybeSingle();

  await supabase.from("active_sessions").delete().eq("device_id", deviceId);

  if (!enabled) {
    if (previous) {
      await supabase.from("login_logs").insert({
        nim: previous.nim,
        nama: previous.student_name || "Akses Tanpa NIM",
        aksi: "logout-admin",
        computer_name: deviceId,
        device_id: deviceId
      });
    }
    return;
  }

  const nim = systemNim(deviceId);
  const nama = `Akses Tanpa NIM ${deviceId}`;
  const now = new Date().toISOString();

  const studentResult = await supabase.from("students").upsert({
    nim,
    nama,
    aktif: true
  }, { onConflict: "nim" });
  if (studentResult.error) throw studentResult.error;

  const computerResult = await supabase.from("lab_computers").upsert({
    computer_name: deviceId,
    device_id: deviceId,
    last_seen: now,
    status: "online"
  }, { onConflict: "device_id" });
  if (computerResult.error) throw computerResult.error;

  const sessionResult = await supabase.from("active_sessions").insert({
    nim,
    student_name: nama,
    computer_name: deviceId,
    device_id: deviceId,
    status: `active:${now}`,
    last_seen: now
  });
  if (sessionResult.error) throw sessionResult.error;

  await supabase.from("login_logs").insert({
    nim,
    nama,
    aksi: "login-admin",
    computer_name: deviceId,
    device_id: deviceId
  });
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
  if (deviceId !== "ALL" && !isLabComputer(deviceId)) {
    return json(400, { status: "error", message: "PC lab tidak valid" });
  }

  const devices = deviceId === "ALL"
    ? Array.from({ length: 25 }, (_, index) =>
        `SIPIL-${String(index + 1).padStart(2, "0")}`)
    : [deviceId];
  for (const device of devices) {
    await setDeviceMode(supabase, device, enabled);
  }

  return json(200, {
    status: "success",
    message: enabled
      ? `${deviceId === "ALL" ? "Semua PC" : deviceId} bebas digunakan tanpa NIM selama maksimal 2 jam`
      : `Login NIM diwajibkan kembali di ${deviceId === "ALL" ? "semua PC" : deviceId}`
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

async function getSchedule(context, supabase) {
  if (!method(context.request, "GET")) {
    return json(405, { status: "error", message: "Method tidak diizinkan" });
  }
  const schedulesResult = await supabase.from("lab_schedule_view").select("*");
  const bookingsResult = await supabase
    .from("lab_booking_view")
    .select("*")
    .eq("status", "approved");
  if (schedulesResult.error || bookingsResult.error) {
    return json(500, { status: "error", message: "Gagal mengambil jadwal" });
  }
  return json(200, {
    status: "success",
    schedules: schedulesResult.data,
    bookings: bookingsResult.data
  });
}

async function createBooking(context, supabase) {
  if (!method(context.request, "POST")) {
    return json(405, { status: "error", message: "Method tidak diizinkan" });
  }
  const body = await readBody(context.request);
  const roomId = body.room_id;
  const bookingDate = body.booking_date;
  const startTime = body.start_time;
  const endTime = body.end_time;
  const borrowerName = body.borrower_name || "";
  const borrowerRole = body.borrower_role || "";
  const borrowerContact = body.borrower_contact || "";
  const purpose = body.purpose || "";

  if (!roomId || !bookingDate || !startTime || !endTime || !borrowerName || !borrowerRole || !purpose) {
    return json(400, { status: "error", message: "Data peminjaman belum lengkap" });
  }
  if (!["Dosen", "Staff"].includes(borrowerRole)) {
    return json(400, { status: "error", message: "Peminjam hanya boleh Dosen atau Staff" });
  }
  if (startTime < "08:00" || endTime > "16:00" || startTime >= endTime) {
    return json(400, { status: "error", message: "Jam peminjaman harus di antara 08:00 - 16:00" });
  }

  const dayName = getIndonesianDay(bookingDate);
  if (dayName === "Minggu") {
    return json(400, { status: "error", message: "Peminjaman hanya Senin sampai Sabtu" });
  }

  const { data: schedules } = await supabase
    .from("lab_schedules")
    .select("start_time, end_time")
    .eq("room_id", roomId)
    .eq("day_name", dayName)
    .eq("status", "active");
  const scheduleConflict = (schedules || []).some(item =>
    isOverlap(startTime, endTime, item.start_time.slice(0, 5), item.end_time.slice(0, 5))
  );
  if (scheduleConflict) {
    return json(409, { status: "error", message: "Jadwal bentrok dengan jadwal tetap lab" });
  }

  const { data: bookings } = await supabase
    .from("lab_bookings")
    .select("start_time, end_time")
    .eq("room_id", roomId)
    .eq("booking_date", bookingDate)
    .in("status", ["pending", "approved"]);
  const bookingConflict = (bookings || []).some(item =>
    isOverlap(startTime, endTime, item.start_time.slice(0, 5), item.end_time.slice(0, 5))
  );
  if (bookingConflict) {
    return json(409, { status: "error", message: "Jam tersebut sudah diajukan atau sudah dipinjam" });
  }

  const { error } = await supabase.from("lab_bookings").insert({
    room_id: roomId,
    booking_date: bookingDate,
    day_name: dayName,
    start_time: startTime,
    end_time: endTime,
    borrower_name: borrowerName,
    borrower_role: borrowerRole,
    borrower_contact: borrowerContact,
    purpose,
    status: "pending"
  });
  if (error) throw error;
  return json(200, {
    status: "success",
    message: "Pengajuan peminjaman berhasil dikirim dan menunggu persetujuan admin"
  });
}

async function updateBookingStatus(context, supabase) {
  if (!method(context.request, "POST")) {
    return json(405, { status: "error", message: "Method tidak diizinkan" });
  }
  if (!isAdmin(context)) {
    return json(401, { status: "error", message: "Akses admin ditolak" });
  }
  const body = await readBody(context.request);
  const id = body.id;
  const status = body.status;
  const adminNote = body.admin_note || "";
  if (!id || !["approved", "rejected", "cancelled"].includes(status)) {
    return json(400, { status: "error", message: "Data status tidak valid" });
  }
  const { error } = await supabase
    .from("lab_bookings")
    .update({ status, admin_note: adminNote })
    .eq("id", id);
  if (error) throw error;
  return json(200, {
    status: "success",
    message: "Status peminjaman berhasil diperbarui"
  });
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
  "get-schedule": getSchedule,
  "create-booking": createBooking,
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
  } catch {
    return json(500, { status: "error", message: "Terjadi kesalahan pada server" });
  }
}
