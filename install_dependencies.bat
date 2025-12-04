@echo off
echo Setting up environment...
cd /d "%~dp0"

if not exist "venv" (
    echo Creating virtual environment...
    python -m venv venv
) else (
    echo Virtual environment already exists.
)

call venv\Scripts\activate
echo Virtual Environment Activated.

echo Installing/Updating dependencies...
pip install -r requirements.txt

echo Setup complete! You can now run 'run_backend.bat'.
pause
