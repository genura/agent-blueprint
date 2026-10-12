# Klasoru (ya da dosyayi secili olarak) Explorer'da acar ve pencereyi one getirir.
# Ayni klasor zaten aciksa yeni pencere acmaz, onu one getirir.
# Kullanim: powershell -NoProfile -STA -File reveal.ps1 -Folder "C:\yol" [-File "C:\yol\a.flow"]
param([string]$Folder, [string]$File = '')

Add-Type @'
using System; using System.Runtime.InteropServices;
public static class Front {
  [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr h, int cmd);
  [DllImport("user32.dll")] static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);
  public static void Bring(IntPtr h) {
    if (IsIconic(h)) ShowWindow(h, 9); // SW_RESTORE
    // Windows on plan kilidi: kisa bir ALT basimi baska islemin pencereyi one almasina izin verir
    keybd_event(0x12, 0, 0, UIntPtr.Zero);
    keybd_event(0x12, 0, 2, UIntPtr.Zero);
    SetForegroundWindow(h);
  }
}
'@

$shell = New-Object -ComObject Shell.Application
$want = (Resolve-Path -LiteralPath $Folder).Path.TrimEnd('\')

function Find-Window {
  foreach ($w in $shell.Windows()) {
    try {
      $p = $w.Document.Folder.Self.Path
      if ($p -and $p.TrimEnd('\') -ieq $want) { return $w }
    } catch { }
  }
  return $null
}

$win = Find-Window
if ($win -and -not $File) {
  [Front]::Bring([IntPtr]$win.HWND)
  exit
}

if ($File) { Start-Process explorer.exe -ArgumentList "/select,`"$File`"" }
else { Start-Process explorer.exe -ArgumentList "`"$want`"" }

for ($i = 0; $i -lt 30; $i++) {
  Start-Sleep -Milliseconds 100
  $win = Find-Window
  if ($win) { [Front]::Bring([IntPtr]$win.HWND); break }
}
