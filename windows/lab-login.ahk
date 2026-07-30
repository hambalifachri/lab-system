#Requires AutoHotkey v2.0
#SingleInstance Force

global PcName := A_ComputerName
global HostingConfigPath := A_ScriptDir "\hosting.ini"
global PrimaryLabUrl := IniRead(HostingConfigPath, "Hosting", "PrimaryUrl", "https://lab-system-5lq.pages.dev/")
global BackupLabUrl := IniRead(HostingConfigPath, "Hosting", "BackupUrl", "https://fantastic-bavarois-ef129f.netlify.app/")
global HostingMode := StrLower(IniRead(HostingConfigPath, "Hosting", "Mode", "auto"))
global LabBaseUrl := GetPreferredHost()

; Pemeriksaan sintaks tanpa membuka browser atau mengubah Startup.
if HasCliArgument("--validate")
    ExitApp

global LoginCheckIntervalMs := 2000
global ActiveCheckIntervalMs := 600000 ; 10 menit, hemat request Netlify saat kelas berlangsung.
global BrowserPath := FindBrowser()
global KioskBrowserPid := 0
global IsLabLoggedIn := false
global IsTaskbarHidden := false
global RequireFreshLogin := IsStartupLaunch()

; Kunci shortcut umum hanya sebelum login. Ctrl+Alt+Del tidak dapat diblokir
; oleh aplikasi Windows biasa, sehingga akun mahasiswa tetap harus Standard User.
#HotIf !IsLabLoggedIn
LWin::Return
RWin::Return
^Esc::Return
!Esc::Return
!Tab::Return
^+Esc::Return
!F4::Return
#HotIf

if !RegExMatch(PcName, "^SIPIL-(0[1-9]|1[0-9]|2[0-5])$") {
    MsgBox "Nama komputer harus SIPIL-01 sampai SIPIL-25. Nama saat ini: " PcName, "Login Lab", 16
    ExitApp
}

if (BrowserPath = "") {
    MsgBox "Microsoft Edge atau Google Chrome tidak ditemukan. Instal salah satunya, lalu jalankan script kembali.", "Login Lab", 16
    ExitApp
}

SelectWorkingHost()
EnsureStartup()
if RequireFreshLogin
    ResetSessionOnStartup()
SetLoginScreen(true)
OpenLogin()
CreateLogoutButton()
SetTimer CheckLoginStatus, LoginCheckIntervalMs

; Ctrl + Alt + L: paksa logout bila browser sudah terlanjur ditutup.
^!l::ForceLogout()

EnsureStartup() {
    ; Buat shortcut startup untuk akun Windows yang sedang dipakai.
    ; Cukup jalankan script sekali setelah disalin ke tiap PC lab.
    shortcutPath := A_Startup "\Lab Login Startup.lnk"
    try {
        shell := ComObject("WScript.Shell")
        shortcut := shell.CreateShortcut(shortcutPath)
        shortcut.TargetPath := A_AhkPath
        shortcut.Arguments := Chr(34) A_ScriptFullPath Chr(34) " --startup"
        shortcut.WorkingDirectory := A_ScriptDir
        shortcut.Save()
    } catch {
        ; Jika akun tidak punya izin membuat shortcut, script tetap dapat berjalan.
    }
}

IsStartupLaunch() {
    for argument in A_Args {
        if (argument = "--startup")
            return true
    }
    return false
}

HasCliArgument(expected) {
    for argument in A_Args {
        if (argument = expected)
            return true
    }
    return false
}

GetPreferredHost() {
    global PrimaryLabUrl, BackupLabUrl, HostingMode
    if (HostingMode = "netlify")
        return BackupLabUrl
    return PrimaryLabUrl
}

GetHostCandidates() {
    global PrimaryLabUrl, BackupLabUrl, HostingMode, LabBaseUrl
    if (HostingMode = "cloudflare")
        return [PrimaryLabUrl]
    if (HostingMode = "netlify")
        return [BackupLabUrl]

    ; Coba host aktif dahulu agar tidak menambah request ketika kondisinya sehat.
    if (RTrim(LabBaseUrl, "/") = RTrim(BackupLabUrl, "/"))
        return [BackupLabUrl, PrimaryLabUrl]
    return [PrimaryLabUrl, BackupLabUrl]
}

