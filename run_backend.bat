@echo off
echo Starting Backend...
cd /d "%~dp0"

if not exist "venv" (
    echo Error: Virtual environment not found!
    echo Please run 'install_dependencies.bat' first to set up the environment.
    pause
    exit /b
)

call venv\Scripts\activate
echo Virtual Environment Activated.

echo Starting server...
cd backend
python main.py
pause
