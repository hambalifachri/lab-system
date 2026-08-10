# Pengawas login Windows

`lab-login.ahk` adalah script AutoHotkey v2 untuk PC `SIPIL-01`–`SIPIL-25` dan `ARSITEK-01`–`ARSITEK-25`.
Script membaca hostname Windows secara otomatis, lalu memaksa halaman login muncul selama belum ada sesi aktif untuk PC itu.

## Pemasangan sekali jalan

1. Ekstrak seluruh isi ZIP.
2. Klik kanan `Jalankan-Sekali.cmd`, lalu pilih **Run as administrator**.
3. Script menyalin konfigurasi ke `C:\LabLogin`, memasang AutoHotkey v2 melalui Winget bila diperlukan, menguji script, lalu menjalankannya.

## Pemasangan manual

1. Pastikan nama komputer Windows mengikuti format `SIPIL-01`–`SIPIL-25` atau `ARSITEK-01`–`ARSITEK-25`.
2. Instal [AutoHotkey v2](https://www.autohotkey.com/).
3. Salin folder `windows` ke lokasi tetap, contohnya `C:\LabLogin`.
4. Salin juga `hosting.ini` ke folder yang sama dengan `lab-login.ahk`.
5. Jalankan `lab-login.ahk` sekali untuk pengujian. Halaman login harus membuka URL dengan `?pc=SIPIL-xx` atau `?pc=ARSITEK-xx`.
6. Script otomatis membuat shortcut Startup untuk akun Windows yang sedang digunakan.

## Pergantian hosting

Edit `hosting.ini`, lalu restart script:

- `Mode=auto`: Cloudflare utama dan Netlify menjadi cadangan otomatis.
- `Mode=cloudflare`: paksa memakai Cloudflare.
- `Mode=netlify`: paksa memakai Netlify.

Alamat hosting dapat diganti melalui `PrimaryUrl` dan `BackupUrl` tanpa mengedit
script AutoHotkey.

## Cara kerja

- Setelah login, AutoHotkey memperbarui sesi setiap 10 menit.
- Sesi berakhir otomatis paling lama setelah dua jam.
- Saat belum login, script memeriksa status setiap dua detik dan membuka kembali
  halaman login jika ditutup.
- Jika host aktif bermasalah, mode `auto` mencoba host cadangan.
- Logout menghapus sesi, sehingga halaman login kembali diwajibkan.

## Batasan keamanan

AutoHotkey adalah pengawas antarmuka, bukan pengganti kebijakan keamanan Windows. Gunakan akun mahasiswa non-admin dan batasi Task Manager, Command Prompt, PowerShell, serta pengubahan Startup melalui Group Policy agar script tidak mudah dimatikan.