IsHostAvailable(baseUrl) {
    global PcName
    quote := Chr(34)
    tempFile := A_Temp "\lab-host-check-" PcName ".json"
    try {
        if FileExist(tempFile)
            FileDelete tempFile
        statusUrl := RTrim(baseUrl, "/") "/.netlify/functions/session-status?device_id=" PcName
        curlPath := A_WinDir "\System32\curl.exe"
        command := quote curlPath quote
            . " -sS --connect-timeout 4 --max-time 8 -o " quote tempFile quote
            . " " quote statusUrl quote
        RunWait command, , "Hide"
        if !FileExist(tempFile)
            return false
        result := FileRead(tempFile)
        return InStr(result, quote "status" quote ":" quote "success" quote)
    } catch {
        return false
    }
}

SelectWorkingHost() {
    global LabBaseUrl
    for baseUrl in GetHostCandidates() {
        if IsHostAvailable(baseUrl) {
            LabBaseUrl := baseUrl
            return true
        }
    }
    return false
}

ResetSessionOnStartup() {
    global LabBaseUrl, PcName
    quote := Chr(34)
    payloadFile := A_Temp "\lab-startup-payload-" PcName ".json"
    payload := "{" quote "device_id" quote ":" quote PcName quote
        . "," quote "force_device" quote ":true}"
    try {
        if FileExist(payloadFile)
            FileDelete payloadFile
        FileAppend payload, payloadFile, "UTF-8-RAW"
        logoutUrl := RTrim(LabBaseUrl, "/") "/.netlify/functions/logout"
        curlPath := A_WinDir "\System32\curl.exe"
        command := quote curlPath quote
            . " -sS --retry 3 --retry-all-errors --retry-delay 2 --connect-timeout 5 --max-time 20"
            . " -X POST -H " quote "Content-Type: application/json" quote
            . " --data-binary " quote "@" payloadFile quote " " quote logoutUrl quote
        RunWait command, , "Hide"
    }
}

CreateLogoutButton() {
    global LogoutGui
    ; Tidak mengambil fokus Windows saat diklik, sehingga taskbar tidak muncul.
    LogoutGui := Gui("+AlwaysOnTop +ToolWindow -MinimizeBox -MaximizeBox +E0x08000000", "Login Lab")
    LogoutGui.SetFont("s10 Bold", "Segoe UI")
    logoutButton := LogoutGui.AddButton("w132 h42", "Logout")
    logoutButton.OnEvent("Click", (*) => ForceLogout())
    ; Tombol dapat digeser memakai judul jendela, tetapi tidak dapat ditutup.
    LogoutGui.OnEvent("Close", KeepLogoutButton)
    LogoutGui.Show("x" (A_ScreenWidth - 165) " y20 NoActivate")
}

KeepLogoutButton(*) {
    global LogoutGui
    LogoutGui.Show("NoActivate")
    return 1 ; Batalkan Close agar GUI tidak dihancurkan.
}

FindBrowser() {
    programFilesX86 := EnvGet("ProgramFiles(x86)")
    candidates := [
        A_ProgramFiles "\Microsoft\Edge\Application\msedge.exe",
        programFilesX86 "\Microsoft\Edge\Application\msedge.exe",
        A_ProgramFiles "\Google\Chrome\Application\chrome.exe",
        programFilesX86 "\Google\Chrome\Application\chrome.exe"
    ]

    for browserPath in candidates {
        if FileExist(browserPath)
            return browserPath
    }

    return ""
}

OpenLogin() {
    global LabBaseUrl, PcName, BrowserPath, KioskBrowserPid
    if IsLoginBrowserOpen()
        return

    loginUrl := RTrim(LabBaseUrl, "/") "/?pc=" PcName
    quote := Chr(34)
    ; Profil khusus memaksa Edge membuat jendela kiosk baru, bukan memakai
    ; jendela Edge biasa yang mungkin masih berjalan.
    kioskProfile := A_ScriptDir "\edge-kiosk-profile"
    if !DirExist(kioskProfile)
        DirCreate kioskProfile
    if InStr(StrLower(BrowserPath), "msedge.exe") {
        browserArgs := " --kiosk --edge-kiosk-type=fullscreen --no-first-run --user-data-dir=" quote kioskProfile quote
    } else {
        browserArgs := " --kiosk --no-first-run --user-data-dir=" quote kioskProfile quote
    }
    Run quote BrowserPath quote browserArgs " " quote loginUrl quote, , , &KioskBrowserPid
}

