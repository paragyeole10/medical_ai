@echo off
title MedVision AI Launcher
echo ===================================================
echo   MedVision AI - Clinical Diagnosis Console Launcher
echo ===================================================
echo.

:: Check for backend virtual env
if not exist "backend\venv" (
    echo [ERROR] Python virtual environment not found in backend\venv.
    echo Please run backend setup first.
    pause
    exit /b
)

echo [1/2] Starting FastAPI Backend on http://127.0.0.1:8000...
start "MedVision Backend" cmd /k "cd backend && venv\Scripts\python -m uvicorn main:app --host 127.0.0.1 --port 8000"

echo [2/2] Starting React Vite Frontend on http://localhost:5173...
start "MedVision Frontend" cmd /k "cd frontend && npm run dev"

echo.
echo ===================================================
echo MedVision AI is launching successfully!
echo   - Interactive UI:  http://localhost:5173
echo   - Backend Service: http://127.0.0.1:8000
echo ===================================================
echo.
pause
