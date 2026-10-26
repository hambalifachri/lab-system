# Paket uji pengunci lokal

Uji satu PC kosong dahulu, dengan akses LabAdmin dan Veyon tersedia.

1. Ekstrak ZIP. Jalankan Update-Pengunci.cmd dan berikan izin LabAdmin.
2. Installer memeriksa sintaks sebelum menyalin. Tidak mengubah hosting.ini,
   kebijakan kampus, atau startup. Tidak restart/shutdown otomatis.
3. Simpan pekerjaan, restart manual, masuk akun mahasiswa. Startup login lab
   yang sebelumnya dipasang harus tetap menunjuk C:\LabLogin\lab-login.ahk.
4. Pastikan layar penutup muncul bahkan ketika internet lambat. Coba buka
   Notepad sebelum halaman siap: aplikasi tidak boleh tetap di depan penutup.
5. Coba minimalkan Edge, pindah aplikasi, dan monitor kedua bila ada.
6. Login dengan NIM yang valid: penutup hilang, taskbar normal, aplikasi lama
   tidak ditutup. Logout & Matikan PC masih memerlukan konfirmasi.
7. Saat server sedang mode darurat, pengguna belum login tetap terkunci.
   Sesi yang sudah login tidak dikunci ulang hanya karena koneksi terputus.

Pengecekan jendela tiap 250 ms bersifat lokal, bukan request internet.
Pengecekan server tetap 30 detik sebelum login, 10 menit setelah login, dan
2 menit saat gagal. Halaman sukses versi terbaru memberi sinyal judul lokal
yang dideteksi sekitar 250 ms, lalu server segera diverifikasi. Maksimal tiga
percobaan cepat, berselang 5 detik bila belum berhasil. Desktop tidak dibuka
hanya berdasarkan judul. Waktu respons tetap bergantung pada jaringan/server.
Website DAN script PC harus versi baru agar fitur cepat bekerja.

## Pemulihan jika pengujian gagal

Gunakan Ctrl+Alt+Del untuk beralih ke akun LabAdmin (jangan memaksa sign out
bila ada pekerjaan belum disimpan). Melalui akun admin, salin
C:\LabLogin\lab-login.before-guard.ahk ke C:\LabLogin\lab-login.ahk.
Restart manual setelah pekerjaan disimpan. Ini memulihkan script sebelum update.
Jangan menghapus backup tersebut sebelum pengujian selesai.

## Batas perlindungan

Pengunci baru aktif SETELAH AutoHotkey berjalan; tidak menutup celah sebelum
startup aplikasi. Ini bukan kiosk Windows atau pengamanan anti-bypass mutlak.
Ctrl+Alt+Del dan secure desktop Windows tetap tersedia. Gunakan akun mahasiswa
standard user. Jangan sebarkan ke semua PC sebelum lolos uji lokal.

Paket hanya diuji sintaks dengan AutoHotkey; pengujian boot, fokus aplikasi,
multi-monitor dan login/logout langsung pada PC lab masih perlu dilakukan.
