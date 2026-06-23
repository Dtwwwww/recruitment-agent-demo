@echo off
cd /d "%~dp0"

echo ============================================
echo   Recruitment AI Agent - Quick Start
echo ============================================
echo.

:: --- Docker ---
echo [1/3] Starting databases...
docker compose up -d postgres redis
echo   Waiting for PostgreSQL...
:wait_db
docker exec recruit-db pg_isready -U recruit -d recruitment >nul 2>&1
if errorlevel 1 (timeout /t 2 /nobreak >nul & goto wait_db)
echo   OK
echo.

:: --- Backend (new window) ---
echo [2/3] Starting backend...
start "Backend" cmd /k "cd /d %~dp0backend && %~dp0venv\Scripts\python.exe run_backend.py && pause"

:: --- Frontend (new window) ---
echo [3/3] Starting frontend...
start "Frontend" cmd /k "cd /d %~dp0frontend && npm run dev && pause"

echo.
echo ============================================
echo   Opening browser in 5 seconds...
echo ============================================
timeout /t 5 /nobreak >nul
start http://localhost:3000

pause
