@echo off
setlocal EnableExtensions
title Update Pengunci Login Lab - UJI SATU PC
fltmc >nul 2>&1
if errorlevel 1 (
  powershell.exe -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)
if not exist "C:\LabLogin\lab-login.ahk" (
  echo ERROR: Instalasi C:\LabLogin tidak ditemukan. Paket ini hanya untuk update.
  pause
  exit /b 1
)
set "AHK_EXE="
if exist "C:\Program Files\AutoHotkey\v2\AutoHotkey64.exe" set "AHK_EXE=C:\Program Files\AutoHotkey\v2\AutoHotkey64.exe"
if not defined AHK_EXE if exist "C:\Program Files\AutoHotkey\v2\AutoHotkey.exe" set "AHK_EXE=C:\Program Files\AutoHotkey\v2\AutoHotkey.exe"
if not defined AHK_EXE (
  echo ERROR: AutoHotkey v2 sistem tidak ditemukan. Hubungi laboran.
  pause
  exit /b 1
)
"%AHK_EXE%" /ErrorStdOut "%~dp0lab-login.ahk" --validate
if errorlevel 1 (
  echo ERROR: Script tidak lolos pemeriksaan. File lama belum diubah.
  pause
  exit /b 1
)
if not exist "C:\LabLogin\lab-login.before-guard.ahk" (
  copy /Y "C:\LabLogin\lab-login.ahk" "C:\LabLogin\lab-login.before-guard.ahk" >nul
  if errorlevel 1 exit /b 1
)
copy /Y "%~dp0lab-login.ahk" "C:\LabLogin\lab-login.ahk" >nul
if errorlevel 1 exit /b 1
echo Update selesai. Pengaturan hosting dan startup tidak diubah.
echo Simpan semua pekerjaan, lalu restart manual dan masuk akun mahasiswa.
echo Tidak menjalankan script memakai akun admin pemasang.
pause
