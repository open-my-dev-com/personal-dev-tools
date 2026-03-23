@echo off
cd /d "%~dp0"

where python >nul 2>&1
if %errorlevel% neq 0 (
    echo Python이 설치되어 있지 않습니다.
    echo https://www.python.org/downloads/ 에서 설치해주세요.
    pause
    exit /b 1
)

if not exist ".venv" (
    echo 가상 환경을 생성합니다...
    python -m venv .venv
)

call .venv\Scripts\activate

echo 서버를 시작합니다...
echo 종료하려면 이 창에서 Ctrl+C 를 누르거나 창을 닫으세요.
echo.
python server.py
