@echo off
setlocal EnableExtensions
title Instalasi Login Lab Arsitek

fltmc >nul 2>&1
if errorlevel 1 (
  echo Meminta izin Administrator...
  powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)

if not exist "%~dp0lab-login.ahk" (
  echo ERROR: lab-login.ahk tidak ditemukan di dalam paket.
  pause
  exit /b 1
)
if not exist "%~dp0hosting.ini" (
  echo ERROR: hosting.ini tidak ditemukan di dalam paket.
  pause
  exit /b 1
)

set "TARGET=C:\LabLogin"
if not exist "%TARGET%" mkdir "%TARGET%"
copy /Y "%~dp0lab-login.ahk" "%TARGET%\lab-login.ahk" >nul
copy /Y "%~dp0hosting.ini" "%TARGET%\hosting.ini" >nul

set "AHK_EXE="
if exist "C:\Program Files\AutoHotkey\v2\AutoHotkey64.exe" set "AHK_EXE=C:\Program Files\AutoHotkey\v2\AutoHotkey64.exe"
if not defined AHK_EXE if exist "C:\Program Files\AutoHotkey\v2\AutoHotkey.exe" set "AHK_EXE=C:\Program Files\AutoHotkey\v2\AutoHotkey.exe"
if not defined AHK_EXE if exist "%LOCALAPPDATA%\Programs\AutoHotkey\v2\AutoHotkey64.exe" set "AHK_EXE=%LOCALAPPDATA%\Programs\AutoHotkey\v2\AutoHotkey64.exe"

if not defined AHK_EXE (
  echo AutoHotkey v2 belum terpasang. Mencoba instal otomatis...
  where winget.exe >nul 2>&1
  if errorlevel 1 goto :no_ahk
  winget.exe install --id AutoHotkey.AutoHotkey --exact --silent --accept-package-agreements --accept-source-agreements
  if exist "C:\Program Files\AutoHotkey\v2\AutoHotkey64.exe" set "AHK_EXE=C:\Program Files\AutoHotkey\v2\AutoHotkey64.exe"
  if not defined AHK_EXE if exist "C:\Program Files\AutoHotkey\v2\AutoHotkey.exe" set "AHK_EXE=C:\Program Files\AutoHotkey\v2\AutoHotkey.exe"
)

if not defined AHK_EXE goto :no_ahk

echo Memeriksa script...
"%AHK_EXE%" "%TARGET%\lab-login.ahk" --validate
if errorlevel 1 (
  echo ERROR: Pemeriksaan script gagal.
  pause
  exit /b 1
)

start "" "%AHK_EXE%" "%TARGET%\lab-login.ahk"
echo.
echo Instalasi selesai untuk komputer %COMPUTERNAME%.
echo File dipasang di C:\LabLogin dan akan berjalan otomatis saat login Windows.
timeout /t 4 >nul
exit /b 0

:no_ahk
echo.
echo ERROR: AutoHotkey v2 belum tersedia dan instalasi otomatis gagal.
echo Instal AutoHotkey v2, lalu jalankan kembali Jalankan-Sekali.cmd.
pause
exit /b 1
