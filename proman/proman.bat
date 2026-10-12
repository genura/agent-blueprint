@echo off
set "PROJ_DIR=%~dp0"
set "PROJ_DIR=%PROJ_DIR:~0,-1%"

:: Windows Terminal varsa WT ile, yoksa standart PowerShell ile Yonetici Olarak baslat
powershell.exe -NoProfile -Command "if (Get-Command wt.exe -ErrorAction SilentlyContinue) { Start-Process wt.exe -ArgumentList '-w -1 --size 100,50 --title \"PROMAN v2.0 - Process Monitor\" -d \"%PROJ_DIR%\" powershell.exe -Command \"python proman.py\"' -Verb RunAs } else { Start-Process powershell.exe -ArgumentList '-Command', \"Set-Location -LiteralPath '%PROJ_DIR%'; python proman.py\" -Verb RunAs }"
exit
