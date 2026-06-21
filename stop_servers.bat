@echo off
REM ============================================================================
REM  PCH Framework — Stop All Servers
REM ============================================================================
setlocal

set "PROJECT_DIR=%~dp0"
set "COMPOSE_FILE=%PROJECT_DIR%infra\docker-compose.yml"

echo.
echo  ============================================================
echo   PCH Framework — Stopping All Services
echo  ============================================================
echo.

REM --- Stop Frontend (kill any Next.js dev server on port 3001) ---
echo [1/2] Stopping frontend...
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":3001 " ^| findstr "LISTENING" 2^>nul') do (
    taskkill /F /PID %%p >nul 2>&1
)
echo   [OK] Frontend stopped
echo.

REM --- Stop Backend (Docker Compose) ---
echo [2/2] Stopping backend containers...
docker compose -f "%COMPOSE_FILE%" down
echo   [OK] Backend stopped
echo.

echo  All services stopped.
echo.
echo  To also remove stored data (volumes), run:
echo    docker compose -f infra/docker-compose.yml down -v
echo.
pause
