# Konteks Proyek Lab System

Dokumen ini adalah konteks kerja untuk GitHub Copilot/VS Code. Baca dokumen ini sebelum melakukan perubahan supaya fitur baru tidak merusak alur login lab, booking, maupun deploy.

## Tujuan sistem

Lab System mengelola dua hal:

1. Login penggunaan PC laboratorium Windows sebelum mahasiswa memakai aplikasi.
2. Jadwal, peminjaman/booking, dan pemantauan laboratorium melalui website.

Sistem dipakai untuk:

| Ruangan | Nama PC |
| --- | --- |
| Lab C.413 | `SIPIL-01` sampai `SIPIL-25` |
| Lab C.405 | `ARSITEK-01` sampai `ARSITEK-25` |

## URL penting

- Produksi Cloudflare Pages: `https://lab-system-5lq.pages.dev`
- Halaman login: `https://lab-system-5lq.pages.dev/?pc=NAMA-PC`
- Admin: `https://lab-system-5lq.pages.dev/admin`
- Booking publik: `https://lab-system-5lq.pages.dev/booking`
- Status booking: `https://lab-system-5lq.pages.dev/booking-status`
- Admin booking: `https://lab-system-5lq.pages.dev/admin-booking`
- Jadwal: `https://lab-system-5lq.pages.dev/schedule`
- GitHub: `https://github.com/hambalifachri/lab-system`
- Cadangan Netlify: `https://fantastic-bavarois-ef129f.netlify.app`

Jangan menaruh password admin, service role key, atau token Supabase di file frontend atau dokumentasi publik.

## Arsitektur

- Frontend statis ada di `frontend/`.
- Backend Netlify cadangan ada di `netlify/functions/`.
- Backend Cloudflare Pages produksi adalah bundle catch-all: `functions/.netlify/functions/[name].js`.
- Database: Supabase. Semua akses database dilakukan dari backend menggunakan service-role key. Frontend tidak boleh menyimpan service-role key.
- API tetap memakai pola `/.netlify/functions/NAMA-FUNGSI`, termasuk di Cloudflare.
- Redirect dan rute frontend diatur di `frontend/_routes.json` dan konfigurasi deploy terkait.

### Aturan penting saat mengubah backend

Setiap perubahan pada file backend di `netlify/functions/` **wajib dicerminkan** ke `functions/.netlify/functions/[name].js`. Jika tidak, Netlify dan Cloudflare akan memiliki perilaku berbeda.

Setelah perubahan:

1. Periksa sintaks JavaScript.
2. Commit dan push ke branch `main`.
3. Tunggu Cloudflare Pages deploy.
4. Uji halaman produksi dan API produksi, bukan hanya file lokal.

## Login PC Windows

PC mahasiswa menjalankan AutoHotkey v2 dari folder `C:\LabLogin`.

Alur yang diharapkan:

1. Saat Windows masuk, script membuka Microsoft Edge ke halaman login sesuai parameter `?pc=NAMA-PC`.
2. Sebelum login, Edge ditampilkan fullscreen/kiosk dan halaman login dipaksa muncul kembali bila ditutup.
3. Setelah NIM berhasil login, Edge ditutup dan desktop/taskbar kembali bisa dipakai.
4. Tombol Logout mengubah status sesi menjadi logout dan membuka kembali halaman login fullscreen.
5. Masa sesi normal maksimal 2 jam; setelah berakhir PC kembali ke halaman login.

Script dan paket Windows terkait ada di folder `windows/`. Jangan mengubah protokol status login tanpa menyesuaikan script AutoHotkey.

## Status PC dan sesi

- Status normal: kosong, dipakai, offline, atau akses tanpa NIM/bebas.
- Admin dapat membebaskan PC sementara (misalnya 2 jam) untuk kelas yang tidak perlu login NIM.
- Ketika mode bebas berakhir atau admin memilih wajib login, PC harus kembali ke halaman login.
- Heartbeat/status PC harus hemat request; jangan membuat polling terlalu rapat karena pernah menyebabkan penggunaan hosting meningkat.

