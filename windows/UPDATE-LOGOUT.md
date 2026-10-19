# Update Logout & Matikan PC

Pasang dahulu pada satu PC kosong. Simpan pekerjaan sebelum menjalankan paket.

1. Ekstrak paket ZIP (jangan jalankan langsung dari ZIP).
2. Jalankan `Jalankan-Sekali.cmd` pada PC mahasiswa dan setujui izin administrator.
3. Pilihan hosting lama dipertahankan. Script sebelumnya dicadangkan ke `C:\LabLogin\lab-login.before-update.ahk`.
4. Uji login, lalu klik `Logout & Matikan PC`. Pilihan awal konfirmasi adalah Tidak.
5. Jika server gagal, PC tidak dimatikan. Jika logout berhasil, Windows diminta shutdown tanpa memaksa aplikasi ditutup. Windows dapat membatalkan shutdown bila ada pekerjaan belum disimpan.

Shutdown berlaku untuk tombol aplikasi Windows dan Ctrl+Alt+L, bukan logout otomatis saat sesi habis atau tombol logout di website.

Pemeriksaan sebelum login: 30 detik, sehingga masuk desktop bisa menunggu hingga sekitar 30 detik ditambah waktu jaringan. Setelah login: tetap 10 menit. Saat gagal: tunggu 2 menit sebelum mencoba lagi. Angka ini tidak menjamin seluruh penggunaan akun berada di bawah kuota.

Push GitHub tidak otomatis memperbarui aplikasi di 50 PC. Pasang paket pada setiap PC yang akan memakai perubahan ini. Tidak perlu mengubah database.

Perubahan ini tidak memulihkan kuota Cloudflare yang sudah habis atau memperbaiki konfigurasi Netlify cadangan. Logout & shutdown hanya bekerja setelah API logout kembali sehat.
