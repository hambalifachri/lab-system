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
  if (String(name || '').startsWith('ARSITEK-')) return 'Lab C.405';
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
    const [computersResult, sessionsResult] = await Promise.all([
      supabase.from('lab_computers').select('computer_name,device_id,last_seen,status'),
      supabase.from('active_sessions').select('nim,student_name,computer_name,device_id,last_seen,status')
    ]);

    // Dashboard tetap perlu dapat dibuka pada database yang baru dipulihkan.
    // Jika salah satu sumber status belum tersedia, tampilkan PC sebagai offline
    // dan gunakan sumber lain yang masih berhasil dibaca.
    const computers = new Map((computersResult.error ? [] : computersResult.data || [])
      .map(row => [row.device_id || row.computer_name, row]));
    const sessions = new Map((sessionsResult.error ? [] : sessionsResult.data || [])
      .map(row => [row.device_id || row.computer_name, row]));
    const deviceNames = ['SIPIL', 'ARSITEK'].flatMap(prefix =>
      Array.from({ length: 25 }, (_, index) => `${prefix}-${String(index + 1).padStart(2, '0')}`)
    );
    const now = Date.now();
    const data = deviceNames.map(computerName => {
      const computer = computers.get(computerName);
      const session = sessions.get(computerName);
      const lastSeen = session?.last_seen || computer?.last_seen || null;
      const secondsAgo = lastSeen ? Math.max(0, Math.floor((now - new Date(lastSeen).getTime()) / 1000)) : null;
      return {
        computer_name: computerName,
        status: session ? 'dipakai' : (secondsAgo !== null && secondsAgo <= 300 ? 'kosong' : 'offline'),
        nim: session?.nim || null,
        nama: session?.student_name || null,
        // Database lama tidak selalu memiliki kolom login_at. Awal sesi
        // tersimpan pada status active:<ISO>, lalu last_seen sebagai cadangan.
        login_at: session?.status?.startsWith('active:') ? session.status.slice(7) : (session?.last_seen || null),
        seconds_ago: secondsAgo,
        room: roomForComputer(computerName)
      };
    });

    return response(200, {
      status: "success",
      data
    });

  } catch (error) {
    return response(500, {
      status: "error",
      message: "Gagal mengambil status lab"
    });
  }
};
