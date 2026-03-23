#!/bin/bash
cd "$(dirname "$0")"

if ! command -v python3 &>/dev/null; then
    echo "Python3이 설치되어 있지 않습니다."
    echo "https://www.python.org/downloads/ 에서 설치해주세요."
    read -p "아무 키나 누르면 종료합니다..."
    exit 1
fi

if [ ! -d ".venv" ]; then
    echo "가상 환경을 생성합니다..."
    python3 -m venv .venv
fi

source .venv/bin/activate

echo "서버를 시작합니다..."
echo "종료하려면 이 창에서 Ctrl+C 를 누르세요."
echo ""
python3 server.py
