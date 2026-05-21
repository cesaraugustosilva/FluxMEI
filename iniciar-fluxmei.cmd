@echo off
setlocal
cd /d "%~dp0backend"

if not exist ".env" (
  echo Arquivo backend\.env nao encontrado.
  echo Copie backend\.env.example para backend\.env e preencha as chaves antes de iniciar.
  pause
  exit /b 1
)

start "" "http://localhost:3002"
npm.cmd start