## Booking dan jadwal

Halaman booking publik mendukung:

- Booking sekali pakai (`single`).
- Pengajuan jadwal tetap (`fixed_schedule`) oleh dosen.

Aturan booking:

- Booking sekali pakai mewajibkan keperluan dan tanggal.
- Jadwal tetap membuat periode otomatis berdasarkan tahun akademik dan jenis periode.
- Keperluan jadwal tetap bersifat opsional.
- Kapasitas maksimum laboratorium 25 mahasiswa.
- Daftar NIM mahasiswa opsional, maksimal 25 NIM, setiap NIM 11 digit.
- Pengajuan wajib menyetujui peraturan laboratorium melalui checkbox. Backend juga wajib memvalidasi `rules_accepted === true`; validasi frontend saja tidak cukup.
- Waktu persetujuan aturan disimpan di `rules_accepted_at` dan tidak boleh dihapus ketika admin menyetujui/menolak/membatalkan booking.
- Pengajuan jadwal tetap yang disetujui membuat/menghubungkan baris pada `lab_schedules`.

Periode jadwal tetap:

| Jenis | Periode bawaan |
| --- | --- |
| Gasal | 1 September–31 Oktober |
| Antara gasal | 1 Februari–31 Maret |
| Genap | 1 Maret–31 Mei |
| Antara genap | 1 Agustus–30 September |

Periode antara dapat diubah admin bila kalender akademik berubah.

## Peraturan yang disetujui pemohon booking

1. Dilarang makan di laboratorium.
2. Minuman hanya dalam tumbler atau botol air tertutup dan dijauhkan dari komputer.
3. Tidak meninggalkan sampah.
4. Tidak memindahkan peralatan atau mencabut kabel tanpa izin.
5. Tidak memasang/menghapus aplikasi atau mengubah pengaturan komputer tanpa izin.
6. Setiap pengguna menggunakan NIM sendiri dan tidak berbagi identitas login.
7. Penanggung jawab memastikan seluruh peserta mematuhi aturan.
8. Kerusakan atau kendala wajib segera dilaporkan.
9. Mengikuti jadwal dan meninggalkan lab dalam kondisi rapi.

## Database Supabase

Tabel utama yang digunakan:

- `lab_bookings`
- `lab_schedules`
- `lab_rooms`
- `lab_computers`
- `active_sessions`
- `login_logs`
- `students`

Kolom booking penting: `request_type`, `semester_label`, `period_start`, `period_end`, `schedule_id`, `rules_accepted_at`, daftar NIM, jumlah peserta, serta status.

Sebelum membuat perubahan skema:

1. Buat migration SQL di folder `supabase/`.
2. Terapkan migration secara aman ke Supabase.
3. Uji query/API yang terpengaruh.
4. Jangan menghapus data lama tanpa persetujuan eksplisit.

## Desain dan bahasa

- Bahasa antarmuka: Indonesia.
- Tampilan dominan gelap dan profesional.
- Watermark kecil di halaman booking: `Created by Fachri Hambali`.
- Hindari perubahan besar pada tampilan/flow tanpa kebutuhan karena sistem sudah dipakai di lab.

## Cara meminta bantuan Copilot

Sebelum meminta perubahan, gunakan instruksi seperti:

> Baca `PROJECT_CONTEXT.md`, lalu periksa file terkait. Jangan mengubah backend hanya di satu platform: sinkronkan `netlify/functions/` dan `functions/.netlify/functions/[name].js`. Jelaskan file yang akan diubah dan lakukan pengujian setelahnya.

Contoh khusus:

> Baca `PROJECT_CONTEXT.md`. Tambahkan fitur booking tanpa mengubah alur login PC, validasi persetujuan peraturan, batas 25 peserta, atau kompatibilitas Cloudflare dan Netlify.

