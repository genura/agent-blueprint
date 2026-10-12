# Modern Windows "Klasor sec" penceresi (Explorer tarzi IFileOpenDialog, FOS_PICKFOLDERS).
# Secilen klasorun tam yolunu stdout'a yazar; iptalde bos cikar.
# Kullanim: powershell -NoProfile -STA -File folder-picker.ps1 -Start "C:\yol" [-DryRun]
param([string]$Start = '', [switch]$DryRun)

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Windows.Forms

Add-Type -ReferencedAssemblies System.Windows.Forms, System.Drawing -TypeDefinition @'
using System;
using System.Drawing;
using System.Runtime.InteropServices;
using System.Windows.Forms;

public static class FolderPicker
{
    [ComImport, Guid("DC1C5A9C-E88A-4dde-A5A1-60F82A20AEF7")]
    private class FileOpenDialogRCW { }

    // Vtable sirasi onemli: IModalWindow.Show, ardindan IFileDialog metotlari
    [ComImport, Guid("42f85136-db7e-439c-85f1-e4075d135fc8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IFileOpenDialog
    {
        [PreserveSig] int Show(IntPtr parent);
        void SetFileTypes();
        void SetFileTypeIndex();
        void GetFileTypeIndex();
        void Advise();
        void Unadvise();
        void SetOptions(uint fos);
        void GetOptions(out uint fos);
        void SetDefaultFolder(IShellItem psi);
        void SetFolder(IShellItem psi);
        void GetFolder();
        void GetCurrentSelection();
        void SetFileName();
        void GetFileName();
        void SetTitle([MarshalAs(UnmanagedType.LPWStr)] string title);
        void SetOkButtonLabel([MarshalAs(UnmanagedType.LPWStr)] string text);
        void SetFileNameLabel();
        void GetResult(out IShellItem ppsi);
    }

    [ComImport, Guid("43826D1E-E718-42EE-BC55-A1E261C37BFE"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IShellItem
    {
        void BindToHandler();
        void GetParent();
        void GetDisplayName(uint sigdn, out IntPtr name);
        void GetAttributes();
        void Compare();
    }

    [DllImport("shell32.dll", CharSet = CharSet.Unicode, PreserveSig = false)]
    private static extern void SHCreateItemFromParsingName(string path, IntPtr pbc, ref Guid riid, out IShellItem item);

    [DllImport("user32.dll")]
    private static extern bool SetForegroundWindow(IntPtr hWnd);

    private const uint FOS_PICKFOLDERS = 0x20, FOS_FORCEFILESYSTEM = 0x40, FOS_PATHMUSTEXIST = 0x800;
    private const uint SIGDN_FILESYSPATH = 0x80058000;
    private const int ERROR_CANCELLED = unchecked((int)0x800704C7);

    private static IFileOpenDialog Create(string start)
    {
        var dlg = (IFileOpenDialog)new FileOpenDialogRCW();
        uint fos;
        dlg.GetOptions(out fos);
        dlg.SetOptions(fos | FOS_PICKFOLDERS | FOS_FORCEFILESYSTEM | FOS_PATHMUSTEXIST);
        dlg.SetTitle("Sema (.flow) klasoru sec");
        dlg.SetOkButtonLabel("Klasoru sec");
        if (!string.IsNullOrEmpty(start) && System.IO.Directory.Exists(start))
        {
            var iid = typeof(IShellItem).GUID;
            IShellItem item;
            SHCreateItemFromParsingName(start, IntPtr.Zero, ref iid, out item);
            dlg.SetFolder(item);
        }
        return dlg;
    }

    // Pencereyi derlemeden/acmadan kontrol icin
    public static string DryRun(string start)
    {
        Create(start);
        return "ok";
    }

    public static string Pick(string start)
    {
        var dlg = Create(start);
        // Tarayicinin arkasinda kalmasin: gorunmez, en ustte bir sahip pencere
        var owner = new Form
        {
            TopMost = true, ShowInTaskbar = false, FormBorderStyle = FormBorderStyle.None,
            StartPosition = FormStartPosition.Manual, Location = new Point(-32000, -32000), Size = new Size(1, 1)
        };
        owner.Show();
        SetForegroundWindow(owner.Handle);
        try
        {
            int hr = dlg.Show(owner.Handle);
            if (hr == ERROR_CANCELLED) return "";
            if (hr != 0) Marshal.ThrowExceptionForHR(hr);
            IShellItem item;
            dlg.GetResult(out item);
            IntPtr p;
            item.GetDisplayName(SIGDN_FILESYSPATH, out p);
            string path = Marshal.PtrToStringUni(p);
            Marshal.FreeCoTaskMem(p);
            return path;
        }
        finally
        {
            owner.Close();
        }
    }
}
'@

if ($DryRun) { [Console]::Out.Write([FolderPicker]::DryRun($Start)) }
else { [Console]::Out.Write([FolderPicker]::Pick($Start)) }