IsLoginBrowserOpen() {
    global KioskBrowserPid
    ; Edge kadang memindahkan jendela kiosk dari PID awal ke proses anak.
    if (KioskBrowserPid && ProcessExist(KioskBrowserPid))
        return true
    if WinExist("Login Lab Komputer ahk_exe msedge.exe")
        return true
    if WinExist("Login Lab Komputer ahk_exe chrome.exe")
        return true
    return false
}

CheckLoginStatus() {
    global LabBaseUrl, PcName, IsLabLoggedIn, LoginCheckIntervalMs, ActiveCheckIntervalMs, KioskBrowserPid, RequireFreshLogin
    wasLoggedIn := IsLabLoggedIn
    tempFile := A_Temp "\lab-login-status-" PcName ".json"

    try {
        if FileExist(tempFile)
            FileDelete tempFile

        ; curl bawaan Windows lebih konsisten untuk request sederhana dari AHK.
        quote := Chr(34)
        statusUrl := RTrim(LabBaseUrl, "/") "/.netlify/functions/session-status?device_id=" PcName
        curlPath := A_WinDir "\System32\curl.exe"
        command := quote curlPath quote " -sS --connect-timeout 8 --max-time 12 -o " quote tempFile quote " " quote statusUrl quote
        RunWait command, , "Hide"
        statusJson := FileRead(tempFile)
        if !InStr(statusJson, Chr(34) "status" Chr(34) ":" Chr(34) "success" Chr(34)) {
            oldBaseUrl := LabBaseUrl
            if !wasLoggedIn && SelectWorkingHost() && RTrim(oldBaseUrl, "/") != RTrim(LabBaseUrl, "/") {
                CloseLoginBrowser()
                OpenLogin()
            } else if wasLoggedIn {
                SelectWorkingHost()
            }
            throw Error("Host login tidak tersedia")
        }
        if InStr(statusJson, Chr(34) "logged_in" Chr(34) ":true") {
            ; Saat boot, abaikan status lama sampai server pernah mengonfirmasi
            ; bahwa sesi sebelumnya benar-benar sudah terhapus.
            if RequireFreshLogin {
                ResetSessionOnStartup()
                IsLabLoggedIn := false
                SetLoginScreen(true)
                if !IsLoginBrowserOpen()
                    OpenLogin()
                return
            }
            IsLabLoggedIn := true
            SetLoginScreen(false)
            ; Explorer kadang membutuhkan satu siklus lagi untuk memulihkan taskbar.
            SetTimer ShowTaskbar, -700
            ; Tutup proses kiosk yang dibuat script agar tidak bergantung judul halaman.
            CloseLoginBrowser()
            KeepSessionAlive()
            ; Setelah berhasil login tidak perlu cek tiap 2 detik.
            SetTimer CheckLoginStatus, ActiveCheckIntervalMs
            return
        }
        RequireFreshLogin := false
        IsLabLoggedIn := false
    } catch {
        ; Jangan mengunci kembali PC yang sudah login hanya karena internet
        ; atau server mengalami gangguan sesaat.
        if wasLoggedIn
            return
        IsLabLoggedIn := false
    }

    SetLoginScreen(true)
    ; Saat belum login, cek cepat agar Edge dapat tertutup segera setelah login.
    SetTimer CheckLoginStatus, LoginCheckIntervalMs
    ; Jika belum login dan halaman login sudah ditutup, buka kembali.
    if !IsLoginBrowserOpen()
        OpenLogin()
}

CloseLoginBrowser() {
    global KioskBrowserPid
    if (KioskBrowserPid && ProcessExist(KioskBrowserPid)) {
        try WinClose "ahk_pid " KioskBrowserPid
        if ProcessWaitClose(KioskBrowserPid, 2) = 0 {
            try ProcessClose KioskBrowserPid
        }
    }
    ; Jalur cadangan bila Edge sudah memindahkan kiosk ke PID anak.
    try {
        while hwnd := WinExist("Login Lab Komputer ahk_exe msedge.exe") {
            WinClose "ahk_id " hwnd
            if !WinWaitClose("ahk_id " hwnd, , 2)
                break
        }
        while hwnd := WinExist("Login Lab Komputer ahk_exe chrome.exe") {
            WinClose "ahk_id " hwnd
            if !WinWaitClose("ahk_id " hwnd, , 2)
                break
        }
    }
    KioskBrowserPid := 0
}

