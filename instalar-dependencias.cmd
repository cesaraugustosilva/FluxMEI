@echo off
setlocal
cd /d "%~dp0backend"

echo Instalando dependencias do FluxMEI...
npm.cmd install

if errorlevel 1 (
  echo.
  echo Nao foi possivel instalar as dependencias.
  pause
  exit /b 1
)

echo.
echo Dependencias instaladas com sucesso.
pause
