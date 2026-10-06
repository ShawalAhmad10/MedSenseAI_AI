param([string]$Keys='',[int]$ClickX=-1,[int]$ClickY=-1,[int]$SecondX=-1,[int]$SecondY=-1,[switch]$Maximize)
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Windows.Forms
Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public class PgAdminScreen { [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left; public int Top; public int Right; public int Bottom; } [DllImport("user32.dll")] public static extern bool SetProcessDPIAware(); [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r); [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h); [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int cmd); [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y); [DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint x, uint y, uint data, UIntPtr extra); }'
[void][PgAdminScreen]::SetProcessDPIAware()
$pgWindow = Get-Process pgAdmin4 | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
if (!$pgWindow -or $pgWindow.MainWindowTitle -ne 'pgAdmin 4') { throw 'Expected pgAdmin window not found' }
if ($Maximize) { [void][PgAdminScreen]::ShowWindow($pgWindow.MainWindowHandle,3) }
# AppActivate preserves an already open pgAdmin menu; SetForegroundWindow dismisses it.
$pgShell = New-Object -ComObject WScript.Shell
[void]$pgShell.AppActivate($pgWindow.Id)
Start-Sleep -Milliseconds 400
$pgRect = New-Object PgAdminScreen+RECT
[void][PgAdminScreen]::GetWindowRect($pgWindow.MainWindowHandle,[ref]$pgRect)
Write-Output ('Window bounds: '+$pgRect.Left+','+$pgRect.Top+','+$pgRect.Right+','+$pgRect.Bottom)
if ($ClickX -ge 0 -and $ClickY -ge 0) {
 if ($ClickX -ge ($pgRect.Right-$pgRect.Left) -or $ClickY -ge ($pgRect.Bottom-$pgRect.Top)) { throw 'Click outside pgAdmin' }
 [void][PgAdminScreen]::SetCursorPos($pgRect.Left+$ClickX,$pgRect.Top+$ClickY)
 Start-Sleep -Milliseconds 350
 [PgAdminScreen]::mouse_event(2,0,0,0,[UIntPtr]::Zero)
 Start-Sleep -Milliseconds 80
 [PgAdminScreen]::mouse_event(4,0,0,0,[UIntPtr]::Zero)
}
if ($SecondX -ge 0 -and $SecondY -ge 0) {
 Start-Sleep -Milliseconds 450
 [void][PgAdminScreen]::SetCursorPos($pgRect.Left+$SecondX,$pgRect.Top+$SecondY)
 Start-Sleep -Milliseconds 350
 [PgAdminScreen]::mouse_event(2,0,0,0,[UIntPtr]::Zero)
 Start-Sleep -Milliseconds 80
 [PgAdminScreen]::mouse_event(4,0,0,0,[UIntPtr]::Zero)
}
if ($Keys) { [System.Windows.Forms.SendKeys]::SendWait($Keys) }
Start-Sleep -Milliseconds 1100
$pgBitmap = New-Object System.Drawing.Bitmap(($pgRect.Right-$pgRect.Left),($pgRect.Bottom-$pgRect.Top))
$pgGraphics = [System.Drawing.Graphics]::FromImage($pgBitmap)
$pgGraphics.CopyFromScreen($pgRect.Left,$pgRect.Top,0,0,$pgBitmap.Size)
$pgFile=Join-Path $PSScriptRoot '..\data\pgadmin-current-screen.png'
$pgBitmap.Save([System.IO.Path]::GetFullPath($pgFile))
$pgGraphics.Dispose();$pgBitmap.Dispose()
Write-Output 'pgAdmin screen captured.'
