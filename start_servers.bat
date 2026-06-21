@echo off
REM ============================================================================
REM  PCH Framework — Start Both Servers (Backend + Frontend)
REM  Double-click this file from the project root to launch everything.
REM
REM  FIRST RUN:  ~5-10 min (builds Docker images, downloads dependencies)
REM  NEXT RUNS:  ~15-30 sec (uses cached images, just starts containers)
REM ============================================================================
setlocal enabledelayedexpansion

title PCH Framework — Server Launcher

REM --- Configuration ---
set "PROJECT_DIR=%~dp0"
set "COMPOSE_FILE=%PROJECT_DIR%infra\docker-compose.yml"
set "FRONTEND_DIR=%PROJECT_DIR%frontend"
set "FRONTEND_PORT=3001"
set "BACKEND_PORT=8000"
set "MAX_WAIT_DOCKER=120"
set "MAX_WAIT_BACKEND=120"

echo.
echo  ============================================================
echo   Predictive Consistent Hashing — Server Launcher
echo  ============================================================
echo.

REM ============================================================================
REM  STEP 1: Quick prerequisite check
REM ============================================================================

echo [1/6] Checking prerequisites...

where docker >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo  [ERROR] Docker not found. Install Docker Desktop: https://docker.com
    pause & exit /b 1
)

where node >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo  [ERROR] Node.js not found. Install from: https://nodejs.org
    pause & exit /b 1
)

if not exist "%PROJECT_DIR%.env" (
    if exist "%PROJECT_DIR%.env.example" (
        copy "%PROJECT_DIR%.env.example" "%PROJECT_DIR%.env" >nul
        echo   [OK] Created .env from .env.example
    )
)

echo   [OK] All prerequisites found
echo.

REM ============================================================================
REM  STEP 2: Ensure Docker Desktop is running
REM ============================================================================

echo [2/6] Ensuring Docker Desktop is running...

docker info >nul 2>&1
if %ERRORLEVEL% equ 0 (
    echo   [OK] Docker daemon already running — skipping startup wait
    echo.
    goto docker_ready
)

echo   Docker daemon not responding. Launching Docker Desktop...
start "" "C:\Program Files\Docker\Docker\Docker Desktop.exe" 2>nul

set "DOCKER_WAIT=0"
:docker_wait_loop
if !DOCKER_WAIT! geq %MAX_WAIT_DOCKER% (
    echo.
    echo  [ERROR] Docker Desktop did not start within %MAX_WAIT_DOCKER%s.
    echo          Please start Docker Desktop manually and re-run this script.
    pause & exit /b 1
)
timeout /t 5 /nobreak >nul
set /a DOCKER_WAIT+=5

docker info >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo   ... waiting for Docker daemon (!DOCKER_WAIT!s / %MAX_WAIT_DOCKER%s^)
    goto docker_wait_loop
)

echo   [OK] Docker Desktop is ready (took !DOCKER_WAIT!s^)
echo.

:docker_ready

REM ============================================================================
REM  STEP 3: Check if backend containers already running
REM ============================================================================

echo [3/6] Checking backend containers...

REM Check if containers exist but are stopped
docker compose -f "%COMPOSE_FILE%" ps -q 2>nul | findstr /r "." >nul 2>&1
if %ERRORLEVEL% equ 0 (
    echo   Containers exist. Rebuilding and starting to apply any local code changes...
    docker compose -f "%COMPOSE_FILE%" up -d --build 2>&1
    goto wait_for_backend
)

REM ============================================================================
REM  STEP 4: Build & start backend (only on first run or after down -v)
REM ============================================================================

echo   No existing containers. Building images (first-time setup)...
echo   This will take several minutes. Subsequent runs will be fast.
echo.

docker compose -f "%COMPOSE_FILE%" up -d --build 2>&1
if %ERRORLEVEL% neq 0 (
    echo.
    echo  [ERROR] Docker Compose failed. Check errors above.
    echo          Logs: docker compose -f infra/docker-compose.yml logs --tail 30
    pause & exit /b 1
)

:wait_for_backend
echo.
echo   Waiting for coordinator health check...

set "BACKEND_WAIT=0"
:backend_wait_loop
if !BACKEND_WAIT! geq %MAX_WAIT_BACKEND% (
    echo   [WARN] Health check timed out. Services may still be starting.
    echo          Check: docker compose -f infra/docker-compose.yml ps
    goto skip_backend_start
)
timeout /t 3 /nobreak >nul
set /a BACKEND_WAIT+=3

curl -s -o nul -w "%%{http_code}" http://localhost:%BACKEND_PORT%/health 2>nul | findstr "200" >nul 2>&1
if %ERRORLEVEL% equ 0 (
    echo   [OK] Coordinator API healthy (took !BACKEND_WAIT!s^)
    goto skip_backend_start
)

echo   ... coordinator starting (!BACKEND_WAIT!s / %MAX_WAIT_BACKEND%s^)
goto backend_wait_loop

:skip_backend_start
echo.

REM ============================================================================
REM  STEP 5: Install frontend deps (if needed) & start frontend
REM ============================================================================

echo [4/6] Checking frontend...

if not exist "%FRONTEND_DIR%\node_modules" (
    echo   Installing npm dependencies - first-time only...
    pushd "%FRONTEND_DIR%"
    call npm install
    if %ERRORLEVEL% neq 0 (
        echo  [ERROR] npm install failed.
        popd & pause & exit /b 1
    )
    popd
    echo   [OK] Dependencies installed
) else (
    echo   [OK] node_modules present
)
echo.

echo [5/6] Starting frontend...

REM Kill any existing frontend on the port
for /f "tokens=5" %%p in ('netstat -ano 2^>nul ^| findstr ":%FRONTEND_PORT% " ^| findstr "LISTENING"') do (
    taskkill /F /PID %%p >nul 2>&1
)

pushd "%FRONTEND_DIR%"
start "PCH Frontend" cmd /k "title PCH Frontend [localhost:%FRONTEND_PORT%] && npx next dev -p %FRONTEND_PORT%"
popd

echo   [OK] Frontend starting in new terminal window
echo.

REM Brief wait for Next.js compilation
timeout /t 5 /nobreak >nul

REM ============================================================================
REM  STEP 6: Done — show summary & open browser
REM ============================================================================

echo [6/6] All services launched!
echo.
echo  +------------------------------------------------------------+
echo  ^|  PCH Framework — Running Services                          ^|
echo  +------------------------------------------------------------+
echo  ^|                                                            ^|
echo  ^|  Dashboard:       http://localhost:%FRONTEND_PORT%                  ^|
echo  ^|  API:             http://localhost:%BACKEND_PORT%                  ^|
echo  ^|  Swagger Docs:    http://localhost:%BACKEND_PORT%/docs             ^|
echo  ^|  Prometheus:      http://localhost:9090                    ^|
echo  ^|  Grafana:         http://localhost:3000  (admin/admin)     ^|
echo  ^|                                                            ^|
echo  +------------------------------------------------------------+
echo  ^|  Stop: run stop_servers.bat or Ctrl+C in frontend window  ^|
echo  +------------------------------------------------------------+
echo.

REM Open dashboard
start "" "http://localhost:%FRONTEND_PORT%"

echo Press any key to close this launcher (servers keep running)...
pause >nul
