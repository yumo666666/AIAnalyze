@echo off
echo Starting Backend...
cd /d "%~dp0backend"

if not exist "..\venv" (
    echo Creating virtual environment...
    python -m venv ..\venv
)

call ..\venv\Scripts\activate
echo Virtual Environment Activated.

echo Installing dependencies...
pip install -r requirements.txt

echo Starting server...
python main.py
pause
