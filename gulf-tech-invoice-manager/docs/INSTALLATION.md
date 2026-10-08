# Installation Guide

## System requirements

- Windows 10 (version 1809 or later) or Windows 11, 64-bit
- 4 GB RAM (8 GB recommended), 300 MB free disk space
- A printer and/or PDF viewer if you want to print invoices
- No internet connection is required to run the application

## Install with the setup file

1. Copy `GulfTechInvoiceManager-Setup-<version>.exe` to the computer.
2. Double-click the file. If Windows SmartScreen shows "Windows protected your PC",
   click **More info** and then **Run anyway**. This warning appears because the
   installer is not code-signed by a commercial certificate authority.
3. Choose the installation folder (the default is per-user, so administrator rights
   are not needed) and click **Install**.
4. Tick **Run** on the final page, or open the application from the desktop or
   Start menu shortcut.

## Portable version

Run `GulfTechInvoiceManager-<version>-portable.exe` directly from any folder,
including a USB drive. Data is still stored on the computer in the user data folder
(see below), not next to the executable.

## Where your data is stored

| Item | Location |
|---|---|
| Database (encrypted) | `%APPDATA%\Gulf Tech Dubai Invoice Manager\data\gulftech-invoices.db` |
| Database key (protected by Windows DPAPI) | `%APPDATA%\Gulf Tech Dubai Invoice Manager\data\keystore.json` |
| Automatic and manual backups (default) | `%APPDATA%\Gulf Tech Dubai Invoice Manager\backups\` |
| Application log | `%APPDATA%\Gulf Tech Dubai Invoice Manager\logs\app.log` |

You can change the backup folder and the PDF output folder in **Settings**.

Copy the `data` folder and the backups to another drive regularly. The database key
is protected by your Windows user account, so a copy of `gulftech-invoices.db` alone
can only be opened on this computer under this Windows user. For portability, use a
**ZIP or JSON backup** (see the user manual), which can be restored on another computer.

## Uninstall

Open **Settings → Apps → Gulf Tech Dubai Invoice Manager → Uninstall**. The uninstaller
removes the program files. Your data folder in `%APPDATA%` is kept so you do not lose
records by accident; delete it manually if you no longer need it.

## Troubleshooting

- **Application does not start:** check `logs\app.log` in the user data folder. Reinstall
  using the latest setup file.
- **"Data could not be decrypted":** the database key belongs to another Windows user or
  computer. Restore a ZIP or JSON backup from that computer instead of copying the raw
  database file.
- **Forgot the PIN:** there is no online recovery (the app is fully offline). Restore
  a backup, or delete the PIN from **Settings → Security** if you can still open the app.
