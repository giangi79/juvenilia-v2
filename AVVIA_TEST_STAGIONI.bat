@echo off
setlocal
cd /d "%~dp0"

where py >nul 2>nul
if %errorlevel%==0 (
  start "" "http://localhost:8000/admin.html"
  py -m http.server 8000
  goto :end
)

where python >nul 2>nul
if %errorlevel%==0 (
  start "" "http://localhost:8000/admin.html"
  python -m http.server 8000
  goto :end
)

echo Python non trovato.
echo Apri questa cartella con Visual Studio Code e usa l'estensione Live Server.
pause

:end
endlocal
