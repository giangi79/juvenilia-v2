@echo off
setlocal
title Juvenilia V2 - Deploy funzione risultati

echo ============================================================
echo   Juvenilia V2 - Installazione funzione risultati
echo ============================================================
echo.

where npx >nul 2>nul
if errorlevel 1 (
  echo ERRORE: npx non trovato.
  echo Installa Node.js LTS da https://nodejs.org/ e riprova.
  pause
  exit /b 1
)

set PROJECT_REF=jnfnfszekfstuoiemkgf
set /p PROJECT_REF_INPUT=Project Ref [%PROJECT_REF%] - premi Invio per confermare: 
if not "%PROJECT_REF_INPUT%"=="" set PROJECT_REF=%PROJECT_REF_INPUT%

echo.
echo Accesso a Supabase...
call npx supabase@latest login
if errorlevel 1 goto :errore

echo.
echo Collegamento al progetto...
call npx supabase@latest link --project-ref %PROJECT_REF%
if errorlevel 1 goto :errore

echo.
echo Pubblicazione della funzione results-import...
call npx supabase@latest functions deploy results-import --no-verify-jwt
if errorlevel 1 goto :errore

echo.
echo INSTALLAZIONE COMPLETATA.
echo Ora puoi usare il pulsante Analizza risultati nell'Area Admin.
pause
exit /b 0

:errore
echo.
echo INSTALLAZIONE NON COMPLETATA. Controlla il messaggio sopra.
pause
exit /b 1