SetLoginScreen(isLoginScreen) {
    global IsTaskbarHidden
    if (IsTaskbarHidden = isLoginScreen)
        return

    IsTaskbarHidden := isLoginScreen
    if isLoginScreen {
        if WinExist("ahk_class Shell_TrayWnd")
            WinHide "ahk_class Shell_TrayWnd"
        if WinExist("ahk_class Shell_SecondaryTrayWnd")
            WinHide "ahk_class Shell_SecondaryTrayWnd"
    } else {
        ShowTaskbar()
    }
}

ShowTaskbar() {
    previousSetting := A_DetectHiddenWindows
    DetectHiddenWindows true
    try {
        if WinExist("ahk_class Shell_TrayWnd")
            WinShow "ahk_class Shell_TrayWnd"
        if WinExist("ahk_class Shell_SecondaryTrayWnd")
            WinShow "ahk_class Shell_SecondaryTrayWnd"
    } finally {
        DetectHiddenWindows previousSetting
    }
}

KeepSessionAlive() {
    global LabBaseUrl, PcName
    quote := Chr(34)
    payloadFile := A_Temp "\lab-heartbeat-payload-" PcName ".json"
    payload := "{" quote "device_id" quote ":" quote PcName quote "}"
    heartbeatUrl := RTrim(LabBaseUrl, "/") "/.netlify/functions/computer-heartbeat"
    curlPath := A_WinDir "\System32\curl.exe"
    try {
        if FileExist(payloadFile)
            FileDelete payloadFile
        FileAppend payload, payloadFile, "UTF-8-RAW"
        command := quote curlPath quote " -sS --connect-timeout 8 --max-time 12"
            . " -X POST -H " quote "Content-Type: application/json" quote
            . " --data-binary " quote "@" payloadFile quote " " quote heartbeatUrl quote
        RunWait command, , "Hide"
    }
}

ForceLogout() {
    global LabBaseUrl, PcName, IsLabLoggedIn, LoginCheckIntervalMs
    if (MsgBox("Akhiri sesi aktif di " PcName " dan tampilkan login lagi?", "Logout Lab", "YesNo Icon?") != "Yes")
        return

    quote := Chr(34)
    apostrophe := Chr(39)
    tempFile := A_Temp "\lab-logout-" PcName ".json"
    payloadFile := A_Temp "\lab-logout-payload-" PcName ".json"
    if FileExist(tempFile)
        FileDelete tempFile
    if FileExist(payloadFile)
        FileDelete payloadFile
    payload := "{" quote "device_id" quote ":" quote PcName quote "," quote "force_device" quote ":true}"
    ; Kirim body dari file agar tanda kutip JSON tidak rusak oleh command line Windows.
    FileAppend payload, payloadFile, "UTF-8-RAW"
    logoutUrl := RTrim(LabBaseUrl, "/") "/.netlify/functions/logout"
    curlPath := A_WinDir "\System32\curl.exe"
    command := quote curlPath quote " -sS -X POST -H " quote "Content-Type: application/json" quote
        . " --data-binary " quote "@" payloadFile quote " -o " quote tempFile quote " " quote logoutUrl quote
    try {
        RunWait command, , "Hide"
        if !FileExist(tempFile) {
            MsgBox "Logout gagal. Server tidak memberikan respons.", "Logout Lab", 16
            return
        }
        result := FileRead(tempFile)
        if !InStr(result, Chr(34) "status" Chr(34) ":" Chr(34) "success" Chr(34)) {
            MsgBox "Server menolak logout: " result, "Logout Lab", 16
            return
        }
        IsLabLoggedIn := false
        SetLoginScreen(true)
        SetTimer CheckLoginStatus, LoginCheckIntervalMs
        OpenLogin()
    } catch as err {
        MsgBox "Logout gagal: " err.Message, "Logout Lab", 16
    }
}
