// ================= IMPORT LIBRARY =================
const express = require('express');
const { createClient } = require('@supabase/supabase-js');

// ================= SETUP APP =================
const app = express();

app.use(express.json());
app.use(express.static('frontend'));

// ================= SETUP SUPABASE =================
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.log("SUPABASE_URL atau SUPABASE_SERVICE_ROLE_KEY belum diisi");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// ================= CEK SERVER =================
app.get('/cek', (req, res) => {
  res.json({
    status: "ok",
    message: "Server aktif"
  });
});

// ================= LOGIN =================
app.post('/login', async (req, res) => {
  const { nim } = req.body;

  if (!nim || nim.toString().trim() === "") {
    return res.json({
      status: "error",
      message: "NIM wajib diisi"
    });
  }

  const inputNim = nim.toString().trim();

  try {
    const { data: student, error } = await supabase
      .from('students')
      .select('nim, nama, aktif')
      .eq('nim', inputNim)
      .single();

    if (error || !student) {
      return res.json({
        status: "error",
        message: "NIM tidak terdaftar"
      });
    }

    if (!student.aktif) {
      return res.json({
        status: "error",
        message: "Akun mahasiswa tidak aktif"
      });
    }

    await supabase
      .from('login_logs')
      .insert({
        nim: student.nim,
        nama: student.nama,
        aksi: "login"
      });

    res.json({
      status: "success",
      nim: student.nim,
      nama: student.nama
    });

  } catch (error) {
    console.log("ERROR LOGIN:", error);

    res.json({
      status: "error",
      message: "Gagal login"
    });
  }
});

// ================= LOGOUT =================
app.post('/logout', async (req, res) => {
  const { nim, nama } = req.body;

  if (!nim || nim.toString().trim() === "") {
    return res.json({
      status: "error",
      message: "NIM tidak ditemukan"
    });
  }

  try {
    await supabase
      .from('login_logs')
      .insert({
        nim: nim.toString().trim(),
        nama: nama || "",
        aksi: "logout"
      });

    res.json({
      status: "success",
      message: "Logout berhasil"
    });

  } catch (error) {
    console.log("ERROR LOGOUT:", error);

    res.json({
      status: "error",
      message: "Gagal logout"
    });
  }
});

// ================= JALANKAN SERVER =================
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("Server jalan di port " + PORT);
});
